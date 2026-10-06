import { BadRequestException } from '@nestjs/common'
import { slugify, validateCourseFields, validateItemInput } from './course-config'

describe('validateCourseFields', () => {
  it('requires a title on create and trims text', () => {
    expect(() => validateCourseFields({}, false)).toThrow(BadRequestException)
    expect(validateCourseFields({ title: '  Medical Assistant  ' }, false)).toEqual({
      title: 'Medical Assistant',
    })
  })

  it('allows partial updates and clears with null or empty text', () => {
    expect(validateCourseFields({ credential: '', lengthWeeks: null }, true)).toEqual({
      credential: null,
      lengthWeeks: null,
    })
  })

  it('range-checks the numbers and status', () => {
    expect(() => validateCourseFields({ targetScore: 101 }, true)).toThrow(BadRequestException)
    expect(() => validateCourseFields({ readinessThreshold: -1 }, true)).toThrow(
      BadRequestException
    )
    expect(() => validateCourseFields({ lengthWeeks: 0 }, true)).toThrow(BadRequestException)
    expect(() => validateCourseFields({ lengthWeeks: 2.5 }, true)).toThrow(BadRequestException)
    expect(() => validateCourseFields({ status: 'live' }, true)).toThrow(BadRequestException)
    expect(validateCourseFields({ targetScore: 75, status: 'published' }, true)).toEqual({
      targetScore: 75,
      status: 'published',
    })
  })
})

describe('validateItemInput', () => {
  it('accepts a lesson and defaults the body to empty text', () => {
    expect(validateItemInput({ type: 'lesson', title: 'Vitals' })).toEqual({
      type: 'lesson',
      title: 'Vitals',
      label: null,
      config: { body: '' },
    })
  })

  it('rejects unknown types and missing titles', () => {
    expect(() => validateItemInput({ type: 'video', title: 'x' })).toThrow(BadRequestException)
    expect(() => validateItemInput({ type: 'lesson', title: ' ' })).toThrow(BadRequestException)
  })

  it('needs pre or post on an assessment and drops the label elsewhere', () => {
    expect(() => validateItemInput({ type: 'assessment', title: 'Quiz' })).toThrow(
      BadRequestException
    )
    expect(
      validateItemInput({
        type: 'assessment',
        title: 'Pre',
        label: 'pre',
        config: { assessmentSlug: 'ma-pre' },
      })
    ).toMatchObject({ label: 'pre', config: { questions: [], assessmentSlug: 'ma-pre' } })
    expect(validateItemInput({ type: 'lesson', title: 'x', label: 'pre' }).label).toBeNull()
  })

  it('checks knowledge-check questions', () => {
    const q = { prompt: 'Normal adult pulse?', options: ['20-40', '60-100'], correctIndex: 1 }
    expect(
      validateItemInput({ type: 'knowledge_check', title: 'Check', config: { questions: [q] } })
        .config
    ).toEqual({ questions: [{ ...q, id: expect.stringMatching(/^q_[0-9a-f]{8}$/) }] })
    for (const broken of [
      { ...q, options: ['only one'] },
      { ...q, correctIndex: 2 },
      { ...q, prompt: '' },
    ]) {
      expect(() =>
        validateItemInput({
          type: 'knowledge_check',
          title: 'Check',
          config: { questions: [broken] },
        })
      ).toThrow(BadRequestException)
    }
  })

  it('keeps only the fields its type uses', () => {
    expect(
      validateItemInput({
        type: 'interview',
        title: 'Practice',
        config: { role: 'Medical Assistant', questions: ['Tell me about yourself.'], extra: 1 },
      }).config
    ).toEqual({
      role: 'Medical Assistant',
      questions: ['Tell me about yourself.'],
      maxAttempts: 1,
    })
  })

  it('limits a practice interview to six questions', () => {
    const q = Array.from({ length: 7 }, (_, i) => `Question ${i}`)
    expect(() =>
      validateItemInput({ type: 'interview', title: 'P', config: { role: 'x', questions: q } })
    ).toThrow(BadRequestException)
  })
})

