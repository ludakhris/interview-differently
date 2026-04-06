import { useState, useEffect } from 'react'

const isMobileDevice =
  typeof window !== 'undefined' &&
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

export function MobileWarning() {
  const [visible, setVisible] = useState(isMobileDevice)
  const [timeLeft, setTimeLeft] = useState(10)

  useEffect(() => {
    if (!visible) return
    if (timeLeft === 0) {
      setVisible(false)
      return
    }
    const t = setTimeout(() => setTimeLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [visible, timeLeft])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-10 px-6 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-sm bg-[#111111] border border-white/15 rounded-2xl p-5 shadow-2xl">
        <div className="flex items-start gap-4">
          <span className="text-[26px] leading-none mt-0.5">🖥️</span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[#f5f3ee] mb-1">Best on desktop</p>
            <p className="text-[12px] text-white/40 leading-relaxed">
              The scenario builder is designed for larger screens. For the full experience, open it on your laptop or desktop.
            </p>
          </div>
          <button
            onClick={() => setVisible(false)}
            className="text-white/30 hover:text-white/60 text-[18px] leading-none flex-shrink-0 transition-colors"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden mr-3">
            <div
              className="h-full bg-white/25 rounded-full transition-all duration-1000"
              style={{ width: `${(timeLeft / 10) * 100}%` }}
            />
          </div>
          <span className="text-[11px] text-white/25 flex-shrink-0">Closes in {timeLeft}s</span>
        </div>
      </div>
    </div>
  )
}
