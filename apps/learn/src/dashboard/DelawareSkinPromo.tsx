/** Reminder, at the top of the LearnDifferently dashboard, that agencies can have it white-labeled (Delaware does). */
export function DelawareSkinPromo({ href }: { href: string }) {
  return (
    <aside className="dash-promo" aria-label="White-labeled dashboard">
      <div>
        <strong>Also available white-labeled</strong>
        <p>
          The Delaware Department of Labor runs this dashboard under its own name, colors and logo,
          on its own address. Agencies can have the same for their programs.
        </p>
      </div>
      <a className="dash-btn-secondary" href={href}>
        Open the Delaware Department of Labor version
      </a>
    </aside>
  )
}