describe('validateItemInput scorm', () => {
  const ok = {
    packageId: '8c0f6b9e-1c2d-4e3f-9a4b-5c6d7e8f9a0b',
    entry: 'index.html',
    version: '1.2',
    files: 12,
  }
  it('accepts a package reference and rejects a made-up one', () => {
    expect(validateItemInput({ type: 'scorm', title: 'Safe lifting', config: ok }).config).toEqual(
      ok
    )
    expect(() =>
      validateItemInput({ type: 'scorm', title: 'x', config: { ...ok, packageId: 'nope' } })
    ).toThrow(BadRequestException)
    expect(() =>
      validateItemInput({ type: 'scorm', title: 'x', config: { ...ok, version: '3' } })
    ).toThrow(BadRequestException)
  })
})

describe('validateItemInput video', () => {
  const ID = 'dQw4w9WgXcQ'
  const item = (config: unknown) => validateItemInput({ type: 'video', title: 'Intro', config })

  it('keeps only the video ID, whatever link was pasted', () => {
    expect(item({ url: `https://www.youtube.com/watch?v=${ID}&list=x` }).config).toEqual({
      provider: 'youtube',
      videoId: ID,
    })
  })

  it('takes a start time from the link or from the field, and the field wins', () => {
    expect(item({ url: `https://youtu.be/${ID}?t=30` }).config).toMatchObject({ startSeconds: 30 })
    expect(item({ url: `https://youtu.be/${ID}?t=30`, startSeconds: 45 }).config).toMatchObject({
      startSeconds: 45,
    })
  })

  it('accepts the stored form again, so an existing item can be re-saved', () => {
    const saved = item({ url: `https://youtu.be/${ID}?t=30` }).config
    expect(item(saved).config).toEqual(saved)
  })

  it('rejects other sites, a missing link and an out-of-range start time', () => {
    expect(() => item({ url: 'https://vimeo.com/123' })).toThrow(BadRequestException)
    expect(() => item({})).toThrow(BadRequestException)
    expect(() => item({ url: `https://youtu.be/${ID}`, startSeconds: -1 })).toThrow(
      BadRequestException
    )
  })
})

describe('validateItemInput external_link', () => {
  const item = (config: unknown) =>
    validateItemInput({ type: 'external_link', title: 'Course', config })

  it('keeps a rebuilt link and trimmed instructions', () => {
    expect(
      item({ url: ' https://www.udemy.com/course/x/#top ', instructions: ' Do section 1 ' }).config
    ).toEqual({ url: 'https://www.udemy.com/course/x/', instructions: 'Do section 1' })
    expect(item({ url: 'https://www.coursera.org/learn/y' }).config).toEqual({
      url: 'https://www.coursera.org/learn/y',
    })
  })

  it('keeps the summary, and an image key only if this app wrote it', () => {
    const KEY = 'learn-images/0b9d1c64-3f0e-4d58-9c11-6a1f2f6a9d10.png'
    expect(
      item({ url: 'https://www.udemy.com/course/x/', summary: ' Lifting basics ', imageKey: KEY })
        .config
    ).toEqual({ url: 'https://www.udemy.com/course/x/', summary: 'Lifting basics', imageKey: KEY })
    expect(
      item({ url: 'https://www.udemy.com/course/x/', imageKey: 'https://evil.example/pixel.png' })
        .config
    ).toEqual({ url: 'https://www.udemy.com/course/x/' })
    expect(() =>
      item({ url: 'https://www.udemy.com/course/x/', summary: 'x'.repeat(601) })
    ).toThrow(BadRequestException)
  })

  it('rejects other sites, other schemes and a missing link', () => {
    expect(() => item({ url: 'https://example.com/x' })).toThrow(BadRequestException)
    expect(() => item({ url: 'javascript:alert(1)' })).toThrow(BadRequestException)
    expect(() => item({})).toThrow(BadRequestException)
  })
})

