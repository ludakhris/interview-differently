import { SimpleShell } from './SimpleShell'

const UPDATED = 'October 19, 2026'
const ACCESSIBILITY_EMAIL = 'accessibility@learndifferently.tech'

export function AccessibilityPage() {
  const mail = <a href={`mailto:${ACCESSIBILITY_EMAIL}`}>{ACCESSIBILITY_EMAIL}</a>
  return (
    <SimpleShell>
      <h1 className="ld-h2">Accessibility</h1>
      <p className="ld-sub">Last updated {UPDATED}.</p>
      <p className="ld-sub">
        We want everyone who learns or works with Learn Differently and its subcomponents (as
        defined on our Products pages), including Interview Differently, to be able to use them,
        whatever their abilities and whatever tools they use. We aim to meet the Web Content
        Accessibility Guidelines (WCAG) 2.1 at level AA.
      </p>

      <h2 className="ld-h3">What we do</h2>
      <ul className="ld-sub">
        <li>
          Every screen of our apps is checked automatically for common accessibility mistakes each
          time we change the code, and a change that adds one is not released.
        </li>
        <li>
          The pages learners and staff open before signing in are scanned automatically against WCAG
          2.1 A and AA on every change.
        </li>
        <li>
          We build for keyboard and screen reader use: links and buttons are reachable with the
          keyboard, dialogs close with Escape, and form fields have labels a screen reader can read.
        </li>
        <li>New features are reviewed screen by screen before they are released.</li>
      </ul>

      <h2 className="ld-h3">Where we are today</h2>
      <p className="ld-sub">
        An independent accessibility audit has not been done yet, so we do not yet claim full
        conformance. A part we know falls short:
      </p>
      <ul className="ld-sub">
        <li>
          Our marketing homepage and product pages use brand colours that do not meet contrast
          requirements for some text. The pages learners and staff use do.
        </li>
      </ul>

      <h2 className="ld-h3">Tell us about a problem, or ask for another format</h2>
      <p className="ld-sub">
        If something is hard to use, or you need content in another format (for example large print,
        a transcript, or a document that works with your screen reader), email {mail}. Say which
        page or screen, and what happened. We reply within 5 business days. If you use our products
        through a training program, you can also ask your program’s staff to contact us for you.
      </p>
    </SimpleShell>
  )
}
