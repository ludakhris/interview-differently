import { Link } from 'react-router-dom'
import { Wordmark } from '@/components/Wordmark'

/** Public status page (Better Stack); the badge is served from the same host. */
const STATUS_PAGE_URL = 'https://status.learndifferently.tech'
const CONTACT_EMAIL = 'info@learndifferently.tech'

/**
 * The Interview Differently footer: brand, links and the live status badge on an ink strip,
 * the same line Learn Differently's pages end with. Standalone pages only; never in an LTI launch.
 */
export function Footer() {
  const link = 'font-semibold text-[#f6f6f4] hover:underline underline-offset-4'
  return (
    <footer className="bg-[#14213a] text-[#f6f6f4] mt-auto">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 pt-7 pb-6 flex flex-wrap items-center justify-between gap-x-10 gap-y-4 text-[14px] leading-relaxed">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Wordmark onDark size="sm" />
          <span className="text-[#c9cfdb]">AI Powered Interview Simulations</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link to="/request-scenario" className={link}>
            Request a scenario
          </Link>
          <a href="/release-notes/" className={link}>
            Release notes
          </a>
          <a href="https://learndifferently.tech/privacy" className={link}>
            Privacy
          </a>
          <a href="https://learndifferently.tech/accessibility" className={link}>
            Accessibility
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
            Contact
          </a>
        </nav>
      </div>
      <div className="max-w-[1200px] mx-auto px-4 sm:px-8 pb-6 flex flex-wrap items-center justify-between gap-x-10 gap-y-3 text-[12px] text-[#c9cfdb]">
        <p>
          © {new Date().getFullYear()} Interview Differently · part of the{' '}
          <a
            href="https://learndifferently.tech"
            className="underline underline-offset-2 hover:text-[#f6f6f4]"
          >
            Learn Differently
          </a>{' '}
          family
        </p>
        {/* Fixed size, so the line lays out the same if the badge is blocked or slow. */}
        <iframe
          title="System status"
          src={`${STATUS_PAGE_URL}/badge?theme=dark`}
          width={250}
          height={30}
          loading="lazy"
          scrolling="no"
          className="block flex-none max-w-full border-0 bg-transparent"
          style={{ colorScheme: 'normal' }}
        />
      </div>
    </footer>
  )
}