describe('skills and remediation', () => {
  const q = { prompt: 'Pulse?', options: ['20', '70'], correctIndex: 1 }
  const quiz = (questions: unknown[]) =>
    validateItemInput({ type: 'knowledge_check', title: 'Check', config: { questions } }).config
      .questions as { id: string; skill?: string }[]

  it('gives each question an id, keeps it when the item is saved again, and keeps its skill', () => {
    const [first] = quiz([{ ...q, skill: 'safety' }])
    expect(first).toMatchObject({ id: expect.stringMatching(/^q_[0-9a-f]{8}$/), skill: 'safety' })
    expect(quiz([{ ...first, prompt: 'Edited?' }])[0].id).toBe(first.id)
    expect(quiz([q])[0].id).not.toBe(quiz([q])[0].id)
  })

  it('rejects a skill that is not a plain id', () => {
    expect(() => quiz([{ ...q, skill: 'Bad Skill!' }])).toThrow(BadRequestException)
  })

  it('reads course skills, builds ids from labels and refuses duplicates', () => {
    expect(
      validateCourseFields(
        {
          skills: [
            { label: 'Workplace safety', targetPct: 70 },
            { label: 'Communication', targetPct: 60 },
          ],
        },
        true
      ).skills
    ).toEqual([
      { id: 'workplace-safety', label: 'Workplace safety', targetPct: 70 },
      { id: 'communication', label: 'Communication', targetPct: 60 },
    ])
    expect(() =>
      validateCourseFields(
        {
          skills: [
            { label: 'Safety', targetPct: 70 },
            { label: 'safety', targetPct: 50 },
          ],
        },
        true
      )
    ).toThrow(BadRequestException)
    expect(() =>
      validateCourseFields({ skills: [{ label: 'Safety', targetPct: 0 }] }, true)
    ).toThrow(BadRequestException)
    expect(() => validateCourseFields({ skills: [{ label: 'Safety' }] }, true)).toThrow(
      BadRequestException
    )
  })

  it('marks lessons, videos and links as remediation, but not assessments or interviews', () => {
    const lesson = validateItemInput({
      type: 'lesson',
      title: 'Lifting',
      config: { body: 'x', remediationFor: 'safety' },
    })
    expect(lesson.config).toEqual({ body: 'x', remediationFor: 'safety' })
    const assessment = validateItemInput({
      type: 'assessment',
      title: 'Post',
      label: 'post',
      config: { questions: [], remediationFor: 'safety' },
    })
    expect(assessment.config).not.toHaveProperty('remediationFor')
    expect(() =>
      validateItemInput({ type: 'lesson', title: 'x', config: { remediationFor: 'Not valid!' } })
    ).toThrow(BadRequestException)
  })

  it('marks an item to be reviewed instead, and refuses both settings together', () => {
    expect(
      validateItemInput({
        type: 'lesson',
        title: 'Vitals',
        config: { body: 'x', reviewFor: 'safety' },
      }).config
    ).toEqual({ body: 'x', reviewFor: 'safety' })
    expect(() =>
      validateItemInput({
        type: 'lesson',
        title: 'Vitals',
        config: { body: 'x', reviewFor: 'safety', remediationFor: 'safety' },
      })
    ).toThrow(BadRequestException)
  })

  it('tags an interview with the skill it builds', () => {
    expect(
      validateItemInput({
        type: 'interview',
        title: 'Practice',
        config: { role: 'MA', questions: ['Tell me about yourself'], skill: 'comms' },
      }).config
    ).toMatchObject({ skill: 'comms' })
  })
})

