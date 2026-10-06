import { isInterviewLike, isPracticeItem, registeredTools, toolById } from './lti-platform-config'

describe('registered tools', () => {
  it('registers an interview and an assessment on the same client, URLs and deployment', () => {
    const [interview, assessment] = [toolById('id-interview')!, toolById('id-assessment')!]
    expect(registeredTools().map((t) => t.toolId)).toEqual(['id-interview', 'id-assessment'])
    expect(assessment.name).toBe('Interview Differently assessment')
    for (const k of ['clientId', 'deploymentId', 'loginUrl', 'launchUrl', 'jwksUrl'] as const)
      expect(assessment[k]).toBe(interview[k])
  })

  it('carries the LearnDifferently-side properties', () => {
    expect(toolById('id-interview')).toMatchObject({
      kind: 'interview',
      retries: true,
      labelable: false,
    })
    expect(toolById('id-assessment')).toMatchObject({
      kind: 'assessment',
      retries: false,
      labelable: true,
    })
  })

  it('counts a native interview, or an unlabelled tool item flagged countsAsInterview, as interview-like', () => {
    expect(isInterviewLike({ type: 'interview', label: null })).toBe(true)
    expect(isInterviewLike({ type: 'tool', label: null })).toBe(false)
    expect(isInterviewLike({ type: 'tool', label: null, config: { toolId: 'x' } })).toBe(false)
    expect(
      isInterviewLike({ type: 'tool', label: null, config: { countsAsInterview: false } })
    ).toBe(false)
    expect(
      isInterviewLike({ type: 'tool', label: null, config: { countsAsInterview: true } })
    ).toBe(true)
    expect(
      isInterviewLike({ type: 'tool', label: 'pre', config: { countsAsInterview: true } })
    ).toBe(false)
    expect(isInterviewLike({ type: 'assessment', label: 'pre' })).toBe(false)
  })

  it('treats an interview or any unlabelled tool item as practice (not required)', () => {
    expect(isPracticeItem({ type: 'interview', label: null })).toBe(true)
    expect(isPracticeItem({ type: 'tool', label: null })).toBe(true)
    expect(isPracticeItem({ type: 'tool', label: 'post' })).toBe(false)
    expect(isPracticeItem({ type: 'lesson', label: null })).toBe(false)
  })
})
