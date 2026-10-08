import './design-switch.css'

export type Design = 'a' | 'b' | 'c'

const DESIGNS: { key: Design; href: string; label: string }[] = [
  { key: 'a', href: '/?design=a', label: 'A' },
  { key: 'b', href: '/?design=b', label: 'B' },
  { key: 'c', href: '/', label: 'C' },
]

/**
 * Review-only toggle between the candidate homepages (site-c branch). The same deployment
 * serves Design C at /, Design A at /?design=a and Design B at /?design=b.
 */
export function DesignSwitch({ current }: { current: Design }) {
  return (
    <nav className="dsw" aria-label="Design under review">
      <span className="dsw-label">Reviewing</span>
      {DESIGNS.map((d) => (
        <a
          key={d.key}
          href={d.href}
          className={current === d.key ? 'dsw-on' : undefined}
          aria-current={current === d.key ? 'page' : undefined}
        >
          <span className="dsw-full">Design </span>
          {d.label}
        </a>
      ))}
    </nav>
  )
}
