/** Banner at the top of the LearnDifferently dashboard: agencies can have it white-labeled (Delaware does). */
export function DelawareSkinPromo({ href }: { href: string }) {
  return (
    <aside className="dash-promo" aria-label="White-labeled dashboard">
      <div className="dash-promo-text">
        <span className="dash-promo-tag">White-label</span>
        <strong>Your agency, your brand.</strong>
        <p>
          The Delaware Department of Labor runs this dashboard under its own name, colors and logo,
          on its own address. Agencies can have the same for their programs.
        </p>
        <a className="dash-promo-cta" href={href}>
          See the Delaware version <span aria-hidden="true">→</span>
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
