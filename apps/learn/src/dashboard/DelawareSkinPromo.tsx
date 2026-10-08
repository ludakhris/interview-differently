import { CONTACT_EMAIL } from '../contact'

/**
 * Banner for the LearnDifferently dashboard: agencies can have it white-labeled (Delaware does).
 * With `href` it links to the Delaware version; without, it invites agencies to get in touch.
 */
export function DelawareSkinPromo({ href }: { href?: string }) {
  const contact = href === undefined
  return (
    <aside
      className={`dash-promo${contact ? ' dash-promo-contact' : ''}`}
      aria-label="White-labeled dashboard"
    >
      <div className="dash-promo-text">
        <span className="dash-promo-tag">White-label</span>
        <strong>Your agency, your brand.</strong>
        <p>
          The Delaware Department of Labor runs this dashboard under its own name, colors and logo,
          on its own address. Agencies can have the same for their programs.
          {contact && ' Get in touch.'}
        </p>
        <a
          className="dash-promo-cta"
          href={
            contact
              ? `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('White-labeled dashboard')}`
              : href
          }
        >
          {contact ? 'Contact us about white-labeling' : 'See the Delaware version'}{' '}
          <span aria-hidden="true">→</span>
        </a>
      </div>
      <div className="dash-promo-preview" aria-hidden="true">
        <div className="dash-promo-bar">
          <span className="dash-promo-logo" />
          <span className="dash-promo-line" />
          <span className="dash-promo-spark" />
        </div>
        <div className="dash-promo-tiles">
          <span />
          <span />
          <span className="dash-promo-tile-hot" />
        </div>
        <span className="dash-promo-chart" />
      </div>
    </aside>
  )
}
