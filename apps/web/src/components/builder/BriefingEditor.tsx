import { useState } from 'react'
import type { Scenario } from '@id/types'

interface BriefingEditorProps {
  scenario: Scenario
  onUpdate: (updates: Pick<Scenario, 'briefing' | 'estimatedMinutes'>) => void
  onClose: () => void
}

export function BriefingEditor({ scenario, onUpdate, onClose }: BriefingEditorProps) {
  const [situation, setSituation] = useState(scenario.briefing.situation)
  const [role, setRole] = useState(scenario.briefing.role)
  const [organisation, setOrganisation] = useState(scenario.briefing.organisation)
  const [reportsTo, setReportsTo] = useState(scenario.briefing.reportsTo)
  const [timeInRole, setTimeInRole] = useState(scenario.briefing.timeInRole)
  const [estimatedMinutes, setEstimatedMinutes] = useState(scenario.estimatedMinutes)

  function handleSave() {
    onUpdate({
      briefing: { situation, role, organisation, reportsTo, timeInRole },
      estimatedMinutes,
    })
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-[#0d0d0d] border-l border-white/10 z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display font-bold text-[16px] text-[#f5f3ee]">Briefing Editor</h2>
            <p className="text-[12px] text-white/30 mt-0.5">What students see before starting the simulation</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/60 transition-colors text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Situation */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">
              The Situation
            </label>
            <p className="text-[11px] text-white/25 mb-2 leading-relaxed">
              Set the scene. What's happening right now? What pressure is the candidate under?
            </p>
            <textarea
              value={situation}
              onChange={e => setSituation(e.target.value)}
              placeholder="e.g. It's 2:47 PM on a Tuesday. You're three months into your role when your pager fires…"
              rows={5}
              className="w-full bg-[#111111] border border-white/10 rounded-xl px-4 py-3 text-[13px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none leading-relaxed"
            />
          </div>

          {/* Role fields */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-3">
              Your Role
            </label>
            <div className="space-y-3">
              {[
                { label: 'Position', value: role, setter: setRole, placeholder: 'e.g. Junior Operations Analyst' },
                { label: 'Organisation', value: organisation, setter: setOrganisation, placeholder: 'e.g. Fintech platform — 2.4M transactions/day' },
                { label: 'Reports to', value: reportsTo, setter: setReportsTo, placeholder: 'e.g. Senior Operations Manager' },
                { label: 'Time in role', value: timeInRole, setter: setTimeInRole, placeholder: 'e.g. 3 months' },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-[11px] font-medium text-white/30 w-24 flex-shrink-0">{label}</span>
                  <input
                    type="text"
                    value={value}
                    onChange={e => setter(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] placeholder:text-white/20 focus:outline-none focus:border-white/30 transition-colors"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Estimated time */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-widest text-white/40 mb-2">
              Estimated Time
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={120}
                value={estimatedMinutes}
                onChange={e => setEstimatedMinutes(Number(e.target.value))}
                className="w-20 bg-[#111111] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-[#f5f3ee] focus:outline-none focus:border-white/30 transition-colors"
              />
              <span className="text-[13px] text-white/30">minutes</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-white/10 text-[13px] text-white/50 hover:text-white/70 hover:border-white/20 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-lg bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[13px] font-semibold text-white transition-colors"
          >
            Save Briefing
          </button>
        </div>
      </div>
    </>
  )
}
