import { useNavigate, useParams } from 'react-router-dom'
import { Nav } from '@/components/Nav'
import { scenarios, trackMeta } from '@/lib/scenarios'

export function BriefingPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>()
  const navigate = useNavigate()

  const scenario = scenarios.find((s) => s.scenarioId === scenarioId)
  if (!scenario) {
    navigate('/dashboard')
    return null
  }

  const meta = trackMeta[scenario.track]

  const roleMap: Record<string, { role: string; org: string; reports: string }> = {
    'ops-001': {
      role: 'Junior Operations Analyst',
      org: 'Fintech company, 400 employees',
      reports: 'Senior Operations Manager',
    },
    'biz-001': {
      role: 'Strategy Analyst',
      org: 'Media and publishing company',
      reports: 'VP of Business Development',
    },
    'risk-001': {
      role: 'Compliance Analyst',
      org: 'Financial services firm, regulated',
      reports: 'Director of Risk and Compliance',
    },
  }

  const context = roleMap[scenarioId ?? ''] ?? {
    role: 'Analyst',
    org: 'Mid-size company',
    reports: 'Senior Manager',
  }

  return (
    <div className="min-h-screen bg-cream">
      <Nav trackLabel={meta.label} />

      <div className="max-w-2xl mx-auto px-6 py-14 animate-fade-in">
        <div
          className="text-[11px] font-bold uppercase tracking-widest mb-3"
          style={{ color: meta.color }}
        >
          {meta.icon} {meta.label} Track
        </div>

        <h1 className="font-display font-extrabold text-[28px] text-[#0a0a0a] tracking-tight leading-snug mb-8">
          {scenario.title}
        </h1>

        <div className="bg-white rounded-2xl border border-border shadow-card p-6 mb-6">
          <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-4">
            Your Role
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Position', value: context.role },
              { label: 'Organization', value: context.org },
              { label: 'Reports to', value: context.reports },
              { label: 'Time in role', value: '3 months' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <span className="text-[12px] font-medium text-slate-mid w-28 flex-shrink-0 pt-0.5">
                  {label}
                </span>
                <span className="text-[14px] text-[#0a0a0a] font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border shadow-card p-6 mb-6">
          <h3 className="font-display font-bold text-[12px] uppercase tracking-widest text-slate-mid mb-4">
            What You Will Be Evaluated On
          </h3>
          <div className="space-y-3">
            {scenario.rubric.dimensions.map((dim) => (
              <div key={dim.name} className="flex items-start gap-3">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: meta.color }}
                />
                <div>
                  <div className="text-[14px] font-semibold text-[#0a0a0a]">{dim.name}</div>
                  <div className="text-[12px] text-slate-mid leading-relaxed">{dim.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-amber-pale border border-amber/20 rounded-xl p-4 mb-8">
          <p className="text-[13px] text-amber leading-relaxed">
            <strong>How it works:</strong> You will move through a real workplace scenario and make decisions at each step. There are no trick questions. The AI evaluates the reasoning behind your choices, not just which answer you pick.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-[13px] text-slate-mid hover:text-[#0a0a0a] transition-colors"
          >
            Back to dashboard
          </button>
          <button
            onClick={() => navigate(`/scenario/${scenarioId}/play`)}
            className="bg-[#0a0a0a] hover:bg-slate text-white font-display font-semibold text-[14px] px-8 py-3 rounded-lg transition-colors tracking-wide"
          >
            Begin Simulation
          </button>
        </div>
      </div>
    </div>
  )
}
