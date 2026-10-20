import { parseCatalogIntake, readCatalogIntake } from './catalog-request'

const valid = {
  phone: '302-555-0142',
  education: 'High School/GED',
  employment: 'employed',
  employer: 'Front desk, Kent Dental',
  funding: 'wioa',
  language: 'English',
  reason: 'I want to move into billing.',
}

describe('parseCatalogIntake', () => {
  it('accepts a complete intake and trims it', () => {
    const r = parseCatalogIntake({ ...valid, reason: '  I want to move into billing.  ' })
    expect(r).toEqual({ ok: true, intake: valid })
  })

  it('drops the employer when the learner is not working', () => {
    const r = parseCatalogIntake({ ...valid, employment: 'not-employed' })
    expect(r.ok && r.intake.employer).toBeNull()
  })

  it.each([
    [{ phone: 'call me' }, 'phone'],
    [{ education: '' }, 'education'],
    [{ employment: 'maybe' }, 'working'],
    [{ funding: 'lottery' }, 'pay'],
  ])('refuses %j', (patch, word) => {
    const r = parseCatalogIntake({ ...valid, ...patch })
    expect(r.ok).toBe(false)
    expect(!r.ok && r.reason).toContain(word)
  })

  it('reads back null for a request made with a join code', () => {
    expect(readCatalogIntake(null)).toBeNull()
    expect(readCatalogIntake(valid)).toEqual(valid)
  })

  it('reads stored answers leniently, so a later rule never hides them', () => {
    expect(readCatalogIntake({ ...valid, phone: 'ext 4' })?.phone).toBe('ext 4')
  })

  it('refuses an over-long phone number instead of cutting it short', () => {
    expect(parseCatalogIntake({ ...valid, phone: '3'.repeat(60) }).ok).toBe(false)
  })
})
