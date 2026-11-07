/**
 * The interview/differently wordmark: a ring with a blue dot, then the name with a blue slash.
 * Mirrors learn/differently's mark (which has an orange dot). Colours come from the theme, so
 * `onDark` only swaps the ink for paper.
 */
export function BrandMark({ size = 26, onDark = false }: { size?: number; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="flex-none">
      <circle
        cx="15"
        cy="15"
        r="13.5"
        fill="none"
        stroke={onDark ? '#f6f6f4' : '#14213a'}
        strokeWidth="3"
      />
      <circle cx="15" cy="15" r="8" fill="#2563eb" />
    </svg>
  )
}

export function Wordmark({
  onDark = false,
  size = 'md',
}: {
  onDark?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const text = { sm: 'text-[15px]', md: 'text-[19px]', lg: 'text-[24px]' }[size]
  const mark = { sm: 20, md: 26, lg: 32 }[size]
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark size={mark} onDark={onDark} />
      <span
        className={`font-display font-semibold tracking-[-0.02em] leading-none ${text} ${onDark ? 'text-[#f6f6f4]' : 'text-[#14213a]'}`}
      >
        interview<span className="text-[#2563eb]">/</span>differently
      </span>
    </span>
  )
}
