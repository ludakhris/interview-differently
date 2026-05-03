import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ImmersiveFeedbackService } from './immersive-feedback.service'
import {
  PRIVATE_MEDIA_STORAGE,
  type PrivateMediaStorage,
} from '../storage/media-storage.interface'

const SIGNED_URL_TTL_SECONDS = 15 * 60   // 15 min — long enough to start playback, short enough to invalidate quickly

@Injectable()
export class ImmersiveSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedback: ImmersiveFeedbackService,
    @Inject(PRIVATE_MEDIA_STORAGE) private readonly privateStorage: PrivateMediaStorage,
  ) {}

  async createSession(scenarioId: string, userId: string) {
    return this.prisma.immersiveSession.create({
      data: { scenarioId, userId },
    })
  }

  async createResponse(
    sessionId: string,
    nodeId: string,
    questionText: string,
    mediaUrl: string | null,
    transcript: string | null,
    durationSeconds: number | null,
  ) {
    const session = await this.prisma.immersiveSession.findUnique({ where: { id: sessionId } })
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`)

    return this.prisma.immersiveResponse.create({
      data: { sessionId, nodeId, questionText, mediaUrl, transcript, durationSeconds },
    })
  }

  async updateTranscript(responseId: string, transcript: string) {
    return this.prisma.immersiveResponse.update({
      where: { id: responseId },
      data: { transcript },
    })
  }

  /**
   * Persist a response audio/video blob to private storage and store the
   * resulting key on the response row. Note: `mediaUrl` is repurposed for
   * ImmersiveResponse — it stores the storage KEY, not a URL. Resolve to a
   * playable URL via getResponseSignedUrl().
   */
  async storeResponseMedia(
    sessionId: string,
    responseId: string,
    buffer: Buffer,
    contentType: string,
    extension: string,
  ): Promise<void> {
    const key = `responses/${sessionId}/${responseId}.${extension}`
    await this.privateStorage.upload(key, buffer, contentType)
    await this.prisma.immersiveResponse.update({
      where: { id: responseId },
      data: { mediaUrl: key },
    })
  }

  /**
   * Resolve a previously-stored response into a time-limited signed URL.
   * Throws NotFoundException if the response or its media is missing.
   * Caller is responsible for the auth check before invoking.
   */
  async getResponseSignedUrl(
    sessionId: string,
    responseId: string,
  ): Promise<{ url: string; expiresAt: string }> {
    const response = await this.prisma.immersiveResponse.findFirst({
      where: { id: responseId, sessionId },
      select: { mediaUrl: true },
    })
    if (!response) throw new NotFoundException(`Response ${responseId} not found`)
    if (!response.mediaUrl) throw new NotFoundException(`Response ${responseId} has no stored media`)
    const url = await this.privateStorage.getSignedUrl(response.mediaUrl, SIGNED_URL_TTL_SECONDS)
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
    return { url, expiresAt }
  }

  /** Look up a session's owner — used by the controller's auth check. */
  async getSessionOwner(sessionId: string): Promise<string | null> {
    const session = await this.prisma.immersiveSession.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    })
    return session?.userId ?? null
  }

  async getResponse(sessionId: string, responseId: string) {
    const response = await this.prisma.immersiveResponse.findFirst({
      where: { id: responseId, sessionId },
    })
    if (!response) throw new NotFoundException(`Response ${responseId} not found`)

    if (!response.aiFeedback && response.transcript) {
      const feedbackResult = await this.feedback.generateResponseFeedback(
        response.questionText,
        response.transcript,
      )
      const updated = await this.prisma.immersiveResponse.update({
        where: { id: responseId },
        data: { aiFeedback: feedbackResult as object },
      })
      return updated
    }

    return response
  }

  async getSession(sessionId: string) {
    const session = await this.prisma.immersiveSession.findUnique({
      where: { id: sessionId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`)
    return session
  }

  async getSessionsForUser(userId: string) {
    return this.prisma.immersiveSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        scenarioId: true,
        status: true,
        createdAt: true,
        _count: { select: { responses: true } },
      },
    })
  }

  async getSessionSummary(sessionId: string) {
    const session = await this.prisma.immersiveSession.findUnique({
      where: { id: sessionId },
      include: { responses: { orderBy: { createdAt: 'asc' } } },
    })
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`)

    if (session.summary) {
      return { sessionId, ...session.summary as object }
    }

    const responsesWithTranscripts = session.responses.filter(r => r.transcript)
    const summaryResult = await this.feedback.generateSessionSummary(
      responsesWithTranscripts.map(r => ({
        questionText: r.questionText,
        transcript: r.transcript ?? '',
      })),
    )

    await this.prisma.immersiveSession.update({
      where: { id: sessionId },
      data: {
        summary: summaryResult as object,
        status: 'completed',
      },
    })

    return { sessionId, ...summaryResult }
  }
}
