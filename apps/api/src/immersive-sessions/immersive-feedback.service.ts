import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildInterviewerFeedbackPrompt,
  buildInterviewSummaryPrompt,
  type ImmersiveResponseInput,
} from '../config/prompts.config'

export interface ResponseFeedbackResult {
  feedback: string
  strengths: string
  development: string
  generatedAt: string
}

export interface SessionSummaryResult {
  overallAssessment: string
  strengths: string[]
  developmentAreas: string[]
  hiringRecommendation: 'strong yes' | 'yes' | 'maybe' | 'no'
  generatedAt: string
}

@Injectable()
export class ImmersiveFeedbackService {
  private readonly logger = new Logger(ImmersiveFeedbackService.name)
  private readonly client = new Anthropic()

  async generateResponseFeedback(
    questionText: string,
    transcript: string,
    timeoutMs = 20000,
  ): Promise<ResponseFeedbackResult> {
    const prompt = buildInterviewerFeedbackPrompt(questionText, transcript)
    return this.callClaude<ResponseFeedbackResult>(prompt, 512, timeoutMs)
  }

  async generateSessionSummary(
    responses: ImmersiveResponseInput[],
    timeoutMs = 30000,
  ): Promise<SessionSummaryResult> {
    const prompt = buildInterviewSummaryPrompt(responses)
    return this.callClaude<SessionSummaryResult>(prompt, 1024, timeoutMs)
  }

  private async callClaude<T>(prompt: string, maxTokens: number, timeoutMs: number): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const message = await this.client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal },
      )
      clearTimeout(timer)
      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      return { ...(JSON.parse(cleaned) as T), generatedAt: new Date().toISOString() }
    } catch (err) {
      clearTimeout(timer)
      this.logger.warn(`Immersive AI call failed: ${(err as Error).message}`)
      throw err
    }
  }
}
