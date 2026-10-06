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
    ).toEqual({ questions: [q] })
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
      maxAttempts: 3,
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

describe('interview attempts and course lists', () => {
  const base = { type: 'interview', title: 'P', config: { role: 'x', questions: ['Q'] } }
  it('lets the author set 1 to 5 attempts, default 3', () => {
    expect(
      validateItemInput({ ...base, config: { ...base.config, maxAttempts: 5 } }).config
    ).toMatchObject({ maxAttempts: 5 })
    expect(validateItemInput(base).config).toMatchObject({ maxAttempts: 3 })
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
