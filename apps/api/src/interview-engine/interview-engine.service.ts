import Anthropic from '@anthropic-ai/sdk'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { buildAnswerScoringPrompt, type RubricDimensionInput } from '../config/prompts.config'
import {
  DEFAULT_RUBRIC,
  parseAnswerScores,
  scoringMaxTokens,
  type ScoredAnswer,
} from './interview-engine'

const TIMEOUT_MS = 30000

/**
 * Scores typed interview answers against rubric dimensions with Claude. The one
 * scoring engine for Interview Differently and LearnDifferently. Created lazily,
 * so the app boots without a key.
 */
@Injectable()
export class InterviewEngineService {
  private readonly logger = new Logger(InterviewEngineService.name)
  private client: Anthropic | null = null

  async scoreAnswers(input: {
    role: string
    rubric?: RubricDimensionInput[]
    questions: string[]
    answers: string[]
  }): Promise<ScoredAnswer[]> {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new BadGatewayException('Interview scoring is not set up on this server.')
    }
    const rubric = input.rubric && input.rubric.length > 0 ? input.rubric : DEFAULT_RUBRIC
    this.client ??= new Anthropic()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const message = await this.client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: scoringMaxTokens(input.questions.length, rubric.length),
          messages: [
            {
              role: 'user',
              content: buildAnswerScoringPrompt(input.role, rubric, input.questions, input.answers),
            },
          ],
        },
        { signal: controller.signal }
      )
      const text = message.content[0]?.type === 'text' ? message.content[0].text : ''
      return parseAnswerScores(text, input.questions.length, rubric)
    } catch (err) {
      if (err instanceof BadGatewayException) throw err
      this.logger.warn(`Interview scoring failed: ${(err as Error).message}`)
      throw new BadGatewayException('Could not score your answers right now. Try again.')
    } finally {
      clearTimeout(timer)
    }
  }
}
