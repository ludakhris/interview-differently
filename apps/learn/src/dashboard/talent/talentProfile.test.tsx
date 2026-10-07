// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type {
  LearnerItem,
  LearnerProfileState,
  ProfileDto,
  StaffProfileResult,
  TalentParticipantRow,
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
    return { data: key ? loads[key] : null, error: null, loading: false, reload: vi.fn() }
  },
}))
vi.mock('../app-context', () => ({ useApp: () => ({ href: (p: string) => p }) }))

import {
  addItems,
  checklist,
  parseMoney,
  resumeProblem,
  toInput,
  toValues,
  validate,
} from './profileForm'
import { TalentProfileForm } from './TalentProfileForm'
import { MyProfilePage } from './MyProfilePage'
import { TalentProfileItem } from './TalentProfileItem'
import { ParticipantTable, TalentPage, filterQuery, noFilters } from './TalentPage'
import { StaffProfileView } from './StaffProfileView'
import { ResumeBox } from './ResumeBox'

afterEach(() => {
  cleanup()
  send.mockReset()
  apiFetch.mockReset()
  download.mockReset()
  loaded.length = 0
  for (const k of Object.keys(loads)) delete loads[k]
})

const dto = (over: Partial<ProfileDto> = {}): ProfileDto => ({
  educations: [],
  yearsExperience: null,
  industries: [],
  targetRoles: [],
  availableFrom: null,
  previousCompensation: null,
  targetCompensation: null,
  resume: null,
  complete: false,
  completedAt: null,
  updatedAt: null,
  ...over,
})
const orgs = (): LearnerProfileState['organizations'] => [
  {
    institutionId: 'i1',
    name: 'Delaware Tech',
    kind: 'provider',
    why: 'your program',
    required: true,
    shared: false,
    allowEmployers: false,
  },
  {
    institutionId: 'i2',
    name: 'Lantern Hill',
    kind: 'organization',
    why: 'your cohort host',
    required: false,
    shared: false,
    allowEmployers: false,
  },
]
const state = (over: Partial<LearnerProfileState> = {}): LearnerProfileState => ({
  profile: dto(),
  organizations: orgs(),
  requirements: [],
  ...over,
})

describe('form logic', () => {
  it('adds items without blanks or repeats, and parses money', () => {
    expect(addItems(['IT'], [' health ', 'it', '', 'Retail'])).toEqual(['IT', 'health', 'Retail'])
    expect(parseMoney('$85,000')).toBe(85000)
    expect(parseMoney('')).toBeNull()
    expect(Number.isNaN(parseMoney('1.5'))).toBe(true)
  })
  it('validates ranges per field and per education entry', () => {
    const v = toValues(state())
    v.yearsExperience = '61'
    v.previousCompensation = '10000001'
    v.educations = [
      { key: 'a', level: '', fieldOfStudy: 'Math', school: '', graduationYear: '1900' },
    ]
    const e = validate(v)
    expect(e.yearsExperience).toMatch(/0 to 60/)
    expect(e.previousCompensation).toMatch(/10,000,000/)
    expect(e['education.0.level']).toBeTruthy()
    expect(e['education.0.graduationYear']).toMatch(/year/)
    expect(validate(toValues(state()))).toEqual({})
  })
  it('the checklist follows the server rule', () => {
    const v = toValues(state())
    expect(checklist(v).every((c) => !c.done)).toBe(true)
    v.yearsExperience = '0'
    v.targetRoles = ['Analyst']
    v.educations[0].level = 'bachelor'
    expect(checklist(v).every((c) => c.done)).toBe(true)
  })
  it('rejects a resume of the wrong type or size before upload', () => {
    expect(resumeProblem({ name: 'a.exe', size: 10 })).toMatch(/PDF/)
    expect(resumeProblem({ name: 'a.pdf', size: 6 * 1024 * 1024 })).toMatch(/5 MB/)
    expect(resumeProblem({ name: 'a.PDF', size: 10 })).toBeNull()
  })
})

