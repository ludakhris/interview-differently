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
  formatMoney,
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
const cv = { name: 'cv.pdf', size: 2048, uploadedAt: '2026-10-01T00:00:00Z' }
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
    expect(checklist(v, false).every((c) => !c.done)).toBe(true)
    v.yearsExperience = '0'
    v.targetRoles = ['Analyst']
    v.educations[0].level = 'bachelor'
    // A job alone is not enough: the industry is its own item.
    expect(
      checklist(v, true)
        .filter((c) => !c.done)
        .map((c) => c.label)
    ).toEqual(['at least one industry'])
    v.industries = ['IT']
    // Four of five: the resume is the fifth item and comes from the live state.
    expect(
      checklist(v, false)
        .filter((c) => !c.done)
        .map((c) => c.label)
    ).toEqual(['a resume'])
    expect(checklist(v, true).every((c) => c.done)).toBe(true)
    expect(checklist(v, true)).toHaveLength(5)
    expect(checklist(v, true).map((c) => c.label)).toEqual([
      'an education entry',
      'your years of experience',
      'at least one industry',
      'at least one job you want',
      'a resume',
    ])
  })
  it('rejects a resume of the wrong type or size before upload', () => {
    expect(resumeProblem({ name: 'a.exe', size: 10 })).toMatch(/PDF/)
    expect(resumeProblem({ name: 'a.pdf', size: 6 * 1024 * 1024 })).toMatch(/5 MB/)
    expect(resumeProblem({ name: 'a.PDF', size: 10 })).toBeNull()
  })
})

