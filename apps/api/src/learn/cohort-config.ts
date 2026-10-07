import { BadRequestException } from '@nestjs/common'
import { randomInt } from 'node:crypto'
import type { CohortStatus } from './learn-types'

const DAY = 24 * 60 * 60 * 1000

// No 0/O or 1/I/L, so a code read aloud or off a slide is hard to mistype.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function newJoinKey(length = 8): string {
  let out = ''
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  return out
}

/** A cohort's end follows from its start and the course's fixed length. */
export function endsAtFor(startsAt: Date, lengthWeeks: number): Date {
  return new Date(startsAt.getTime() + lengthWeeks * 7 * DAY)
}

export function cohortStatus(
  startsAt: Date | null,
  endsAt: Date | null,
  now = new Date()
): CohortStatus {
  if (endsAt && endsAt.getTime() <= now.getTime()) return 'completed'
  if (startsAt && startsAt.getTime() > now.getTime()) return 'upcoming'
  return 'running'
}

export interface CohortFields {
  courseId?: string
  name?: string
  startsAt?: Date
  /** Most learners allowed; null clears the limit. */
  maxLearners?: number | null
  /** #68: people who join with the code wait for staff approval. */
  requiresApproval?: boolean
  /** Who learners should ask while approval is on; null clears it. */
  joinContact?: string | null
}

/** Approval needs someone for learners to ask. `current` is what is stored, `fields` what is being set. */
export function assertApprovalContact(
  current: { requiresApproval: boolean; joinContact: string | null },
  fields: CohortFields
): void {
  const on = fields.requiresApproval ?? current.requiresApproval
  const contact = fields.joinContact !== undefined ? fields.joinContact : current.joinContact
  if (on && !contact) {
    throw new BadRequestException('Add a contact (who learners should ask) to require approval')
  }
}

/** Cohort fields from a request body; a start date is YYYY-MM-DD. `partial` allows leaving fields out. */
export function validateCohortFields(input: unknown, partial: boolean): CohortFields {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new BadRequestException('Body must be an object')
  }
  const body = input as Record<string, unknown>
  const out: CohortFields = {}

  if (body.courseId !== undefined || !partial) {
    if (typeof body.courseId !== 'string' || !body.courseId)
      throw new BadRequestException('Choose a course')
    out.courseId = body.courseId
  }
  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) throw new BadRequestException('Name is required')
    if (name.length > 120) throw new BadRequestException('Name is too long (max 120)')
    out.name = name
  }
  if (body.startsAt !== undefined || !partial) {
    if (typeof body.startsAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.startsAt)) {
      throw new BadRequestException('Start date must look like 2026-11-03')
    }
    const d = new Date(`${body.startsAt}T00:00:00Z`)
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== body.startsAt) {
      throw new BadRequestException('That start date does not exist')
    }
    out.startsAt = d
  }
  if (body.maxLearners !== undefined) {
    if (body.maxLearners === null || body.maxLearners === '') out.maxLearners = null
    else if (
      typeof body.maxLearners !== 'number' ||
      !Number.isInteger(body.maxLearners) ||
      body.maxLearners < 1 ||
      body.maxLearners > 5000
    ) {
      throw new BadRequestException('Maximum learners must be a whole number from 1 to 5000')
    } else out.maxLearners = body.maxLearners
  }
  if (body.requiresApproval !== undefined) {
    if (typeof body.requiresApproval !== 'boolean')
      throw new BadRequestException('requiresApproval must be true or false')
    out.requiresApproval = body.requiresApproval
  }
  if (body.joinContact !== undefined) {
    if (body.joinContact === null) out.joinContact = null
    else if (typeof body.joinContact !== 'string')
      throw new BadRequestException('Contact must be text')
    else {
      const contact = body.joinContact.trim()
      if (contact.length > 200) throw new BadRequestException('Contact is too long (max 200)')
      out.joinContact = contact || null
    }
  }
  return out
}

export function validateEmail(input: unknown): string {
  const email = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new BadRequestException('Enter a valid email address')
  }
  return email
}
