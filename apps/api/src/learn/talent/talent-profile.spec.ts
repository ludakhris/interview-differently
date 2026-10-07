import { BadRequestException } from '@nestjs/common'
import { csvCell, csvRow } from './talent-csv'
import { parseProfileInput } from './talent-profile'
import { isProfileComplete } from './profile-requirement'
import { checkResume, resumeKey, safeResumeName } from './resume'

describe('parseProfileInput', () => {
  it('keeps only the fields that were sent and trims list entries', () => {
    const p = parseProfileInput({ industries: [' IT ', 'it', 'Health', ''] })
    expect(p.data).toEqual({ industries: ['IT', 'Health'] })
    expect(p.educations).toBeUndefined()
    expect(p.shares).toBeUndefined()
  })
  it('allows explicit nulls', () => {
    expect(parseProfileInput({ previousCompensation: null }).data).toEqual({
      previousCompensation: null,
    })
  })
  it('takes lists as lists, never as one comma-separated text', () => {
    expect(() => parseProfileInput({ industries: 'IT, Health' })).toThrow(BadRequestException)
    expect(() => parseProfileInput({ targetRoles: 'a,b' })).toThrow(BadRequestException)
  })
  it.each([
    [{ previousCompensation: -1 }],
    [{ targetCompensation: 10_000_001 }],
    [{ targetCompensation: 50000.5 }],
    [{ previousCompensation: '50000' }],
    [{ yearsExperience: 61 }],
    [{ yearsExperience: -1 }],
    [{ availableFrom: '2026-02-30' }],
    [{ availableFrom: 'soon' }],
    [{ industries: Array.from({ length: 21 }, (_, i) => `i${i}`) }],
    [{ targetRoles: ['x'.repeat(81)] }],
    [{ industries: [5] }],
    [{ educations: [{ level: 'wizard' }] }],
    [{ educations: [{}] }],
    [{ educations: ['bachelor'] }],
    [{ educations: [{ level: 'bachelor', graduationYear: 1949 }] }],
    [{ educations: [{ level: 'bachelor', graduationYear: 2101 }] }],
    [{ educations: [{ level: 'bachelor', school: 'x'.repeat(201) }] }],
    [{ educations: Array.from({ length: 9 }, () => ({ level: 'bachelor' })) }],
    [{ educations: 'bachelor' }],
    [{ shares: 'P1' }],
    [{ shares: [{ institutionId: 'P1' }] }],
    [{ shares: [{ institutionId: 'P1', allowEmployers: 'yes' }] }],
    [{ shares: [{ allowEmployers: true }] }],
  ])('rejects %j', (body) => {
    expect(() => parseProfileInput(body)).toThrow(BadRequestException)
  })
  it('accepts the limits', () => {
    const p = parseProfileInput({
      previousCompensation: 0,
      targetCompensation: 10_000_000,
      yearsExperience: 60,
      industries: Array.from({ length: 20 }, (_, i) => `i${i}`),
      targetRoles: ['x'.repeat(80)],
      availableFrom: '2026-12-31',
      educations: Array.from({ length: 8 }, () => ({ level: 'other', graduationYear: 2100 })),
    })
    expect(p.data.targetCompensation).toBe(10_000_000)
    expect(p.data.availableFrom?.toISOString()).toBe('2026-12-31T00:00:00.000Z')
    expect(p.educations).toHaveLength(8)
  })
  it('keeps several education entries in order, trims text and fills the gaps with null', () => {
    const p = parseProfileInput({
      educations: [
        { level: 'associate', school: '  Harbor CC ', graduationYear: 2015 },
        { level: 'bachelor', fieldOfStudy: 'Biology', school: '', graduationYear: null },
      ],
    })
    expect(p.educations).toEqual([
      { level: 'associate', school: 'Harbor CC', graduationYear: 2015, fieldOfStudy: null },
      { level: 'bachelor', fieldOfStudy: 'Biology', school: null, graduationYear: null },
    ])
  })
  it('ignores a complete flag: completeness is computed, never sent', () => {
    expect(parseProfileInput({ complete: true })).toEqual({ data: {} })
  })
  it('takes shares as the complete set, the last choice for an organization winning', () => {
    expect(
      parseProfileInput({
        shares: [
          { institutionId: 'P1', allowEmployers: false },
          { institutionId: 'P2', allowEmployers: true },
          { institutionId: 'P1', allowEmployers: true },
        ],
      }).shares
    ).toEqual([
      { institutionId: 'P1', allowEmployers: true },
      { institutionId: 'P2', allowEmployers: true },
    ])
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

describe('isProfileComplete', () => {
  const ok = { educationCount: 1, yearsExperience: 0, industries: ['IT'], targetRoles: [] }
  it('is true when enough; zero years counts', () => expect(isProfileComplete(ok)).toBe(true))
  it('needs an education entry, years of experience, and an industry or a target role', () => {
    expect(isProfileComplete({ ...ok, educationCount: 0 })).toBe(false)
    expect(isProfileComplete({ ...ok, yearsExperience: null })).toBe(false)
    expect(isProfileComplete({ ...ok, industries: [] })).toBe(false)
    expect(isProfileComplete({ ...ok, industries: [], targetRoles: ['Analyst'] })).toBe(true)
  })
  it('counts several education entries as one requirement, not one each', () => {
    expect(isProfileComplete({ ...ok, educationCount: 3 })).toBe(true)
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
  const zipEntry = (name: string) => {
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(name.length, 26)
    return Buffer.concat([head, Buffer.from(name), Buffer.from('rest')])
  }
  const docx = zipEntry('[Content_Types].xml')
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
    // Any other zip is not a Word file.
    const other = zipEntry('payload.exe')
    expect(checkResume({ originalname: 'a.docx', mimetype: DOCX, buffer: other })).toBeNull()
    expect(
      checkResume({ originalname: 'a.docx', mimetype: DOCX, buffer: zipEntry('word/document.xml') })
    ).not.toBeNull()
    expect(
      checkResume({ originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%P') })
    ).toBeNull()
  })
  it('builds a safe name and key', () => {
    expect(safeResumeName('../../etc/My Résumé (final).pdf', 'pdf')).toBe('My_R_sum_final_.pdf')
    expect(safeResumeName('...', 'pdf')).toBe('resume.pdf')
    expect(resumeKey('U', 'a.pdf')).toMatch(/^talent\/resumes\/U\/[0-9a-f-]{36}-a\.pdf$/)
  })
})