describe('the profile form', () => {
  it('orders the sections: resume, education, work experience, salary targets, sharing; no provider header, no mark-complete', () => {
    render(<TalentProfileForm state={state()} />)
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Resume',
      'Education',
      'Work experience',
      'Salary targets',
      'Who can see this profile',
    ])
    expect(screen.queryByRole('button', { name: /complete/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Save' })).toHaveLength(1)
    expect(screen.queryByText('Lantern Hill Tech Academy')).toBeNull()
    expect(screen.getByText('Shared only with the organizations you choose below.')).toBeTruthy()
    // The resume is needed for a complete profile, not optional.
    const resumeHead = screen.getByRole('heading', { name: 'Resume' })
    expect(resumeHead.parentElement!.textContent).toBe('ResumeNeeded')
  })

  it('has the salary and sharing wording, and the work-experience fields together', () => {
    render(<TalentProfileForm state={state()} />)
    const section = (name: string) =>
      screen.getByRole('heading', { name }).closest('section') as HTMLElement
    const work = section('Work experience')
    for (const l of [
      'Years of work experience',
      'Add to industries you have worked in',
      'Add to jobs you want',
      'Earliest date available for new position',
    ])
      expect(work.contains(screen.getByLabelText(l))).toBe(true)
    expect(screen.queryByLabelText('Available from')).toBeNull()
    const pay = section('Salary targets')
    expect(pay.textContent).toContain(
      'Why we ask: your salary goals help us match you with job openings that fit what you need, so we do not send you roles that pay far less.'
    )
    expect(pay.textContent).toContain('it never appears in program reports')
    expect(pay.contains(screen.getByLabelText('What you earned upon sign up (per year)'))).toBe(
      true
    )
    expect(pay.contains(screen.getByLabelText('What you hope to earn (per year)'))).toBe(true)
    expect(screen.queryByText(/^Pay$/)).toBeNull()
    const share = section('Who can see this profile')
    expect(share.textContent).toContain(
      'Choose which organizations can view your profile. Organizations you select will also see your name and email from your account. Your profile stays private until you grant an organization access.'
    )
    expect(share.textContent).not.toMatch(/including your pay|tick a box/)
    expect(share.textContent).toContain(
      'Organizations use your profile to find job openings and employer opportunities that fit your education, experience and goals.'
    )
    expect(screen.getByText('Your choices stay in your control')).toBeTruthy()
    const callout = screen.getByRole('note')
    expect(callout.textContent).toContain(
      'You can review or change which organizations have access to your profile at any time. Update your selections below and save to apply your changes.'
    )
    expect(callout.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
    // Directly under the lede, above the organization list.
    expect(share.contains(callout)).toBe(true)
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
    await user.click(screen.getByRole('button', { name: 'Add another school or program' }))
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
    // It has content now, so it can be removed (which clears it).
    expect(screen.getByRole('button', { name: 'Remove education 1' })).toBeTruthy()
  })

  it('share list: nothing ticked by default, employer option appears when ticked, reason and requirement shown', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    const tech = screen.getByRole('checkbox', { name: 'Delaware Tech' }) as HTMLInputElement
    expect(tech.checked).toBe(false)
    expect(
      screen.getByText(
        /Your program asked for this as part of your course; you decide whether they can read it/
      )
    ).toBeTruthy()
    expect(screen.queryByText(/asked for this/, { selector: '[id="tl-org-i2"]' })).toBeNull()
    expect(
      screen.queryByLabelText(/Also let Delaware Tech show my profile to employers/)
    ).toBeNull()
    await user.click(tech)
    const sub = screen.getByLabelText(
      'Also let Delaware Tech show my profile to employers it works with (for example a hiring manager at a partner company)'
    )
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
    const list = () => document.querySelector('.tl-checklist')!.textContent
    const heading = screen.getByText('What counts as complete:')
    expect(heading.tagName).toBe('P')
    // The checklist sits under the label, in a list named by it, and is indented.
    const ul = document.querySelector('.tl-checklist')!
    expect(ul.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.nextElementSibling).toBe(ul)
    expect(ul.querySelectorAll(':scope > li')).toHaveLength(5)
    expect(list()).not.toMatch(/✓/)
    expect(screen.getByTestId('profile-status').textContent).toMatch(/, a resume$/)
    // Five items, each with a visually hidden Done / Still needed.
    expect(document.querySelectorAll('.tl-check')).toHaveLength(5)
    expect(list()).toMatch(/Still needed: At least one industry/)
    expect(list()).toMatch(/Still needed: At least one job you want/)
    expect(list()).toMatch(/Still needed: A resume/)
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    expect(list()).toMatch(/✓Done: Your years of experience/)
    expect(list()).toMatch(/Still needed: An education entry/)
    cleanup()
    render(
      <TalentProfileForm
        state={state({
          profile: dto({
            complete: true,
            resume: cv,
            yearsExperience: 1,
            industries: ['IT'],
            targetRoles: ['Analyst'],
            educations: [
              { level: 'bachelor', fieldOfStudy: null, school: null, graduationYear: null },
            ],
          }),
        })}
      />
    )
    expect(screen.getByTestId('profile-status').textContent).toBe('Profile complete')
    expect(document.querySelectorAll('.tl-check-on')).toHaveLength(5)
  })

  it('shows a line only for an unmet requirement, never the organization as a heading', () => {
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
    expect(screen.getByText(/Time to refresh your profile: it is due/)).toBeTruthy()
    expect(screen.getByText('(Fall)')).toBeTruthy()
    // The met one (Spring) shows nothing, and no provider name appears as a title.
    expect(screen.queryByText(/Spring/)).toBeNull()
    expect(document.querySelectorAll('.tl-req')).toHaveLength(1)
    expect(screen.queryByText(/Required by/)).toBeNull()
    expect(screen.queryByText(/Up to date/)).toBeNull()
    expect(document.querySelector('.tl-status')!.textContent).not.toMatch(/Delaware Tech|Lantern/)
  })

  it('an incomplete profile with an unmet requirement says the course needs it', () => {
    render(
      <TalentProfileForm
        state={state({
          requirements: [
            {
              cohortId: 'c1',
              cohortName: 'Fall',
              providerName: 'Delaware Tech',
              refreshMonths: null,
              satisfied: false,
              dueBy: null,
            },
          ],
        })}
      />
    )
    expect(document.querySelector('.tl-req')!.textContent).toMatch(
      /^Your course needs your profile: finish it\./
    )
  })

  it('the resume item turns done after an upload and open again after a removal, without a save', async () => {
    const user = userEvent.setup()
    const fresh = state({
      requirements: [
        {
          cohortId: 'c1',
          cohortName: 'Fall',
          providerName: 'Delaware Tech',
          refreshMonths: null,
          satisfied: true,
          dueBy: null,
        },
      ],
    })
    apiFetch.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/learn/me/profile/resume' && init?.method === 'POST')
        return { json: async () => dto({ resume: cv }) }
      return { json: async () => fresh }
    })
    send.mockResolvedValue(dto())
    render(
      <TalentProfileForm
        state={state({
          requirements: [{ ...fresh.requirements[0], satisfied: false }],
        })}
      />
    )
    const resumeItem = () =>
      Array.from(document.querySelectorAll('.tl-check')).find((li) =>
        /resume/i.test(li.textContent ?? '')
      )!
    expect(resumeItem().className).not.toMatch(/tl-check-on/)
    expect(document.querySelectorAll('.tl-req')).toHaveLength(1)
    await user.upload(
      document.querySelector('input[type="file"]') as HTMLInputElement,
      new File(['%PDF-'], 'cv.pdf', { type: 'application/pdf' })
    )
    await waitFor(() => expect(resumeItem().className).toMatch(/tl-check-on/))
    expect(resumeItem().textContent).toMatch(/✓Done: A resume/)
    expect(screen.queryByText(/Saved at/)).toBeNull() // no save was needed
    // The requirement is re-read from the server, which has it met now.
    await waitFor(() => expect(document.querySelectorAll('.tl-req')).toHaveLength(0))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    await waitFor(() => expect(resumeItem().className).not.toMatch(/tl-check-on/))
    expect(send).toHaveBeenCalledWith('DELETE', '/learn/me/profile/resume')
  })

  it('says Ready to save once the live form has everything, before the save', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state({ profile: dto({ resume: cv }) })} />)
    expect(screen.getByTestId('profile-status').textContent).toMatch(/^Almost there: add/)
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    await user.type(screen.getByLabelText('Add to jobs you want'), 'Analyst{Enter}')
    await user.selectOptions(screen.getByLabelText('Level'), 'associate')
    // Industries are required too: a job alone is not enough.
    expect(screen.getByTestId('profile-status').textContent).toBe(
      'Almost there: add at least one industry'
    )
    await user.type(screen.getByLabelText('Add to industries you have worked in'), 'IT{Enter}')
    expect(screen.getByTestId('profile-status').textContent).toBe('Ready to save')
  })

  it('saves the full-replacement payload with numbers, lists, educations and shares', async () => {
    const user = userEvent.setup()
    send.mockResolvedValue(
      state({
        profile: dto({
          yearsExperience: 3,
          industries: ['IT'],
          targetRoles: ['Analyst'],
          educations: [
            { level: 'associate', fieldOfStudy: null, school: 'DTCC', graduationYear: 2019 },
          ],
          resume: cv,
          complete: true,
        }),
      })
    )
    render(<TalentProfileForm state={state({ profile: dto({ resume: cv }) })} />)
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    await user.type(screen.getByLabelText('Add to industries you have worked in'), 'IT{Enter}')
    await user.type(screen.getByLabelText('Add to jobs you want'), 'Analyst{Enter}')
    await user.selectOptions(screen.getByLabelText('Level'), 'associate')
    await user.type(screen.getByLabelText('School'), 'DTCC')
    await user.type(screen.getByLabelText('Graduation year'), '2019')
    await user.type(screen.getByLabelText('What you earned upon sign up (per year)'), '52000')
    await user.click(screen.getByRole('checkbox', { name: 'Lantern Hill' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send).toHaveBeenCalledTimes(1)
    const [method, path, body] = send.mock.calls[0]
    expect(method).toBe('PUT')
    expect(path).toBe('/learn/me/profile')
    expect(body).toEqual({
      yearsExperience: 3,
      industries: ['IT'],
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
    expect(await screen.findByText(/^Saved at \d{1,2}:\d{2} (am|pm)$/)).toBeTruthy()
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

  it('lists each problem as a link that focuses its field', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    await user.type(screen.getByLabelText('Years of work experience'), '99')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    const alert = screen.getByRole('alert')
    const link = within(alert).getByRole('link', { name: /Years of experience: .*0 to 60/ })
    await user.click(link)
    expect(document.activeElement).toBe(screen.getByLabelText('Years of work experience'))
    // The inline error stays beside the field too.
    expect(screen.getAllByText(/0 to 60/).length).toBeGreaterThan(1)
  })

  it('links an education problem to that entry', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    await user.type(screen.getByLabelText('School'), 'DTCC')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await user.click(within(screen.getByRole('alert')).getByRole('link', { name: /Education 1/ }))
    expect(document.activeElement).toBe(screen.getByLabelText('Level'))
  })

  it('suggestions are one tab stop, arrow keys move, Enter adds, the hint is read', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    const group = screen.getByRole('group', { name: 'Suggested: Industries you have worked in' })
    const btns = within(group).getAllByRole('button')
    expect(btns.filter((b) => b.tabIndex === 0)).toHaveLength(1)
    expect(btns.filter((b) => b.tabIndex === -1)).toHaveLength(btns.length - 1)
    // Tab from the Add button reaches the group once, then leaves it for the next field.
    await user.click(screen.getByLabelText('Add to industries you have worked in'))
    await user.tab() // Add button
    await user.tab() // the suggestion group
    expect(document.activeElement).toBe(btns[0])
    await user.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(btns[1])
    await user.keyboard('{End}')
    expect(document.activeElement).toBe(btns[btns.length - 1])
    await user.keyboard('{Home}{Enter}')
    expect(screen.getByRole('button', { name: 'Remove Healthcare' })).toBeTruthy()
    // Focus stays in the group, on the next suggestion.
    expect(document.activeElement?.textContent).toBe('+ Information technology')
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Add to jobs you want'))
    expect(group.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.getElementById(group.getAttribute('aria-describedby')!)?.textContent).toMatch(
      /arrow keys/
    )
    expect(screen.getAllByText('Tap a suggestion or type your own')).toHaveLength(2)
  })

  it('has an Add button for typed items, and the Enter key hint is done', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    const box = screen.getByLabelText('Add to jobs you want')
    expect(box.getAttribute('enterkeyhint')).toBe('done')
    await user.type(box, 'Welder')
    await user.click(screen.getByRole('button', { name: 'Add typed item to jobs you want' }))
    expect(screen.getByRole('button', { name: 'Remove Welder' })).toBeTruthy()
    expect((box as HTMLInputElement).value).toBe('')
  })

  it('labels the needed fields and every other field Optional', () => {
    render(<TalentProfileForm state={state()} />)
    const needs = Array.from(document.querySelectorAll('.tl-need')).map((n) => n.textContent)
    expect(needs).toHaveLength(5) // resume, years, industries, jobs, education level 1
    expect(needs).toContain('Needed')
    const described = (el: HTMLElement) =>
      el
        .getAttribute('aria-describedby')!
        .split(' ')
        .map((i) => document.getElementById(i)?.textContent)
        .join(' ')
    expect(described(screen.getByLabelText('Years of work experience'))).toMatch(/Needed/)
    expect(described(screen.getByLabelText('Add to industries you have worked in'))).toMatch(
      /^Needed/
    )
    expect(described(screen.getByLabelText('Add to jobs you want'))).toMatch(/^Needed/)
    expect(document.body.textContent).not.toMatch(/this or jobs|this or industries/)
    expect(described(screen.getByLabelText('Level'))).toMatch(/Needed/)
    expect(described(screen.getByLabelText('Earliest date available for new position'))).toMatch(
      /Optional/
    )
    expect(described(screen.getByLabelText('School'))).toMatch(/Optional/)
    expect(described(screen.getByLabelText('What you hope to earn (per year)'))).toMatch(/Optional/)
  })

  it('formats pay with thousands separators on blur and sends whole dollars', async () => {
    const user = userEvent.setup()
    send.mockResolvedValue(state())
    render(<TalentProfileForm state={state()} />)
    const pay = screen.getByLabelText('What you earned upon sign up (per year)') as HTMLInputElement
    expect(pay.type).toBe('text')
    expect(pay.inputMode).toBe('numeric')
    await user.type(pay, '$85000')
    await user.tab()
    expect(pay.value).toBe('85,000')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(send.mock.calls[0][2].previousCompensation).toBe(85000)
    expect(formatMoney('1.5')).toBe('1.5')
    expect(parseMoney('85,000.00')).toBe(85000)
  })

  it('announces only a save, never typing: one live region, and the status is not live', async () => {
    const user = userEvent.setup()
    send.mockResolvedValue(state())
    render(<TalentProfileForm state={state()} />)
    // The save bar holds the only live region the form changes by itself (the resume box has its own).
    const live = within(document.querySelector('.tl-savebar') as HTMLElement).getAllByRole('status')
    expect(live).toHaveLength(1)
    expect(document.querySelector('.tl-main')!.contains(live[0])).toBe(true)
    expect(live[0].textContent).toBe('')
    expect(screen.getByTestId('profile-status').getAttribute('role')).toBeNull()
    await user.type(screen.getByLabelText('Years of work experience'), '3')
    expect(live[0].textContent).toBe('')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(live[0].textContent).toMatch(/^Saved at \d{1,2}:\d{2} (am|pm)$/))
    await user.type(screen.getByLabelText('Years of work experience'), '4')
    expect(live[0].textContent).toBe('')
  })

  it('the first education entry can be removed once it has content, and stays as an empty one', async () => {
    const user = userEvent.setup()
    render(<TalentProfileForm state={state()} />)
    expect(screen.queryByRole('button', { name: 'Remove education 1' })).toBeNull()
    await user.selectOptions(screen.getByLabelText('Level'), 'master')
    await user.type(screen.getByLabelText('School'), 'DSU')
    await user.click(screen.getByRole('button', { name: 'Remove education 1' }))
    expect((screen.getByLabelText('Level') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('School') as HTMLInputElement).value).toBe('')
    expect(screen.getAllByRole('group', { name: /^Education \d/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'Remove education 1' })).toBeNull()
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
