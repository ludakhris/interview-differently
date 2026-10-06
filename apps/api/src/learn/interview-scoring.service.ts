import Anthropic from '@anthropic-ai/sdk'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import type { InterviewAnswerResult } from './learn-types'
import { buildScoringPrompt, parseScores } from './interview-scoring'

const TIMEOUT_MS = 30000

/** Scores typed practice-interview answers with Claude. Created lazily, so the app boots without a key. */
@Injectable()
export class InterviewScoringService {
  private readonly logger = new Logger(InterviewScoringService.name)
  private client: Anthropic | null = null

  async score(
    role: string,
    questions: string[],
    answers: string[]
  ): Promise<InterviewAnswerResult[]> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadGatewayException('Practice interview scoring is not set up on this server.')
    }
    this.client ??= new Anthropic()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const message = await this.client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1200,
          messages: [{ role: 'user', content: buildScoringPrompt(role, questions, answers) }],
        },
        { signal: controller.signal }
      )
      const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
      return parseScores(text, questions.length)
    } catch (err) {
      if (err instanceof BadGatewayException) throw err
      this.logger.warn(`Interview scoring failed: ${(err as Error).message}`)
      throw new BadGatewayException('Could not score your answers right now. Try again.')
    } finally {
      clearTimeout(timer)
    }
  }
}
