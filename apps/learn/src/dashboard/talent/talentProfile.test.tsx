// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  LearnerTalentProfileEntry,
  TalentParticipantRow,
  TalentProfileDto,
  TalentProfileStaffView,
} from '@id/types'

const send = vi.fn()
const apiFetch = vi.fn()
const download = vi.fn()
const loaded: string[] = []
const loads: Record<string, unknown> = {}
vi.mock('../api', () => ({
  useApiSend: () => send,
  useApiFetch: () => apiFetch,
  downloadFile: (...a: unknown[]) => download(...a),
  useLoad: (path: string | null) => {
    if (path) loaded.push(path)
    const key = path === null ? null : (Object.keys(loads).find((k) => path === k) ?? null)
    return {
      data: key ? loads[key] : null,
      error: null,
      loading: false,
      reload: vi.fn(),
    }
  },
}))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))

import {
  educationLabel,
  parseMoney,
  resumeProblem,
  splitList,
  toInput,
  toValues,
  validate,
  emptyValues,
} from './profileForm'
import { TalentProfileForm } from './TalentProfileForm'
import { ParticipantTable, TalentPage, filterQuery, noFilters } from './TalentPage'
import { StaffProfileView } from './StaffProfileView'

afterEach(() => {
  cleanup()
  send.mockReset()
  apiFetch.mockReset()
  download.mockReset()
  loaded.length = 0
  for (const k of Object.keys(loads)) delete loads[k]
})

const dto = (over: Partial<TalentProfileDto> = {}): TalentProfileDto => ({
  providerId: 'P1',
  resume: null,
  educationLevel: null,
  fieldOfStudy: null,
  school: null,
  graduationYear: null,
  yearsExperience: null,
  industries: [],
  previousCompensation: null,
  targetCompensation: null,
  targetRoles: [],
  availableFrom: null,
  shareWithEmployers: false,
  completedAt: null,
  updatedAt: '2026-10-07T00:00:00Z',
  ...over,
})
const entry = (profile: TalentProfileDto | null = null): LearnerTalentProfileEntry => ({
  providerId: 'P1',
  providerName: 'Delaware Tech',
  cohorts: [{ cohortId: 'c1', cohortName: 'Fall' }],
  profile,
})

describe('form logic', () => {
  it('splits lists and parses money', () => {
    expect(splitList(' IT, health ;IT\n Retail ,')).toEqual(['IT', 'health', 'Retail'])
    expect(parseMoney('$85,000')).toBe(85000)
    expect(parseMoney('')).toBeNull()
    expect(Number.isNaN(parseMoney('85k'))).toBe(true)
    expect(Number.isNaN(parseMoney('1.5'))).toBe(true)
  })
  it('validates ranges in plain words', () => {
    const e = validate(
      {
        ...emptyValues,
        yearsExperience: '61',
        graduationYear: '1900',
        previousCompensation: '10000001',
        targetCompensation: 'lots',
      },
      false
    )
    expect(e.yearsExperience).toMatch(/0 to 60/)
    expect(e.graduationYear).toMatch(/year/)
    expect(e.previousCompensation).toMatch(/10,000,000/)
    expect(e.targetCompensation).toMatch(/whole dollars/)
    expect(validate(emptyValues, false)).toEqual({})
  })
  it('finishing needs education, years and an industry or role', () => {
    expect(validate(emptyValues, true).finish).toBe(
      'To finish, add your education level, your years of experience, at least one industry or target role.'
    )
    const ok = {
      ...emptyValues,
      educationLevel: 'bachelor',
      yearsExperience: '0',
      targetRoles: 'Analyst',
    }
    expect(validate(ok, true)).toEqual({})
  })
  it('builds the request, with null for blanks and complete only when finishing', () => {
    const input = toInput(
      {
        ...emptyValues,
        yearsExperience: '3',
        industries: 'IT, Health',
        previousCompensation: '$50,000',
      },
      false
    )
    expect(input).toMatchObject({
      yearsExperience: 3,
      industries: ['IT', 'Health'],
      previousCompensation: 50000,
      targetCompensation: null,
      educationLevel: null,
      shareWithEmployers: false,
    })
    expect('complete' in input).toBe(false)
    expect(toInput(emptyValues, true).complete).toBe(true)
  })
  it('round-trips a profile into the form', () => {
    const v = toValues(
      dto({ yearsExperience: 4, industries: ['IT', 'Health'], shareWithEmployers: true })
    )
    expect(v.yearsExperience).toBe('4')
    expect(v.industries).toBe('IT, Health')
    expect(v.shareWithEmployers).toBe(true)
    expect(educationLabel('master')).toBe("Master's degree")
  })
  it('rejects a resume of the wrong type or size before upload', () => {
    expect(resumeProblem({ name: 'a.exe', size: 10 })).toMatch(/PDF/)
    expect(resumeProblem({ name: 'a.pdf', size: 6 * 1024 * 1024 })).toMatch(/5 MB/)
    expect(resumeProblem({ name: 'a.PDF', size: 10 })).toBeNull()
  })
})

