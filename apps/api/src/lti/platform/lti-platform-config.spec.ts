import { isInterviewLike, registeredTools, toolById } from './lti-platform-config'

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

  it('treats a tool item as interview-like only when it has no pre/post label', () => {
    expect(isInterviewLike({ type: 'interview', label: null })).toBe(true)
    expect(isInterviewLike({ type: 'tool', label: null })).toBe(true)
    expect(isInterviewLike({ type: 'tool', label: 'pre' })).toBe(false)
    expect(isInterviewLike({ type: 'assessment', label: 'pre' })).toBe(false)
  })
})
