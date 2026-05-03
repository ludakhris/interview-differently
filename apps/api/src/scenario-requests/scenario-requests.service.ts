import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Resend } from 'resend'
import { PrismaService } from '../prisma/prisma.service'

const SITUATION_MIN_LEN = 30
const HARDEST_MIN_LEN = 20
const FIELD_MAX_LEN = 4000

export interface ScenarioRequestInput {
  // Required
  situation: string
  hardestMoment: string
  // Optional briefing
  role?: string
  reportsTo?: string
  timeInRole?: string
  // Optional context
  otherPeople?: string
  metricsContext?: string
  timePressure?: string
  temptingWrong?: string
  greatLooksLike?: string
  // Categorisation
  track?: string
  estimatedMinutes?: number
  // Contact
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  // Anti-spam — bots fill it; humans don't see it.
  honeypot?: string
}

const VALID_TRACKS = new Set([
  'operations', 'business', 'risk', 'customer-success', 'general', 'custom',
])

@Injectable()
export class ScenarioRequestsService {
  private readonly logger = new Logger(ScenarioRequestsService.name)
  private readonly resend: Resend | null
  private readonly fromAddress: string
  private readonly adminEmail: string

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.RESEND_API_KEY
    this.resend = apiKey ? new Resend(apiKey) : null
    this.fromAddress = process.env.RESEND_FROM ?? 'Interview Differently <noreply@interviewdifferently.com>'
    this.adminEmail = process.env.ADMIN_EMAIL ?? 'admin@interviewdifferently.com'
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY not set — scenario requests will be persisted but no email sent')
    }
  }

  async submit(input: ScenarioRequestInput, ipAddress?: string, userAgent?: string) {
    // Honeypot — silently accept-and-discard. Returning success without
    // persisting denies bots both feedback and a real DB row.
    if (input.honeypot && input.honeypot.trim().length > 0) {
      this.logger.debug(`Honeypot tripped from ${ipAddress ?? 'unknown'}`)
      return { id: 'discarded' }
    }

    // Validation — minimal but sufficient. Nest's default ValidationPipe isn't
    // wired in this project, so do it inline rather than fight that battle here.
    const cleaned = this.validateAndClean(input)

    const row = await this.prisma.scenarioRequest.create({
      data: {
        ...cleaned,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
    })

    // Fire-and-forget email so the response stays snappy. If it fails, it's
    // recorded on the row (status=new, emailSent=false, emailError=...).
    void this.sendAdminEmail(row.id, cleaned).catch(err => {
      this.logger.error(`Failed to email scenario request ${row.id}: ${err instanceof Error ? err.message : 'unknown'}`)
    })

    return { id: row.id }
  }

  private validateAndClean(input: ScenarioRequestInput): ScenarioRequestInput {
    const situation = (input.situation ?? '').trim()
    const hardestMoment = (input.hardestMoment ?? '').trim()
    if (situation.length < SITUATION_MIN_LEN) {
      throw new BadRequestException(`"situation" must be at least ${SITUATION_MIN_LEN} characters`)
    }
    if (hardestMoment.length < HARDEST_MIN_LEN) {
      throw new BadRequestException(`"hardestMoment" must be at least ${HARDEST_MIN_LEN} characters`)
    }
    if (input.track && !VALID_TRACKS.has(input.track)) {
      throw new BadRequestException(`"track" must be one of ${[...VALID_TRACKS].join(', ')}`)
    }
    if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail)) {
      throw new BadRequestException('"contactEmail" is not a valid email address')
    }

    const cap = (s: string | undefined) => s == null ? null : s.trim().slice(0, FIELD_MAX_LEN) || null
    return {
      situation:        situation.slice(0, FIELD_MAX_LEN),
      hardestMoment:    hardestMoment.slice(0, FIELD_MAX_LEN),
      role:             cap(input.role) ?? undefined,
      reportsTo:        cap(input.reportsTo) ?? undefined,
      timeInRole:       cap(input.timeInRole) ?? undefined,
      otherPeople:      cap(input.otherPeople) ?? undefined,
      metricsContext:   cap(input.metricsContext) ?? undefined,
      timePressure:     cap(input.timePressure) ?? undefined,
      temptingWrong:    cap(input.temptingWrong) ?? undefined,
      greatLooksLike:   cap(input.greatLooksLike) ?? undefined,
      track:            input.track || undefined,
      estimatedMinutes: input.estimatedMinutes ?? undefined,
      contactName:      cap(input.contactName) ?? undefined,
      contactEmail:     cap(input.contactEmail) ?? undefined,
      contactPhone:     cap(input.contactPhone) ?? undefined,
    }
  }

  private async sendAdminEmail(id: string, data: ScenarioRequestInput): Promise<void> {
    if (!this.resend) {
      await this.prisma.scenarioRequest.update({
        where: { id },
        data: { emailError: 'RESEND_API_KEY not configured' },
      })
      return
    }

    const { html, text, subject } = this.formatEmail(id, data)
    const result = await this.resend.emails.send({
      from: this.fromAddress,
      to: this.adminEmail,
      subject,
      html,
      text,
      replyTo: data.contactEmail || undefined,
    })
    if (result.error) {
      await this.prisma.scenarioRequest.update({
        where: { id },
        data: { emailError: result.error.message },
      })
      throw new Error(result.error.message)
    }
    await this.prisma.scenarioRequest.update({
      where: { id },
      data: { emailSent: true, emailError: null },
    })
  }

  private formatEmail(id: string, d: ScenarioRequestInput) {
    const subject = `New scenario request — ${d.contactName ?? 'anonymous'}${d.track ? ` (${d.track})` : ''}`
    const sections: Array<[string, string | undefined]> = [
      ['The Situation',                   d.situation],
      ['Candidate Role',                  joinNonEmpty([d.role, d.reportsTo && `reports to ${d.reportsTo}`, d.timeInRole && `(${d.timeInRole})`])],
      ['Other People',                    d.otherPeople],
      ['Data / Metrics',                  d.metricsContext],
      ['Time Pressure',                   d.timePressure],
      ['The Hardest Moment',              d.hardestMoment],
      ['The Tempting Wrong Answer',       d.temptingWrong],
      ['What Great Looks Like',           d.greatLooksLike],
      ['Track',                           d.track],
      ['Estimated Minutes',               d.estimatedMinutes != null ? String(d.estimatedMinutes) : undefined],
    ]
    const contact: Array<[string, string | undefined]> = [
      ['Name',  d.contactName],
      ['Email', d.contactEmail],
      ['Phone', d.contactPhone],
    ]

    const text = [
      `New scenario request (id: ${id})`,
      ...sections
        .filter(([, v]) => v && v.trim().length > 0)
        .flatMap(([label, v]) => [`\n${label}`, '─'.repeat(label.length), v]),
      '\nContact',
      '───────',
      ...contact.filter(([, v]) => v && v.trim().length > 0).map(([label, v]) => `${label}: ${v}`),
    ].filter(Boolean).join('\n')

    const html = `
<!doctype html><html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #1a1a1a; background: #fafaf8;">
  <h1 style="font-size: 18px; margin: 0 0 4px;">New scenario request</h1>
  <p style="font-size: 12px; color: #777; margin: 0 0 24px;">id: <code>${id}</code></p>
  ${sections
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([label, v]) => `
      <div style="margin-bottom: 18px;">
        <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #777; margin-bottom: 4px;">${escapeHtml(label)}</div>
        <div style="font-size: 14px; line-height: 1.55; white-space: pre-wrap;">${escapeHtml(v ?? '')}</div>
      </div>`)
    .join('')}
  <hr style="border: none; border-top: 1px solid #e0e0d8; margin: 24px 0;" />
  <h2 style="font-size: 14px; margin: 0 0 12px;">Contact</h2>
  ${contact.filter(([, v]) => v && v.trim().length > 0).length === 0
    ? '<p style="font-size: 13px; color: #888;">Anonymous — no contact details provided</p>'
    : `<table style="font-size: 13px; line-height: 1.6;">${contact
        .filter(([, v]) => v && v.trim().length > 0)
        .map(([label, v]) => `<tr><td style="padding-right: 16px; color: #777;">${escapeHtml(label)}</td><td>${escapeHtml(v ?? '')}</td></tr>`)
        .join('')}</table>`}
  ${d.contactEmail ? `<p style="font-size: 12px; color: #888; margin-top: 24px;">Reply-to is set — hit reply to email this person directly.</p>` : ''}
</body></html>`.trim()

    return { subject, html, text }
  }
}

function joinNonEmpty(parts: Array<string | undefined | false>): string | undefined {
  const filtered = parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  return filtered.length > 0 ? filtered.join(', ') : undefined
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
