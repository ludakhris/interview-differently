import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { ImmersiveFeedbackService } from './immersive-feedback.service'

@Injectable()
export class ImmersiveSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly feedback: ImmersiveFeedbackService,
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
