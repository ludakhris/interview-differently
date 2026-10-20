import { describe, expect, it } from 'vitest'
import {
  intakeLines,
  isPendingJoin,
  requestContact,
  requestSentLine,
  requestState,
  requestTitle,
  type LearnerJoinRequest,
} from './joinRequests'

const req: LearnerJoinRequest = {
  id: 'r1',
  cohortId: 'c1',
  cohortName: 'Fall',
  courseTitle: 'Data Analysis',
  institutionName: 'Delaware State',
  status: 'pending',
  requestedAt: '2026-10-07T12:00:00Z',
  contact: 'Pat Lee, pat@x.edu',
}

describe('join request wording', () => {
  it('sent line includes the contact only when there is one', () => {
    expect(requestSentLine('Pat Lee, pat@x.edu')).toBe(
      'Request sent. An admin has to approve it before you can start. Questions? Pat Lee, pat@x.edu.'
    )
    expect(requestSentLine(null)).toBe(
      'Request sent. An admin has to approve it before you can start.'
    )
    expect(requestSentLine('  ')).not.toContain('Questions')
  })
  it('describes pending and declined requests', () => {
    expect(requestTitle(req)).toBe('Data Analysis · Delaware State')
    expect(requestState(req)).toBe('Waiting for approval')
    expect(requestState({ ...req, status: 'declined' })).toBe('Not approved')
    expect(requestContact(req)).toBe('Contact: Pat Lee, pat@x.edu')
    expect(requestContact({ ...req, contact: null })).toBeNull()
  })
  it('tells a pending reply from a joined card', () => {
    expect(isPendingJoin({ pending: true, request: req })).toBe(true)
    expect(isPendingJoin({ cohortId: 'c1' })).toBe(false)
  })
})

describe('intakeLines (#124)', () => {
  it('is empty for a request made with a join code', () => {
    expect(intakeLines(null)).toEqual([])
  })

  it('puts the answers on one line and the reason on its own', () => {
    expect(
      intakeLines({
        phone: '302-555-0118',
        education: 'High School/GED',
        employment: 'employed',
        employer: 'Front desk, a dental office',
        funding: 'wioa',
        language: 'English',
        reason: 'I want to move into billing.',
      })
    ).toEqual([
      '302-555-0118 · WIOA · High School/GED · Working: Front desk, a dental office · English',
      '“I want to move into billing.”',
    ])
  })
})