describe('interview attempts and course lists', () => {
  const base = { type: 'interview', title: 'P', config: { role: 'x', questions: ['Q'] } }
  it('lets the author set 1 to 5 attempts, default 1', () => {
    expect(
      validateItemInput({ ...base, config: { ...base.config, maxAttempts: 5 } }).config
    ).toMatchObject({ maxAttempts: 5 })
    expect(validateItemInput(base).config).toMatchObject({ maxAttempts: 1 })
    expect(() =>
      validateItemInput({ ...base, config: { ...base.config, maxAttempts: 9 } })
    ).toThrow(BadRequestException)
  })

  it('keeps outcomes and target jobs as short trimmed lists', () => {
    expect(
      validateCourseFields(
        {
          outcomes: [' Take vital signs ', '', 'Chart accurately'],
          targetRoles: ['Medical assistant'],
        },
        true
      )
    ).toEqual({
      outcomes: ['Take vital signs', 'Chart accurately'],
      targetRoles: ['Medical assistant'],
    })
    expect(() =>
      validateCourseFields({ outcomes: Array.from({ length: 9 }, (_, i) => `o${i}`) }, true)
    ).toThrow(BadRequestException)
    expect(() => validateCourseFields({ targetRoles: ['x'.repeat(161)] }, true)).toThrow(
      BadRequestException
    )
    expect(() => validateCourseFields({ outcomes: 'text' }, true)).toThrow(BadRequestException)
  })
})

describe('slugify', () => {
  it('makes a url-safe slug', () => {
    expect(slugify('Medical Assistant (CCMA) — 2026!')).toBe('medical-assistant-ccma-2026')
    expect(slugify('!!!')).toBe('course')
  })
})

describe('tool items', () => {
  const base = { type: 'tool', title: 'Practice', config: { toolId: 'id-interview', ref: ' cna ' } }

  it('keeps a registered tool, its trimmed reference and an optional skill', () => {
    expect(validateItemInput(base)).toMatchObject({
      type: 'tool',
      config: { toolId: 'id-interview', ref: 'cna' },
    })
    expect(
      validateItemInput({ ...base, config: { ...base.config, skill: 'comms', extra: 1 } }).config
    ).toEqual({ toolId: 'id-interview', ref: 'cna', skill: 'comms' })
  })

  it('rejects an unregistered tool, a missing or long reference and a bad skill', () => {
    expect(() => validateItemInput({ ...base, config: { toolId: 'nope', ref: 'x' } })).toThrow(
      'not connected'
    )
    expect(() => validateItemInput({ ...base, config: { toolId: 'id-interview' } })).toThrow(
      'required'
    )
    expect(() =>
      validateItemInput({ ...base, config: { toolId: 'id-interview', ref: 'x'.repeat(201) } })
    ).toThrow('too long')
    expect(() =>
      validateItemInput({ ...base, config: { ...base.config, skill: 'Bad Skill' } })
    ).toThrow('Skill is not valid')
  })

  it('cannot be remediation or review content', () => {
    expect(
      validateItemInput({ ...base, config: { ...base.config, remediationFor: 'comms' } }).config
    ).toEqual({ toolId: 'id-interview', ref: 'cna' })
  })

  describe('assessment tool', () => {
    const assess = {
      type: 'tool',
      title: 'Pre',
      config: { toolId: 'id-assessment', ref: 'cna-pre' },
    }

    it('keeps a pre or post label, or none', () => {
      expect(validateItemInput({ ...assess, label: 'pre' })).toMatchObject({ label: 'pre' })
      expect(validateItemInput({ ...assess, label: 'post' })).toMatchObject({ label: 'post' })
      expect(validateItemInput(assess)).toMatchObject({ label: null })
      expect(validateItemInput({ ...assess, label: null })).toMatchObject({ label: null })
    })

    it('rejects an unknown label and still requires a reference', () => {
      expect(() => validateItemInput({ ...assess, label: 'mid' })).toThrow('pre, post')
      expect(() =>
        validateItemInput({ ...assess, label: 'pre', config: { toolId: 'id-assessment' } })
      ).toThrow('required')
    })

    it('cannot be remediation content', () => {
      expect(
        validateItemInput({
          ...assess,
          label: 'pre',
          config: { ...assess.config, remediationFor: 'comms' },
        }).config
      ).toEqual({ toolId: 'id-assessment', ref: 'cna-pre' })
    })

    it('refuses a label on a tool that is not labelable', () => {
      expect(() => validateItemInput({ ...base, label: 'pre' })).toThrow('cannot be a pre or post')
      expect(validateItemInput({ ...base, label: null })).toMatchObject({ label: null })
    })
  })
})
