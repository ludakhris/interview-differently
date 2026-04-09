import { Injectable, Logger } from '@nestjs/common'
import Anthropic from '@anthropic-ai/sdk'

interface RubricDimension { name: string; description: string }
interface DimensionScoreInput { dimension: string; score: number; quality: string }
interface DecisionContext { narrative: string; choices: { id: string; text: string }[]; chosenId: string }

export interface AiFeedbackResult {
  dimensions: { dimension: string; feedback: string }[]
  generatedAt: string
}

@Injectable()
export class AiFeedbackService {
  private readonly logger = new Logger(AiFeedbackService.name)
  private readonly client = new Anthropic()

  async generateFeedback(
    rubricDimensions: RubricDimension[],
    dimensionScores: DimensionScoreInput[],
    decisions: DecisionContext[],
    timeoutMs = 6000,
  ): Promise<AiFeedbackResult> {
    const prompt = this.buildPrompt(rubricDimensions, dimensionScores, decisions)
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

  private buildPrompt(
    rubricDimensions: RubricDimension[],
    dimensionScores: DimensionScoreInput[],
    decisions: DecisionContext[],
  ): string {
    const rubricSection = rubricDimensions
      .map((d) => {
        const score = dimensionScores.find((s) => s.dimension === d.name)
        return `- ${d.name} (${d.description}): scored ${score?.score ?? '?'}/100 — ${score?.quality ?? '?'}`
      })
      .join('\n')

    const decisionSection = decisions
      .map((d, i) => {
        const choiceText = d.choices.find((c) => c.id === d.chosenId)?.text ?? d.chosenId
        const otherChoices = d.choices
          .filter((c) => c.id !== d.chosenId)
          .map((c) => `  - ${c.id}: ${c.text}`)
          .join('\n')
        return `Decision ${i + 1}:\nSituation: ${d.narrative}\nChose ${d.chosenId}: ${choiceText}\nOther options:\n${otherChoices}`
      })
      .join('\n\n')

    return `You are evaluating a candidate's performance in a business simulation. Provide specific, actionable feedback.

## Competency Rubric
${rubricSection}

## Decisions Made
${decisionSection}

## Task
Write 2-3 sentences of specific feedback for each competency dimension listed above. Reference the actual decisions where relevant. Be honest but constructive — name what was done well or what was missed.

Respond in this exact JSON format (no markdown, no extra text):
{
  "dimensions": [
    {"dimension": "<exact dimension name>", "feedback": "<2-3 sentences>"},
    ...
  ]
}`
  }

  private parseResponse(text: string, rubricDimensions: RubricDimension[]): AiFeedbackResult {
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
