import { CONTACT_EMAIL } from '../contact'
import './site-footer.css'

/** Public status page (Better Stack). The footer badge is served from the same host. */
export const STATUS_PAGE_URL = 'https://status.learndifferently.tech'

/**
 * The one Learn Differently footer line: brand, links and the live status badge. Used on the
 * homepage (inside its dark closing section, `bare`), the secondary pages and the signed-in app
 * (in its own dark strip). Never shown under a white-label skin. Needs the `.ld` tokens (home.css).
 */
export function SiteFooter({
  productsHref = '/#team',
  bare = false,
}: {
  productsHref?: string
  bare?: boolean
}) {
  const footer = (
    <footer className="ld-footer">
      <div className="ld-footer-brand">
        <span className="ld-footer-name">learn/differently</span>
        <span>Training that adapts. Admin work, automated.</span>
      </div>
      <div className="ld-footer-end">
        <nav aria-label="Footer" className="ld-footer-links">
          <a href={productsHref}>Products</a>
          <a href="/release-notes/">Release notes</a>
          <a href="/privacy">Privacy</a>
          <a href="/accessibility">Accessibility</a>
          <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
        </nav>
        {/* Fixed size, so the line lays out the same if the badge is blocked or slow. */}
        <iframe
          className="ld-footer-status"
          title="Learn Differently system status"
          src={`${STATUS_PAGE_URL}/badge?theme=dark`}
          width={250}
          height={30}
          loading="lazy"
          scrolling="no"
          style={{ colorScheme: 'normal' }}
        />
      </div>
    </footer>
  )
  if (bare) return footer
  return (
    <div className="ld-site-footer">
      <div className="ld-wrap">{footer}</div>
    </div>
  )
}
