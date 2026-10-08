import './design-switch.css'

/**
 * Review-only toggle between the two candidate homepages (site-alt branch). The same
 * deployment serves Design B at / and Design A at /?design=a; this makes that visible.
 */
export function DesignSwitch({ current }: { current: 'a' | 'b' }) {
  return (
    <nav className="dsw" aria-label="Design under review">
      <span className="dsw-label">Reviewing</span>
      <a
        href="/?design=a"
        className={current === 'a' ? 'dsw-on' : undefined}
        aria-current={current === 'a' ? 'page' : undefined}
      >
        Design A
      </a>
      <a
        href="/"
        className={current === 'b' ? 'dsw-on' : undefined}
        aria-current={current === 'b' ? 'page' : undefined}
      >
        Design B
      </a>
    </nav>
  )
}
