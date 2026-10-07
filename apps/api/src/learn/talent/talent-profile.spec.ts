import { BadRequestException } from '@nestjs/common'
import { csvCell, csvRow } from './talent-csv'
import { incompleteReason, parseProfileInput } from './talent-profile'
import { checkResume, resumeKey, safeResumeName } from './resume'

describe('parseProfileInput', () => {
  it('keeps only the fields that were sent and trims text', () => {
    const p = parseProfileInput({ school: '  State U  ', industries: [' IT ', 'it', 'Health', ''] })
    expect(p.data).toEqual({ school: 'State U', industries: ['IT', 'Health'] })
    expect(p.complete).toBe(false)
  })
  it('turns blank text into null and allows explicit nulls', () => {
    expect(parseProfileInput({ school: '  ', previousCompensation: null }).data).toEqual({
      school: null,
      previousCompensation: null,
    })
  })
  it.each([
    [{ previousCompensation: -1 }],
    [{ targetCompensation: 10_000_001 }],
    [{ targetCompensation: 50000.5 }],
    [{ previousCompensation: '50000' }],
    [{ yearsExperience: 61 }],
    [{ yearsExperience: -1 }],
    [{ graduationYear: 1949 }],
    [{ graduationYear: 2101 }],
    [{ educationLevel: 'wizard' }],
    [{ availableFrom: '2026-02-30' }],
    [{ availableFrom: 'soon' }],
    [{ shareWithEmployers: 'yes' }],
    [{ industries: Array.from({ length: 21 }, (_, i) => `i${i}`) }],
    [{ targetRoles: ['x'.repeat(81)] }],
    [{ school: 'x'.repeat(201) }],
    [{ industries: [5] }],
  ])('rejects %j', (body) => {
    expect(() => parseProfileInput(body)).toThrow(BadRequestException)
  })
  it('accepts the limits', () => {
    const p = parseProfileInput({
      previousCompensation: 0,
      targetCompensation: 10_000_000,
      yearsExperience: 60,
      graduationYear: 2100,
      industries: Array.from({ length: 20 }, (_, i) => `i${i}`),
      targetRoles: ['x'.repeat(80)],
      availableFrom: '2026-12-31',
    })
    expect(p.data.targetCompensation).toBe(10_000_000)
    expect(p.data.availableFrom?.toISOString()).toBe('2026-12-31T00:00:00.000Z')
  })
  it('never repeats an amount in an error message', () => {
    for (const body of [{ previousCompensation: 987654321 }, { targetCompensation: -123456 }]) {
      try {
        parseProfileInput(body)
        throw new Error('should have thrown')
      } catch (e) {
        expect((e as Error).message).not.toMatch(/987654321|123456/)
      }
    }
  })
  it('rejects a body that is not an object', () => {
    expect(() => parseProfileInput(null)).toThrow(BadRequestException)
    expect(() => parseProfileInput([])).toThrow(BadRequestException)
  })
})

describe('incompleteReason', () => {
  const ok = { educationLevel: 'bachelor', yearsExperience: 0, industries: ['IT'], targetRoles: [] }
  it('is null when enough, zero years counts', () => expect(incompleteReason(ok)).toBeNull())
  it('names what is missing', () => {
    expect(
      incompleteReason({
        educationLevel: null,
        yearsExperience: null,
        industries: [],
        targetRoles: [],
      })
    ).toBe(
      'To finish, add your education level, your years of experience, at least one industry or target role.'
    )
    expect(incompleteReason({ ...ok, industries: [], targetRoles: ['Analyst'] })).toBeNull()
  })
})

describe('csv', () => {
  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralizes %j', (v) => {
    expect(csvCell(v).replace(/^"/, '')).toMatch(/^'/)
  })
  it('escapes quotes, commas and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
  it('leaves numbers, booleans and blanks alone', () => {
    expect(csvRow([5, true, null, undefined, 'ok'])).toBe('5,true,,,ok')
  })
})

describe('resume checks', () => {
  const pdf = Buffer.from('%PDF-1.7 rest')
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('xx')])
  const doc = Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.from('x'),
  ])
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  it('accepts a matching pdf, doc and docx', () => {
    expect(
      checkResume({ originalname: 'a.PDF', mimetype: 'application/pdf', buffer: pdf })?.ext
    ).toBe('pdf')
    expect(
      checkResume({ originalname: 'a.doc', mimetype: 'application/msword', buffer: doc })?.ext
    ).toBe('doc')
    expect(checkResume({ originalname: 'a.docx', mimetype: DOCX, buffer: docx })?.ext).toBe('docx')
  })
  it('rejects wrong magic bytes, extension, or content type', () => {
    expect(
      checkResume({
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('<html>'),
      })
    ).toBeNull()
    expect(
      checkResume({ originalname: 'a.exe', mimetype: 'application/pdf', buffer: pdf })
    ).toBeNull()
    expect(checkResume({ originalname: 'a.pdf', mimetype: 'text/html', buffer: pdf })).toBeNull()
    expect(checkResume({ originalname: 'a.docx', mimetype: DOCX, buffer: pdf })).toBeNull()
    expect(
      checkResume({ originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%P') })
    ).toBeNull()
  })
  it('builds a safe name and key', () => {
    expect(safeResumeName('../../etc/My Résumé (final).pdf', 'pdf')).toBe('My_R_sum_final_.pdf')
    expect(safeResumeName('...', 'pdf')).toBe('resume.pdf')
    expect(resumeKey('P', 'U', 'a.pdf')).toMatch(/^talent\/resumes\/P\/U\/[0-9a-f-]{36}-a\.pdf$/)
  })
})
