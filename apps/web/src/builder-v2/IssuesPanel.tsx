// IssuesPanel — what stands between the author and Publish (#24 Phase F).
// Errors block publishing; warnings don't. Each row jumps to its block.

import type { ValidationIssue } from './validate'

interface Props {
  issues: ValidationIssue[]
  status: 'draft' | 'published'
  publishing: boolean
  onJump: (where: NonNullable<ValidationIssue['where']>) => void
  onPublish: () => void
  onClose: () => void
}

export function IssuesPanel({ issues, status, publishing, onJump, onPublish, onClose }: Props) {
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')
  const canPublish = errors.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#111] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className={`text-[20px] ${canPublish ? 'text-emerald-400' : 'text-amber-400'}`}>{canPublish ? '✓' : '⚠'}</span>
            <h2 className="font-display font-bold text-[16px] text-[#f5f3ee]">
              {canPublish ? (status === 'published' ? 'Ready to re-publish' : 'Ready to publish') : `${errors.length} thing${errors.length === 1 ? '' : 's'} to fix first`}
            </h2>
            <div className="flex-1" />
            <button onClick={onClose} className="text-white/30 hover:text-white/60 text-[18px] leading-none">×</button>
          </div>
          <p className="text-[12px] text-white/40 mt-1 ml-9">
            {canPublish
              ? warnings.length
                ? 'A few warnings below — publishing is still allowed.'
                : 'Every check passes. Candidates will see the latest saved version.'
              : 'Click an item to jump to it. Warnings don’t block publishing.'}
          </p>
        </div>

        {issues.length > 0 && (
          <ul className="max-h-[50vh] overflow-auto px-3 py-2 divide-y divide-white/[0.05]">
            {[...errors, ...warnings].map((issue, i) => (
              <li key={i}>
                <button
                  type="button"
                  disabled={!issue.where}
                  onClick={() => issue.where && onJump(issue.where)}
                  className="w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/[0.04] disabled:cursor-default transition-colors"
                >
                  <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-none ${issue.level === 'error' ? 'bg-amber-400' : 'bg-white/30'}`} />
                  <span className="text-[13px] text-white/80 leading-snug">{issue.message}</span>
                  {issue.where && <span className="ml-auto text-[11px] text-white/25 flex-none">→</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="px-6 py-4 border-t border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-white/10 text-[13px] text-white/50 hover:text-white/70 hover:border-white/20 transition-all">
            {canPublish ? 'Not yet' : 'Fix issues'}
          </button>
          <button
            onClick={onPublish}
            disabled={!canPublish || publishing}
            className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-[13px] font-bold text-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {publishing ? 'Publishing…' : status === 'published' ? 'Re-publish' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
