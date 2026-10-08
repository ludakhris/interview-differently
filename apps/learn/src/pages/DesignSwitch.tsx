import './design-switch.css'

export type Design = 'a' | 'b' | 'c'

const DESIGNS: { key: Design; href: string; label: string }[] = [
  { key: 'a', href: '/?design=a', label: 'Design A' },
  { key: 'b', href: '/', label: 'Design B' },
  { key: 'c', href: '/?design=c', label: 'Design C' },
]

/**
 * Review-only toggle between the candidate homepages (site-alt and site-c branches). The same
 * deployment serves Design B at /, Design A at /?design=a and Design C at /?design=c.
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
          {d.label}
        </a>
      ))}
    </nav>
  )
}
