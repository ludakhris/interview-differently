import './review-switch.css'

export interface ReviewOption {
  key: string
  label: string
}

/**
 * Review-only control for comparing design options on the real page. A small dark pill fixed at the
 * bottom left; hover or focus it to open the options. Each option is the same page with `?<param>=<key>`,
 * keeping every other query parameter (?site=, ?brand=). Remove it, and the options it switches
 * between, once one is chosen. See "Design experiments" in CLAUDE.md.
 */
export function ReviewSwitch({
  param,
  label,
  options,
  current,
}: {
  /** The query parameter that picks the option, e.g. "layout". */
  param: string
  /** What is being reviewed, e.g. "Section layout". */
  label: string
  options: ReviewOption[]
  /** The key of the option on screen. */
  current: string
}) {
  const hrefFor = (key: string) => {
    const q = new URLSearchParams(window.location.search)
    q.set(param, key)
    return `${window.location.pathname}?${q.toString()}${window.location.hash}`
  }
  const on = options.find((o) => o.key === current) ?? options[0]
  return (
    <nav className="rsw" aria-label={`${label} under review`}>
      <span className="rsw-label">{label}:</span>
      <span className="rsw-current">{on?.label}</span>
      <span className="rsw-options">
        {options.map((o) => (
          <a
            key={o.key}
            href={hrefFor(o.key)}
            className={o.key === on?.key ? 'rsw-on' : undefined}
            aria-current={o.key === on?.key ? 'page' : undefined}
          >
            {o.label}
          </a>
        ))}
      </span>
    </nav>
  )
}
