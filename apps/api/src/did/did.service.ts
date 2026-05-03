import { Injectable, Logger } from '@nestjs/common'

const DID_BASE_URL = 'https://api.d-id.com'

// Curated presenters — names that render well with D-ID's clips model.
// As of 2026-05, D-ID's library has shrunk significantly: of the original 8 names
// (Amy, Noelle, Amber, Natasha, William, Ryan, Davis, Marcus), only Amber and
// William remain available. Update this set when D-ID adds presenters back.
const CURATED_PRESENTER_NAMES = new Set([
  'Amber',     // female (12 variants currently)
  'William',   // male (4 variants currently)
])

interface DIdPresenter {
  presenter_id?: string
  id?: string
  name: string
  gender: string
  image_url?: string
  preview_url?: string
  thumbnail_url?: string
}

export interface CuratedPresenter {
  id: string
  name: string
  gender: 'male' | 'female'
  image_url: string
}

@Injectable()
export class DidService {
  private readonly logger = new Logger(DidService.name)
  private readonly authHeader: string
  private presenterCache: CuratedPresenter[] | null = null

  constructor() {
    const apiKey = process.env.DID_API_KEY
    if (!apiKey) throw new Error('DID_API_KEY is not set')
    this.authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${DID_BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string>),
      },
    })
    if (!res.ok) {
      const body = await res.text()
      this.logger.error(`D-ID API ${res.status} on ${options.method ?? 'GET'} ${path}: ${body}`)
      throw new Error(`D-ID API ${res.status}: ${body}`)
    }
    return res.json() as Promise<T>
  }

  /** Returns curated stock presenters from D-ID's clips library, filtered to known-good names. */
  async getPresenters(): Promise<CuratedPresenter[]> {
    if (this.presenterCache) return this.presenterCache
    const data = await this.request<{ presenters?: DIdPresenter[] }>('/clips/presenters')
    const all: DIdPresenter[] = data.presenters ?? []
    const curated = all
      .filter(p => CURATED_PRESENTER_NAMES.has(p.name))
      .filter(p => !(p.presenter_id ?? p.id ?? '').includes('GreenScreen'))
      .map(p => ({
        id: p.presenter_id ?? p.id ?? '',
        name: p.name,
        gender: (p.gender === 'male' ? 'male' : 'female') as 'male' | 'female',
        image_url: p.image_url ?? p.preview_url ?? p.thumbnail_url ?? '',
      }))
      .filter(p => p.image_url !== '')

    // Multiple variants share the same `name` (e.g. 12 "Amber"s). Sort by id for
    // deterministic ordering, then suffix duplicates as "Amber 1", "Amber 2"… so
    // builder authors can tell them apart in the picker UI.
    curated.sort((a, b) => a.id.localeCompare(b.id))
    const counts = new Map<string, number>()
    for (const p of curated) counts.set(p.name, (counts.get(p.name) ?? 0) + 1)
    const seen = new Map<string, number>()
    for (const p of curated) {
      if ((counts.get(p.name) ?? 0) > 1) {
        const idx = (seen.get(p.name) ?? 0) + 1
        seen.set(p.name, idx)
        p.name = `${p.name} ${idx}`
      }
    }

    this.presenterCache = curated
    return curated
  }

  /** Look up a curated presenter by id; used by the pre-render pipeline to resolve source_url. */
  async getPresenterById(presenterId: string): Promise<CuratedPresenter | null> {
    const all = await this.getPresenters()
    return all.find(p => p.id === presenterId) ?? null
  }

  /**
   * Create an async clip-render job. Returns the talk id used to poll for completion.
   * This is the /talks (non-streaming) endpoint — produces an MP4 we can download and store.
   */
  async createTalk(sourceUrl: string, text: string, voiceId: string): Promise<{ id: string }> {
    return this.request('/talks', {
      method: 'POST',
      body: JSON.stringify({
        source_url: sourceUrl,
        script: {
          type: 'text',
          input: text,
          provider: { type: 'microsoft', voice_id: voiceId },
        },
        config: { stitch: true, fluent: true },
      }),
    })
  }

  /** Poll a clip-render job. `status` is 'created' | 'started' | 'done' | 'error' | 'rejected'. */
  async getTalk(talkId: string): Promise<{
    status: string
    result_url?: string
    duration?: number
    error?: { description?: string } | string
  }> {
    return this.request(`/talks/${talkId}`)
  }

  /** Create a new WebRTC streaming session using D-ID's lively (v4) animation driver. */
  async createStream(sourceUrl: string): Promise<{
    id: string
    session_id: string
    offer: RTCSessionDescriptionInit
    ice_servers: RTCIceServer[]
  }> {
    return this.request('/talks/streams', {
      method: 'POST',
      body: JSON.stringify({
        source_url: sourceUrl,
        config: { stitch: true, fluent: true },
      }),
    })
  }

  /** Forward the browser's WebRTC answer SDP to D-ID. */
  async sendAnswer(
    streamId: string,
    answer: RTCSessionDescriptionInit,
    sessionId: string,
  ): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}/sdp`, {
      method: 'POST',
      body: JSON.stringify({ answer, session_id: sessionId }),
    })
  }

  /** Forward a browser ICE candidate to D-ID. */
  async sendIceCandidate(
    streamId: string,
    candidate: string,
    sdpMid: string,
    sdpMLineIndex: number,
    sessionId: string,
  ): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}/ice`, {
      method: 'POST',
      body: JSON.stringify({ candidate, sdpMid, sdpMLineIndex, session_id: sessionId }),
    })
  }

  /** Send text for the avatar to speak. Uses Microsoft Azure TTS via D-ID. */
  async sendTalk(streamId: string, text: string, voiceId: string, sessionId: string): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}`, {
      method: 'POST',
      body: JSON.stringify({
        script: {
          type: 'text',
          input: text,
          provider: { type: 'microsoft', voice_id: voiceId },
        },
        config: { stitch: true, fluent: true },
        session_id: sessionId,
      }),
    })
  }

  /** Close and clean up the streaming session. */
  async closeStream(streamId: string, sessionId: string): Promise<unknown> {
    return this.request(`/talks/streams/${streamId}`, {
      method: 'DELETE',
      body: JSON.stringify({ session_id: sessionId }),
    })
  }
}
