import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { createHash } from 'crypto'
import type { ScenarioMediaAsset } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { DidService } from '../did/did.service'
import { MEDIA_STORAGE, type MediaStorage } from './storage/media-storage.interface'

const RENDER_TIMEOUT_MS = 180_000   // 180s — D-ID typically renders in 30–60s
const POLL_INTERVAL_MS = 2_000      // 2s

interface ScenarioNodeShape {
  nodeId: string
  type: string
  audioScript?: string
  narrative?: string
}

interface ScenarioShape {
  scenarioId: string
  mode?: 'text' | 'immersive'
  interviewer?: { presenterId: string; voiceId: string }
  nodes: ScenarioNodeShape[]
}

@Injectable()
export class ScenarioMediaService {
  private readonly logger = new Logger(ScenarioMediaService.name)

  constructor(
    private prisma: PrismaService,
    private didService: DidService,
    @Inject(MEDIA_STORAGE) private storage: MediaStorage,
  ) {}

  async listForScenario(scenarioId: string): Promise<ScenarioMediaAsset[]> {
    return this.prisma.scenarioMediaAsset.findMany({
      where: { scenarioId },
      orderBy: { nodeId: 'asc' },
    })
  }

  async deleteAsset(scenarioId: string, nodeId: string): Promise<void> {
    const existing = await this.prisma.scenarioMediaAsset.findUnique({
      where: { scenarioId_nodeId: { scenarioId, nodeId } },
    })
    if (!existing) return
    if (existing.mediaUrl) {
      // Best-effort: derive storage key from the URL pattern we control.
      const key = this.keyForAsset(scenarioId, nodeId, existing.scriptHash)
      await this.storage.delete(key).catch(() => {/* ignore */})
    }
    await this.prisma.scenarioMediaAsset.delete({
      where: { scenarioId_nodeId: { scenarioId, nodeId } },
    })
  }

  /**
   * Synchronously render one node's audio script into an MP4 and persist it.
   * Blocks the request handler — author waits in the builder. No background worker.
   * Idempotent: if a ready asset already exists with a matching script hash, returns it.
   */
  async renderNode(scenarioId: string, nodeId: string): Promise<ScenarioMediaAsset> {
    const scenario = await this.loadScenario(scenarioId)
    if (scenario.mode !== 'immersive') {
      throw new BadRequestException(`Scenario ${scenarioId} is not immersive`)
    }
    if (!scenario.interviewer?.presenterId || !scenario.interviewer?.voiceId) {
      throw new BadRequestException(
        `Scenario ${scenarioId} has no interviewer persona — set presenter and voice in the briefing first`,
      )
    }
    const node = scenario.nodes.find(n => n.nodeId === nodeId)
    if (!node) throw new NotFoundException(`Node ${nodeId} not found in scenario ${scenarioId}`)
    const script = node.audioScript?.trim() || node.narrative?.trim()
    if (!script) {
      throw new BadRequestException(`Node ${nodeId} has no audioScript or narrative to render`)
    }

    const scriptHash = createHash('sha256').update(script).digest('hex')
    const { presenterId, voiceId } = scenario.interviewer

    // Idempotency: if we already have a ready asset matching this exact (script, persona), reuse it.
    const existing = await this.prisma.scenarioMediaAsset.findUnique({
      where: { scenarioId_nodeId: { scenarioId, nodeId } },
    })
    if (
      existing?.status === 'ready' &&
      existing.scriptHash === scriptHash &&
      existing.presenterId === presenterId &&
      existing.voiceId === voiceId
    ) {
      return existing
    }

    // Mark rendering (or create row); clears prior errorMessage if retrying.
    const row = await this.prisma.scenarioMediaAsset.upsert({
      where: { scenarioId_nodeId: { scenarioId, nodeId } },
      create: {
        scenarioId, nodeId, scriptHash, presenterId, voiceId,
        status: 'rendering',
      },
      update: {
        scriptHash, presenterId, voiceId,
        status: 'rendering',
        errorMessage: null,
      },
    })

    try {
      const presenter = await this.didService.getPresenterById(presenterId)
      if (!presenter) {
        throw new BadRequestException(`Unknown presenter id: ${presenterId}`)
      }

      const { id: talkId } = await this.didService.createTalk(presenter.image_url, script, voiceId)
      this.logger.log(`Submitted D-ID talk ${talkId} for ${scenarioId}/${nodeId}`)

      const { result_url, duration } = await this.pollUntilDone(talkId)

      const mp4 = await this.downloadMp4(result_url)
      const key = this.keyForAsset(scenarioId, nodeId, scriptHash)
      const mediaUrl = await this.storage.upload(key, mp4, 'video/mp4')

      const updated = await this.prisma.scenarioMediaAsset.update({
        where: { id: row.id },
        data: {
          status: 'ready',
          mediaUrl,
          durationMs: duration ? Math.round(duration * 1000) : null,
          errorMessage: null,
        },
      })
      this.logger.log(`Rendered ${scenarioId}/${nodeId} (${mp4.length} bytes) → ${mediaUrl}`)
      return updated
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown render error'
      await this.prisma.scenarioMediaAsset.update({
        where: { id: row.id },
        data: { status: 'failed', errorMessage: message },
      })
      this.logger.error(`Render failed for ${scenarioId}/${nodeId}: ${message}`)
      throw err
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private async loadScenario(scenarioId: string): Promise<ScenarioShape> {
    const row = await this.prisma.scenario.findUnique({ where: { scenarioId } })
    if (!row) throw new NotFoundException(`Scenario ${scenarioId} not found`)
    return row.data as unknown as ScenarioShape
  }

  private async pollUntilDone(talkId: string): Promise<{ result_url: string; duration?: number }> {
    const deadline = Date.now() + RENDER_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS)
      const talk = await this.didService.getTalk(talkId)
      if (talk.status === 'done') {
        if (!talk.result_url) throw new Error(`D-ID returned done with no result_url for talk ${talkId}`)
        return { result_url: talk.result_url, duration: talk.duration }
      }
      if (talk.status === 'error' || talk.status === 'rejected') {
        const desc = typeof talk.error === 'string' ? talk.error : talk.error?.description
        throw new ServiceUnavailableException(`D-ID render ${talk.status}: ${desc ?? 'no detail'}`)
      }
    }
    throw new ServiceUnavailableException(
      `D-ID render timed out after ${RENDER_TIMEOUT_MS / 1000}s for talk ${talkId}`,
    )
  }

  private async downloadMp4(url: string): Promise<Buffer> {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to download MP4 from ${url}: ${res.status}`)
    const arrayBuf = await res.arrayBuffer()
    return Buffer.from(arrayBuf)
  }

  private keyForAsset(scenarioId: string, nodeId: string, scriptHash: string): string {
    // Short hash prefix is plenty — the (scenarioId, nodeId) tuple already disambiguates.
    return `scenarios/${scenarioId}/${nodeId}-${scriptHash.slice(0, 12)}.mp4`
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
