import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { submitScenarioRequest, type ScenarioRequestPayload } from '@/services/scenarioRequestsService'

const TRACKS: Array<{ value: string; label: string }> = [
  { value: '',                  label: 'Not sure yet' },
  { value: 'operations',        label: 'Operations / Incident Response' },
  { value: 'business',          label: 'Business / Strategy' },
  { value: 'risk',              label: 'Risk & Compliance' },
  { value: 'customer-success',  label: 'Customer Success' },
  { value: 'general',           label: 'General Judgement & Thinking' },
  { value: 'custom',            label: 'Something else' },
]

const inputCls =
  'w-full bg-[#111111] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-[#f5f3ee] placeholder:text-white/25 focus:outline-none focus:border-white/30 transition-colors'
const labelCls =
  'block text-[12px] font-bold uppercase tracking-widest text-white/60 mb-1.5'
const helpCls =
  'text-[12px] text-white/35 mb-2 leading-relaxed'
const requiredMark = (
  <span className="text-amber-400 ml-1" aria-label="required">*</span>
)

export function RequestScenarioPage() {
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState<ScenarioRequestPayload>({
    situation: '',
    hardestMoment: '',
  })

  function update<K extends keyof ScenarioRequestPayload>(key: K, value: ScenarioRequestPayload[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await submitScenarioRequest(form)
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed — please try again')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Confirmation ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
        <Nav />
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="max-w-lg text-center animate-fade-in">
            <div className="text-[48px] mb-4">✓</div>
            <h1 className="font-display font-extrabold text-[28px] text-[#f5f3ee] mb-3">
              Request received
            </h1>
            <p className="text-[15px] text-slate-light leading-relaxed mb-8">
              Thanks for the detail. We'll review it and be in touch within 2 business days.
              {form.contactEmail && ' We\'ll email you a link to your scenario when it\'s ready.'}
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2.5 rounded-lg bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[14px] font-semibold text-white transition-colors"
            >
              Back to scenarios
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />

      <div className="max-w-2xl mx-auto px-6 py-10">
        <p className="text-[12px] font-medium tracking-widest uppercase text-slate-mid mb-2">
          Custom scenario
        </p>
        <h1 className="font-display font-extrabold text-[32px] text-[#f5f3ee] tracking-tight mb-3">
          Help us build your simulation
        </h1>
        <p className="text-[14px] text-slate-light leading-relaxed mb-2">
          The more specific you are, the better the scenario. Only the first two questions are required —
          fill what you can, we'll come back with follow-up questions if we need more.
        </p>
        <p className="text-[12px] text-white/30 mb-10">
          Takes about 5 minutes. Fields marked {requiredMark} are required.
        </p>

        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Honeypot — visually hidden but not display:none (some bots skip those) */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden' }}>
            <label>Website (leave blank)
              <input type="text" tabIndex={-1} autoComplete="off"
                value={form.honeypot ?? ''}
                onChange={e => update('honeypot', e.target.value)} />
            </label>
          </div>

          <Field
            label="Set the scene"
            help="Describe the workplace situation in 3–5 sentences. Include the team size, industry, and what's been happening in the lead-up."
            example={`"We're a 12-person SaaS sales team. Our top performer has been missing targets for 3 months and the rest of the team has noticed. There's speculation about why, and morale is starting to dip. As the sales manager you've just received Q3 results and need to act."`}
            required
          >
            <textarea
              required minLength={30}
              value={form.situation}
              onChange={e => update('situation', e.target.value)}
              rows={6}
              className={`${inputCls} resize-y leading-relaxed`}
              placeholder="What's the situation?"
            />
          </Field>

          <div>
            <p className={labelCls}>Candidate's role</p>
            <p className={helpCls}>Their job title, who they report to, and how long they've been in the role.</p>
            <div className="space-y-2">
              <input className={inputCls} placeholder="Job title (e.g. Sales Manager)"
                value={form.role ?? ''} onChange={e => update('role', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Reports to (e.g. VP of Sales)"
                  value={form.reportsTo ?? ''} onChange={e => update('reportsTo', e.target.value)} />
                <input className={inputCls} placeholder="Time in role (e.g. 18 months)"
                  value={form.timeInRole ?? ''} onChange={e => update('timeInRole', e.target.value)} />
              </div>
            </div>
          </div>

          <Field
            label="Who else is involved?"
            help="Name 1–3 other people in this situation and give each a one-line description of their personality or agenda."
            example={`"Jamie — the underperforming rep, defensive and proud. Sarah — the VP of Sales, wants results but trusts your judgment. The rest of the team — watching closely, worried about their own targets."`}
          >
            <textarea
              value={form.otherPeople ?? ''}
              onChange={e => update('otherPeople', e.target.value)}
              rows={4}
              className={`${inputCls} resize-y leading-relaxed`}
              placeholder="People in the scene…"
            />
          </Field>

          <Field
            label="Data or metrics they're looking at"
            help="Paste actual figures or describe the data. If you don't have real data, make up realistic figures — the specificity is what makes the scenario feel authentic."
            example={`Rep    | Q3 Target | Q3 Actual | Pipeline\nJamie  | 120,000   | 71,000    | 89,000\nSarah  | 120,000   | 118,000   | 210,000`}
          >
            <textarea
              value={form.metricsContext ?? ''}
              onChange={e => update('metricsContext', e.target.value)}
              rows={5}
              className={`${inputCls} resize-y leading-relaxed font-mono text-[12px]`}
              placeholder="Numbers, tables, alerts…"
            />
          </Field>

          <Field
            label="Time pressure"
            help="Slow-burn situation or crisis unfolding in real time? How long does the candidate have to act?"
            example={`"The all-hands is in 2 hours and the team is expecting an announcement."`}
          >
            <textarea
              value={form.timePressure ?? ''}
              onChange={e => update('timePressure', e.target.value)}
              rows={2}
              className={`${inputCls} resize-y leading-relaxed`}
              placeholder="What's the urgency?"
            />
          </Field>

          <Field
            label="The hardest moment"
            help="The specific decision or conversation they need to navigate. What makes it genuinely difficult?"
            example={`"They need to have a direct performance conversation with Jamie without triggering a resignation or legal complaint, while also not being seen by the team as playing favourites."`}
            required
          >
            <textarea
              required minLength={20}
              value={form.hardestMoment}
              onChange={e => update('hardestMoment', e.target.value)}
              rows={4}
              className={`${inputCls} resize-y leading-relaxed`}
              placeholder="What's the central decision?"
            />
          </Field>

          <Field
            label="The tempting wrong answer"
            help="What does a weak candidate typically do here — and why does it feel reasonable in the moment?"
            example={`"Avoid the direct conversation, give Jamie another month, and hope the numbers recover. It feels compassionate but the team loses respect for the manager and the problem compounds."`}
          >
            <textarea
              value={form.temptingWrong ?? ''}
              onChange={e => update('temptingWrong', e.target.value)}
              rows={3}
              className={`${inputCls} resize-y leading-relaxed`}
              placeholder="The wrong answer that looks right"
            />
          </Field>

          <Field
            label="What does great look like?"
            help="2–3 specific things a strong candidate would say or do that a weaker one wouldn't. Be as concrete as possible — we use this to build the scoring criteria."
            example={`"They acknowledge Jamie's past strong performance before raising the numbers. They ask questions before drawing conclusions about why performance has dropped. They agree a specific 60-day plan with clear milestones."`}
          >
            <textarea
              value={form.greatLooksLike ?? ''}
              onChange={e => update('greatLooksLike', e.target.value)}
              rows={4}
              className={`${inputCls} resize-y leading-relaxed`}
              placeholder="Concrete behaviours that distinguish a strong response"
            />
          </Field>

          <div>
            <p className={labelCls}>Track</p>
            <p className={helpCls}>Helps us pick the right rubric template. Skip if unsure.</p>
            <select
              value={form.track ?? ''}
              onChange={e => update('track', e.target.value || undefined)}
              className={inputCls}
            >
              {TRACKS.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Contact */}
          <div className="border-t border-white/10 pt-8">
            <p className={labelCls}>Contact (optional)</p>
            <p className={helpCls}>
              We sometimes have a quick follow-up question while building your scenario. No sales calls — just scenario questions.
            </p>
            <div className="space-y-2">
              <input className={inputCls} placeholder="Your name"
                value={form.contactName ?? ''} onChange={e => update('contactName', e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <input type="email" className={inputCls} placeholder="Email"
                  value={form.contactEmail ?? ''} onChange={e => update('contactEmail', e.target.value)} />
                <input type="tel" className={inputCls} placeholder="Phone (optional)"
                  value={form.contactPhone ?? ''} onChange={e => update('contactPhone', e.target.value)} />
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3">
              <p className="text-[13px] text-red-400">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="text-[13px] text-white/50 hover:text-white/70 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 rounded-lg bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[14px] font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting…' : 'Submit request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Field wrapper ───────────────────────────────────────────────────────────

function Field({
  label,
  help,
  example,
  required,
  children,
}: {
  label: string
  help: string
  example?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <p className={labelCls}>{label}{required && requiredMark}</p>
      <p className={helpCls}>{help}</p>
      {children}
      {example && (
        <details className="mt-2 group">
          <summary className="text-[11px] text-white/30 hover:text-white/60 cursor-pointer select-none transition-colors">
            Show example
          </summary>
          <pre className="mt-2 text-[12px] text-white/40 leading-relaxed whitespace-pre-wrap font-mono bg-black/30 rounded-lg px-3 py-2 border border-white/5">
            {example}
          </pre>
        </details>
      )}
    </div>
  )
}