describe('the profile form', () => {
  it('orders the sections: resume first, then work, education, pay, sharing; no provider header, no mark-complete', () => {
    render(<TalentProfileForm state={state()} />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Resume',
      'Your work',
      'Education',
      'Pay',
      'Who can see this profile',
    ])
    expect(screen.queryByRole('button', { name: /complete/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    expect(screen.queryByText('Lantern Hill Tech Academy')).toBeNull()
    expect(screen.getByText('Optional but helpful.')).toBeTruthy()
  })

  it('adds and removes chips with Enter, comma and the x, and offers suggestions', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    const box = screen.getByLabelText('Add to industries you have worked in')
    await user.type(box, 'Aerospace{Enter}Retail,')
    expect(screen.getByRole('button', { name: 'Remove Aerospace' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Retail' })).toBeTruthy()
    // Enter did not submit the form.
    expect(send).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '+ Healthcare' }))
    expect(screen.getByRole('button', { name: 'Remove Healthcare' })).toBeTruthy()
    // Added ones leave the suggestions.
    expect(screen.queryByRole('button', { name: '+ Healthcare' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Remove Aerospace' }))
    expect(screen.queryByRole('button', { name: 'Remove Aerospace' })).toBeNull()
    // No comma-separated text box anywhere.
    expect(screen.queryByText(/separate with commas/i)).toBeNull()
  })

  it('lists several educations: add another, remove, at least one stays', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    expect(screen.getAllByRole('group', { name: /^Education \d/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Remove education/ })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add another' }))
    const groups = screen.getAllByRole('group', { name: /^Education \d/ })
    expect(groups).toHaveLength(2)
    // Level is the first field of each entry.
    expect(within(groups[1]).getAllByRole('combobox')[0]).toBe(
      within(groups[1]).getByLabelText('Level')
    )
    await user.selectOptions(within(groups[1]).getByLabelText('Level'), 'master')
    await user.click(screen.getByRole('button', { name: 'Remove education 1' }))
    const left = screen.getAllByRole('group', { name: /^Education \d/ })
    expect(left).toHaveLength(1)
    expect((within(left[0]).getByLabelText('Level') as HTMLSelectElement).value).toBe('master')
    expect(screen.queryByRole('button', { name: /Remove education/ })).toBeNull()
  })

  it('share list: nothing ticked by default, employer option appears when ticked, reason and requirement shown', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    const tech = screen.getByRole('checkbox', { name: 'Delaware Tech' }) as HTMLInputElement
    expect(tech.checked).toBe(false)
    expect(screen.getByText(/Your program\./)).toBeTruthy()
    expect(
      screen.getByText(
        /Delaware Tech asked for this as part of your course; you decide whether they can read it/
      )
    ).toBeTruthy()
    expect(screen.queryByText(/asked for this/, { selector: '[id="tl-org-i2"]' })).toBeNull()
    expect(screen.queryByLabelText(/partner with them/)).toBeNull()
    await user.click(tech)
    const sub = screen.getByLabelText(/They may share it with employers who partner with them/)
    await user.click(sub)
    send.mockResolvedValue(state())
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send.mock.calls[0][2].shares).toEqual([{ institutionId: 'i1', allowEmployers: true }])
    await user.click(screen.getByRole('checkbox', { name: 'Delaware Tech' }))
  })

  it('shows complete or what is missing, and live check marks', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    expect(screen.getByTestId('profile-status').textContent).toMatch(
      /^Almost there: add an education entry, your years of experience/
    )
    const line = () => screen.getByText(/counts as complete when you have/).textContent
    expect(line()).not.toMatch(/✓/)
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    expect(line()).toMatch(/✓.*your years of experience/)
    cleanup()
    render(
      <TalentProfileForm
        state={state({
          profile: dto({
            complete: true,
            yearsExperience: 1,
            industries: ['IT'],
            educations: [
              { level: 'bachelor', fieldOfStudy: null, school: null, graduationYear: null },
            ],
          }),
        })}
      />
    )
    expect(screen.getByTestId('profile-status').textContent).toBe('Profile complete')
  })

  it('draws a card per requirement', () => {
    render(
      <TalentProfileForm
        state={state({
          profile: dto({ complete: true }),
          requirements: [
            {
              cohortId: 'c1',
              cohortName: 'Fall',
              providerName: 'Delaware Tech',
              refreshMonths: 6,
              satisfied: false,
              dueBy: '2026-10-01T12:00:00Z',
            },
            {
              cohortId: 'c2',
              cohortName: 'Spring',
              providerName: 'Lantern Hill',
              refreshMonths: null,
              satisfied: true,
              dueBy: null,
            },
          ],
        })}
      />
    )
    expect(screen.getByText(/Required by Delaware Tech/)).toBeTruthy()
    expect(screen.getByText(/Time to refresh your profile: it is due/)).toBeTruthy()
    expect(screen.getByText('Up to date.')).toBeTruthy()
  })

  it('saves the full-replacement payload with numbers, lists, educations and shares', async () => {
    const user = userEvent.setup()
    send.mockResolvedValue(state({ profile: dto({ yearsExperience: 3, complete: true }) }))
    render(<TalentProfileForm state={state()} />)
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    await user.type(screen.getByLabelText('Add to jobs you want'), 'Analyst{Enter}')
    await user.selectOptions(screen.getByLabelText('Level'), 'associate')
    await user.type(screen.getByLabelText('School'), 'DTCC')
    await user.type(screen.getByLabelText('Graduation year'), '2019')
    await user.type(screen.getByLabelText('What you earned before'), '52000')
    await user.click(screen.getByRole('checkbox', { name: 'Lantern Hill' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send).toHaveBeenCalledTimes(1)
    const [method, path, body] = send.mock.calls[0]
    expect(method).toBe('PUT')
    expect(path).toBe('/learn/me/profile')
    expect(body).toEqual({
      yearsExperience: 3,
      industries: [],
      targetRoles: ['Analyst'],
      availableFrom: null,
      previousCompensation: 52000,
      targetCompensation: null,
      educations: [
        { level: 'associate', fieldOfStudy: null, school: 'DTCC', graduationYear: 2019 },
      ],
      shares: [{ institutionId: 'i2', allowEmployers: false }],
    })
    expect('complete' in body).toBe(false)
    expect(await screen.findByText('Saved just now')).toBeTruthy()
    expect(screen.getByTestId('profile-status').textContent).toBe('Profile complete')
  })

  it('shows field errors, focuses the summary, sends nothing, and clears the error on edit', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    const years = screen.getByLabelText('Years of work experience')
    await user.type(years, '99')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(screen.getByRole('alert'))
    expect(years.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getAllByText(/0 to 60/).length).toBeGreaterThan(0)
    await user.clear(years)
    await user.type(years, '5')
    expect(years.getAttribute('aria-invalid')).toBe('false')
    expect(screen.queryByText(/0 to 60/)).toBeNull()
  })

  it('shows the server message when the save fails', async () => {
    const user = userEvent.setup()
    send.mockRejectedValue(new Error('Join a cohort first'))
    render(<TalentProfileForm state={state()} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/Join a cohort first/)
  })

  it('toInput leaves out the blank starting education row', () => {
    expect(toInput(toValues(state())).educations).toEqual([])
  })
})

describe('the pages', () => {
  it('My profile has a heading and the one-line purpose', () => {
    loads['/learn/me/profile'] = state()
    render(<MyProfilePage />)
    expect(screen.getByRole('heading', { level: 1, name: 'My profile' })).toBeTruthy()
    expect(
      screen.getByText('Tell us about your work and goals once. You choose who can see it.')
    ).toBeTruthy()
  })

  const item = (over: Partial<LearnerItem> = {}) =>
    ({
      id: 'profile',
      cohortId: 'c1',
      type: 'profile',
      title: 'Your profile',
      status: 'in_progress',
      note: 'Finish your profile',
      ...over,
    }) as LearnerItem

  it('the course item shows its note and the same form, and reads the item back after a save', async () => {
    const user = userEvent.setup()
    loads['/learn/me/profile'] = state()
    send.mockResolvedValue(state({ profile: dto({ complete: true }) }))
    const done = item({ status: 'completed', note: null })
    apiFetch.mockResolvedValue({ json: async () => done })
    const onChange = vi.fn()
    render(
      <TalentProfileItem
        item={item()}
        onChange={onChange}
        nextHref="/back"
        nextLabel="Back to course"
      />
    )
    expect(screen.getByTestId('profile-note').textContent).toBe('Finish your profile')
    expect(screen.getByRole('heading', { name: 'Resume' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(done))
    expect(apiFetch).toHaveBeenCalledWith('/learn/me/cohorts/c1/items/profile')
  })

  it('a finished item offers the way back', () => {
    loads['/learn/me/profile'] = state()
    render(
      <TalentProfileItem
        item={item({ status: 'completed', note: null })}
        onChange={vi.fn()}
        nextHref="/back"
        nextLabel="Back to course"
      />
    )
    expect(screen.getByRole('link', { name: 'Back to course' }).getAttribute('href')).toBe('/back')
  })
})

const staffView = (over: Partial<TalentProfileStaffView> = {}): TalentProfileStaffView => ({
  shared: true,
  status: 'shared',
  userId: 'u1',
  educations: [
    { level: 'bachelor', fieldOfStudy: 'Math', school: 'DSU', graduationYear: 2018 },
    { level: 'master', fieldOfStudy: null, school: null, graduationYear: null },
  ],
  yearsExperience: 4,
  industries: ['Aerospace'],
  targetRoles: ['Analyst'],
  availableFrom: null,
  resume: null,
  hasCompensation: true,
  allowEmployers: true,
  complete: true,
  fresh: true,
  completedAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-02T00:00:00Z',
  ...over,
})
const PAY = '/learn/providers/P1/participants/u1/compensation'
const payResponse = () => ({
  json: async () => ({ previousCompensation: 61250, targetCompensation: 88000 }),
})

describe('the staff profile states', () => {
  it('shared: shows every education entry', () => {
    render(<StaffProfileView profile={staffView()} compensationPath={PAY} onOpenResume={vi.fn()} />)
    expect(screen.getByText("Bachelor's degree, Math, DSU, 2018")).toBeTruthy()
    expect(screen.getByText("Master's degree")).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Compensation' })).toBeTruthy()
  })
  it('not shared: a calm message with status only, no fields, no pay box', () => {
    const r: StaffProfileResult = {
      shared: false,
      status: 'not_shared',
      userId: 'u1',
      complete: true,
      fresh: false,
    }
    const { container } = render(
      <StaffProfileView profile={r} compensationPath={PAY} onOpenResume={vi.fn()} />
    )
    expect(container.textContent).toBe(
      'This person has not shared their profile with your organization. Complete: yes. Up to date: no.'
    )
    expect(screen.queryByRole('heading', { name: 'Compensation' })).toBeNull()
  })
  it('none: no profile yet', () => {
    const r: StaffProfileResult = {
      shared: false,
      status: 'none',
      userId: 'u1',
      complete: null,
      fresh: null,
    }
    render(<StaffProfileView profile={r} compensationPath={PAY} onOpenResume={vi.fn()} />)
    expect(screen.getByText('No profile yet.')).toBeTruthy()
  })
})

describe('the compensation reveal', () => {
  it('fetches pay only on click, and Hide drops it', async () => {
    const user = userEvent.setup()
    apiFetch.mockResolvedValue(payResponse())
    const { container } = render(
      <StaffProfileView profile={staffView()} compensationPath={PAY} onOpenResume={vi.fn()} />
    )
    expect(apiFetch).not.toHaveBeenCalled()
    expect(container.textContent).not.toMatch(/61,250|88,000/)
    await user.click(screen.getByRole('button', { name: 'Show compensation' }))
    expect(apiFetch).toHaveBeenCalledWith(PAY)
    expect(await screen.findByText(/\$61,250 a year/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Hide compensation' }))
    expect(container.textContent).not.toMatch(/61,250|88,000/)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show compensation' }))
  })
  it('shows the server error when the reveal fails', async () => {
    const user = userEvent.setup()
    apiFetch.mockRejectedValue(new Error('db down'))
    render(<StaffProfileView profile={staffView()} compensationPath={PAY} onOpenResume={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Show compensation' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/db down/)
  })
  it('offers no reveal when no pay was given', () => {
    render(
      <StaffProfileView
        profile={staffView({ hasCompensation: false })}
        compensationPath={PAY}
        onOpenResume={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Show compensation' })).toBeNull()
  })
  it('downloads the resume on request and shows a real link when the tab was blocked', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    const resume = { name: 'cv.pdf', size: 2048, uploadedAt: '2026-10-01T00:00:00Z' }
    render(
      <StaffProfileView
        compensationPath={PAY}
        profile={staffView({ resume })}
        onOpenResume={open}
        resumeFallbackUrl="https://signed.test/cv"
      />
    )
    await user.click(screen.getByRole('button', { name: 'Download resume' }))
    expect(open).toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /Download cv.pdf/ }).getAttribute('href')).toBe(
      'https://signed.test/cv'
    )
  })
})

const row = (over: Partial<TalentParticipantRow> = {}): TalentParticipantRow => ({
  userId: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@x.org',
  cohorts: [
    { cohortId: 'c1', cohortName: 'Fall', courseTitle: 'Data', enrollmentStatus: 'enrolled' },
  ],
  profileStatus: 'shared',
  complete: true,
  fresh: null,
  profile: {
    hasResume: true,
    educationLevels: ['bachelor'],
    yearsExperience: 5,
    industries: ['Aerospace', 'IT'],
    targetRoles: ['Analyst'],
    availableFrom: null,
    allowEmployers: true,
  },
  openSupportItems: 0,
  noteCount: 0,
  ...over,
})

describe('the staff list', () => {
  it('has a Profile column saying Shared, Not shared or None', () => {
    render(
      <ParticipantTable
        rows={[
          row(),
          row({
            userId: 'u2',
            name: 'Grace',
            profile: null,
            profileStatus: 'not_shared',
            complete: false,
            fresh: false,
          }),
          row({ userId: 'u3', name: 'Alan', profile: null, profileStatus: 'none', complete: null }),
        ]}
      />
    )
    expect(screen.getByRole('columnheader', { name: 'Profile' })).toBeTruthy()
    const rows = screen.getAllByRole('row')
    const ada = within(rows[1])
    expect(ada.getByRole('link', { name: 'Ada Lovelace' }).getAttribute('href')).toBe(
      '/lms/talent/u1'
    )
    expect(ada.getByText('Shared')).toBeTruthy()
    expect(ada.getByText('Aerospace, IT')).toBeTruthy()
    expect(ada.getByText('Complete')).toBeTruthy()
    expect(within(rows[2]).getByText('Not shared')).toBeTruthy()
    expect(within(rows[2]).getByText('Started, out of date')).toBeTruthy()
    expect(within(rows[3]).getByText('None')).toBeTruthy()
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
  it('says the filters and export are about shared profiles; chips reload the list', async () => {
    const user = userEvent.setup()
    const base = '/learn/providers/P1/participants'
    loads[base] = [row()]
    loads[`${base}?completed=true`] = []
    render(<TalentPage providerId="P1" workspace="dstu" />)
    expect(
      screen.getByText(/look only at profiles people have shared with your organization/)
    ).toBeTruthy()
    expect(screen.getByText(/Export includes shared profiles only/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Profile complete' }))
    expect(loaded).toContain(`${base}?completed=true`)
    expect(loaded.some((p) => /ompensation/.test(p))).toBe(false)
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

describe('the learner resume box', () => {
  const resume = { name: 'cv.pdf', size: 2048, uploadedAt: '2026-10-01T00:00:00Z' }
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens the tab inside the click, then sends it to the link', async () => {
    const user = userEvent.setup()
    const tab = { opener: 'x', location: { href: '' }, close: vi.fn() }
    const open = vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
    let release: (v: unknown) => void = () => {}
    apiFetch.mockReturnValue(new Promise((r) => (release = r)))
    render(<ResumeBox resume={resume} onChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Download resume' }))
    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(apiFetch).toHaveBeenCalledWith('/learn/me/profile/resume')
    release({ json: async () => ({ url: 'https://signed.test/cv' }) })
    await waitFor(() => expect(tab.location.href).toBe('https://signed.test/cv'))
  })
  it('asks before removing, in a group (not a dialog), and calls the new endpoint', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    send.mockResolvedValue(dto())
    render(<ResumeBox resume={resume} onChange={onChange} />)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'Remove your resume?' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove' }))
    )
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    expect(send).toHaveBeenCalledWith('DELETE', '/learn/me/profile/resume')
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })
})