describe('the learner form', () => {
  it('shows what is wrong and sends nothing', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm entry={entry()} mode="page" />)
    await user.type(screen.getByLabelText('Years of work experience'), '99')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByRole('alert')[0].textContent).toMatch(/0 to 60/)
    expect(screen.getByLabelText('Years of work experience').getAttribute('aria-invalid')).toBe(
      'true'
    )
    expect(send).not.toHaveBeenCalled()
  })
  it('saves and says so', async () => {
    const user = userEvent.setup()
    send.mockResolvedValue(dto({ yearsExperience: 3 }))
    render(<TalentProfileForm entry={entry()} mode="page" />)
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    await user.type(screen.getByLabelText(/What you earned/), '52000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send).toHaveBeenCalledTimes(1)
    const [method, path, body] = send.mock.calls[0]
    expect(method).toBe('PUT')
    expect(path).toBe('/learn/me/talent-profiles/P1')
    expect(body).toMatchObject({ yearsExperience: 3, previousCompensation: 52000 })
    expect(body.complete).toBeUndefined()
    expect((await screen.findAllByRole('status')).some((s) => s.textContent === 'Saved.')).toBe(
      true
    )
  })
  it('explains and sends the sharing consent', async () => {
    const user = userEvent.setup()
    send.mockResolvedValue(dto({ shareWithEmployers: true }))
    render(<TalentProfileForm entry={entry()} mode="page" />)
    const box = screen.getByRole('checkbox', { name: /share my profile and resume with employers/ })
    expect((box as HTMLInputElement).checked).toBe(false)
    expect(
      screen.getByText(/Staff at your training provider can see your profile either way/)
    ).toBeTruthy()
    await user.click(box)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send.mock.calls[0][2].shareWithEmployers).toBe(true)
  })
  it('marks pay as private and optional', () => {
    render(<TalentProfileForm entry={entry()} mode="page" />)
    expect(screen.getByText(/Only your training provider.s staff can see this/)).toBeTruthy()
    expect(screen.getByText('Pay (optional)')).toBeTruthy()
  })
  it('finishing asks for the missing pieces first, then completes', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    send.mockResolvedValue(dto({ completedAt: '2026-10-07T00:00:00Z' }))
    render(<TalentProfileForm entry={entry()} mode="item" onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: 'Save and finish' }))
    expect(screen.getByRole('alert').textContent).toMatch(/To finish, add your education level/)
    expect(send).not.toHaveBeenCalled()
    await user.selectOptions(screen.getByLabelText('Highest level of education'), 'associate')
    await user.type(screen.getByLabelText('Years of work experience'), '0')
    await user.type(screen.getByLabelText('Jobs you are looking for'), 'Data analyst')
    await user.click(screen.getByRole('button', { name: 'Save and finish' }))
    expect(send.mock.calls[0][2]).toMatchObject({ complete: true, educationLevel: 'associate' })
    expect(onSaved).toHaveBeenCalledWith(
      expect.objectContaining({ completedAt: expect.any(String) }),
      true
    )
  })
  it('shows the server message when the save fails', async () => {
    const user = userEvent.setup()
    send.mockRejectedValue(new Error('You are not enrolled with this provider'))
    render(<TalentProfileForm entry={entry()} mode="page" />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/not enrolled/)
  })
})

const staffView = (over: Partial<TalentProfileStaffView> = {}): TalentProfileStaffView => ({
  ...dto({ previousCompensation: 61250, targetCompensation: 88000, industries: ['Aerospace'] }),
  userId: 'u1',
  ...over,
})

