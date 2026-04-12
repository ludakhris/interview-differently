import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'
import {
  buildSimulationFeedbackPrompt,
  type RubricDimensionInput,
  type DimensionScoreInput,
  type DecisionContextInput,
} from '../config/prompts.config'

export interface AiFeedbackResult {
  dimensions: { dimension: string; feedback: string }[]
  generatedAt: string
}

@Injectable()
export class AiFeedbackService {
  private readonly logger = new Logger(AiFeedbackService.name)
  private readonly client = new Anthropic()

  async generateFeedback(
    rubricDimensions: RubricDimensionInput[],
    dimensionScores: DimensionScoreInput[],
    decisions: DecisionContextInput[],
    timeoutMs = 25000,
  ): Promise<AiFeedbackResult> {
    const prompt = buildSimulationFeedbackPrompt(rubricDimensions, dimensionScores, decisions)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const message = await this.client.messages.create(
        {
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: controller.signal },
      )
      clearTimeout(timer)
      const text = message.content[0].type === 'text' ? message.content[0].text : ''
      return this.parseResponse(text, rubricDimensions)
    } catch (err) {
      clearTimeout(timer)
      this.logger.warn(`AI feedback failed: ${(err as Error).message}`)
      throw err
    }
  }

  private parseResponse(text: string, rubricDimensions: RubricDimensionInput[]): AiFeedbackResult {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned) as { dimensions: { dimension: string; feedback: string }[] }
    const resultMap = new Map(parsed.dimensions.map((d) => [d.dimension, d.feedback]))
    const dimensions = rubricDimensions.map((rd) => ({
      dimension: rd.name,
      feedback: resultMap.get(rd.name) ?? '',
    }))
    return { dimensions, generatedAt: new Date().toISOString() }
  }
}
