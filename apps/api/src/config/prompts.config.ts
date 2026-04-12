/**
 * Central repository for all Claude prompt templates.
 *
 * Rules:
 *  - Every string passed to the Anthropic SDK MUST originate from this file.
 *  - Each builder function is pure — no side effects, no imports from services.
 *  - Add JSDoc to each export describing the expected model output format.
 */

// ── Types shared across prompts ───────────────────────────────────────────────

export interface RubricDimensionInput {
  name: string
  description: string
}

export interface DimensionScoreInput {
  dimension: string
  score: number
  quality: string
}

export interface DecisionContextInput {
  narrative: string
  choices: { id: string; text: string }[]
  chosenId: string
}

export interface ImmersiveResponseInput {
  questionText: string
  transcript: string
}

// ── Text simulation feedback ──────────────────────────────────────────────────

/**
 * Builds the prompt for evaluating a candidate's choices in the text-based
 * simulation.
 *
 * Expected output: JSON object matching:
 * {
 *   "dimensions": [
 *     { "dimension": "<name>", "feedback": "<2-3 sentences>" },
 *     ...
 *   ]
 * }
 */
export function buildSimulationFeedbackPrompt(
  rubricDimensions: RubricDimensionInput[],
  dimensionScores: DimensionScoreInput[],
  decisions: DecisionContextInput[],
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

// ── Immersive interview — per-response feedback ───────────────────────────────

/**
 * Builds the prompt for evaluating a single spoken response in immersive
 * interview mode. Feedback mirrors what a real interviewer would say.
 *
 * Expected output: JSON object matching:
 * { "feedback": "<3-4 sentences>", "strengths": "<1 sentence>", "development": "<1 sentence>" }
 */
export function buildInterviewerFeedbackPrompt(
  questionText: string,
  transcript: string,
): string {
  return `You are an experienced hiring manager giving feedback on a candidate's verbal interview response. Be direct, specific, and constructive — mirror how a real interviewer would assess this answer.

## Interview Question
${questionText}

## Candidate's Response (transcribed)
${transcript.trim() || '[No response provided]'}

## Task
Evaluate the response as a real interviewer would. Consider: structure and clarity, relevance to the question, use of specific examples, depth of insight, and anything important that was omitted.

Respond in this exact JSON format (no markdown, no extra text):
{
  "feedback": "<3-4 sentences of overall assessment referencing specific things said or omitted>",
  "strengths": "<1 sentence on what worked well>",
  "development": "<1 sentence on the most important thing to improve>"
}`
}

// ── Immersive interview — overall session summary ─────────────────────────────

/**
 * Builds the prompt for generating an overall interview performance summary
 * after all questions have been answered.
 *
 * Expected output: JSON object matching:
 * {
 *   "overallAssessment": "<2-3 sentences>",
 *   "strengths": ["<point>", ...],
 *   "developmentAreas": ["<point>", ...],
 *   "hiringRecommendation": "strong yes" | "yes" | "maybe" | "no"
 * }
 */
export function buildInterviewSummaryPrompt(
  responses: ImmersiveResponseInput[],
): string {
  const responsesSection = responses
    .map((r, i) => {
      return `Question ${i + 1}: ${r.questionText}\nResponse: ${r.transcript.trim() || '[No response provided]'}`
    })
    .join('\n\n')

  return `You are a senior hiring manager synthesising a complete interview assessment after reviewing all candidate responses.

## Full Interview Transcript
${responsesSection}

## Task
Provide an overall interview performance summary. Be honest and specific — this assessment will be used for candidate development and hiring decisions.

Respond in this exact JSON format (no markdown, no extra text):
{
  "overallAssessment": "<2-3 sentences summarising overall performance>",
  "strengths": ["<specific strength>", "<specific strength>"],
  "developmentAreas": ["<specific area>", "<specific area>"],
  "hiringRecommendation": "<one of: strong yes | yes | maybe | no>"
}`
}