describe('the compensation reveal', () => {
  it('keeps pay out of the page until it is asked for, and can hide it again', async () => {
    const user = userEvent.setup()
    const { container } = render(<StaffProfileView profile={staffView()} onOpenResume={vi.fn()} />)
    expect(container.textContent).not.toMatch(/61,250|88,000/)
    expect(screen.getByRole('heading', { name: 'Compensation' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Show compensation' }))
    expect(container.textContent).toMatch(/\$61,250 a year/)
    expect(container.textContent).toMatch(/\$88,000 a year/)
    await user.click(screen.getByRole('button', { name: 'Hide compensation' }))
    expect(container.textContent).not.toMatch(/61,250|88,000/)
  })
  it('offers no reveal when no pay was given, and handles no profile', () => {
    const { rerender, container } = render(
      <StaffProfileView
        profile={staffView({ previousCompensation: null, targetCompensation: null })}
        onOpenResume={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Show compensation' })).toBeNull()
    rerender(<StaffProfileView profile={null} onOpenResume={vi.fn()} />)
    expect(container.textContent).toMatch(/has not started a profile/)
  })
  it('downloads the resume on request', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(
      <StaffProfileView
        profile={staffView({
          resume: { name: 'cv.pdf', size: 2048, uploadedAt: '2026-10-01T00:00:00Z' },
        })}
        onOpenResume={open}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Download resume' }))
    expect(open).toHaveBeenCalled()
  })
})

const row = (over: Partial<TalentParticipantRow> = {}): TalentParticipantRow => ({
  userId: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@x.org',
  cohorts: [
    { cohortId: 'c1', cohortName: 'Fall', courseTitle: 'Data', enrollmentStatus: 'enrolled' },
  ],
  profile: {
    completed: true,
    hasResume: true,
    educationLevel: 'bachelor',
    yearsExperience: 5,
    industries: ['Aerospace', 'IT'],
    targetRoles: ['Analyst'],
    availableFrom: null,
    shareWithEmployers: true,
  },
  openSupportItems: 0,
  noteCount: 0,
  ...over,
})

describe('the staff list', () => {
  it('shows name, cohorts, industries, years and completion, linking to the person', () => {
    render(
      <ParticipantTable
        rows={[row(), row({ userId: 'u2', name: 'Grace Hopper', profile: null })]}
      />
    )
    const rows = screen.getAllByRole('row')
    const ada = within(rows[1])
    expect(ada.getByRole('link', { name: 'Ada Lovelace' }).getAttribute('href')).toBe(
      '/lms/talent/u1'
    )
    expect(ada.getByText('Fall')).toBeTruthy()
    expect(ada.getByText('Aerospace, IT')).toBeTruthy()
    expect(ada.getByText('5')).toBeTruthy()
    expect(ada.getByText('Complete')).toBeTruthy()
    expect(within(rows[2]).getByText('Not started')).toBeTruthy()
  })
  it('says so when nobody matches', () => {
    render(<ParticipantTable rows={[]} />)
    expect(screen.getByText(/No one matches/)).toBeTruthy()
  })
  it('builds the filter query without any pay field', () => {
    expect(filterQuery(noFilters)).toBe('')
    expect(filterQuery({ ...noFilters, q: ' ada ', industry: 'IT', completed: true })).toBe(
      'q=ada&industry=IT&completed=true'
    )
  })
  it('filter chips reload the list with that filter; the list request never asks for pay', async () => {
    const user = userEvent.setup()
    const base = '/learn/providers/P1/participants'
    loads[base] = [row()]
    loads[`${base}?completed=true`] = []
    render(<TalentPage providerId="P1" workspace="dstu" />)
    expect(screen.getByRole('option', { name: 'Aerospace' })).toBeTruthy()
    const chip = screen.getByRole('button', { name: 'Profile complete' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    await user.click(chip)
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    expect(loaded).toContain(`${base}?completed=true`)
    expect(loaded.some((p) => /ompensation/.test(p))).toBe(false)
    expect(screen.getByText(/No one matches/)).toBeTruthy()
  })
  it('exports without pay unless the box is ticked', async () => {
    const user = userEvent.setup()
    loads['/learn/providers/P1/participants'] = [row()]
    render(<TalentPage providerId="P1" workspace="dstu" />)
    await user.click(screen.getByRole('button', { name: 'Export to CSV' }))
    expect(download.mock.calls[0][1]).toBe('/learn/providers/P1/talent-export.csv')
    await user.click(screen.getByRole('checkbox', { name: /Include pay/ }))
    await user.click(screen.getByRole('button', { name: 'Export to CSV' }))
    expect(download.mock.calls[1][1]).toBe(
      '/learn/providers/P1/talent-export.csv?includeCompensation=true'
    )
  })
})
