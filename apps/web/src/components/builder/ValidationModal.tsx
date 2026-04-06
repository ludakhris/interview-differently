import type { ValidationError } from '@/hooks/useScenarioValidation'

interface ValidationModalProps {
  errors: ValidationError[]
  onClose: () => void
  onPublishConfirm?: () => void
}

export function ValidationModal({ errors, onClose, onPublishConfirm }: ValidationModalProps) {
  const hasErrors = errors.length > 0

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
        <div className="bg-[#111111] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
          <div className="p-6 border-b border-white/10">
            {hasErrors ? (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-amber-400 text-[20px]">⚠</span>
                  <h2 className="font-display font-bold text-[16px] text-[#f5f3ee]">
                    Cannot Publish — Issues Found
                  </h2>
                </div>
                <p className="text-[13px] text-white/40 ml-9">
                  Fix the following issues before publishing this scenario.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-[#2d9e5f] text-[20px]">✓</span>
                  <h2 className="font-display font-bold text-[16px] text-[#f5f3ee]">
                    Ready to Publish
                  </h2>
                </div>
                <p className="text-[13px] text-white/40 ml-9">
                  This scenario passes all validation checks.
                </p>
              </>
            )}
          </div>

          {hasErrors && (
            <div className="p-6 space-y-2 max-h-60 overflow-y-auto">
              {errors.map((err, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2.5"
                >
                  <span className="text-amber-400 text-[12px] mt-0.5 flex-shrink-0">●</span>
                  <p className="text-[12px] text-[#f5f3ee]/80 leading-relaxed">{err.message}</p>
                </div>
              ))}
            </div>
          )}

          {!hasErrors && (
            <div className="p-6">
              <p className="text-[13px] text-white/50 mb-4">
                Once published, this scenario will be available for assignment to cohorts. You can unpublish at any time.
              </p>
            </div>
          )}

          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-white/10 text-[13px] text-white/50 hover:text-white/70 hover:border-white/20 transition-all"
            >
              {hasErrors ? 'Fix Issues' : 'Cancel'}
            </button>
            {!hasErrors && onPublishConfirm && (
              <button
                onClick={onPublishConfirm}
                className="flex-1 py-2.5 rounded-lg bg-[#1a6b3c] hover:bg-[#2d9e5f] text-[13px] font-semibold text-white transition-colors"
              >
                Publish Scenario
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
