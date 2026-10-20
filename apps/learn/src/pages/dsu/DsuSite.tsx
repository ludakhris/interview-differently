import { useEffect, type ReactNode } from 'react'
import { resolveContext, withContext } from '../../brand'
import { DSU } from './dsuContent'
import { DsuCatalogPage, DsuProgramPage } from './DsuPages'
import { DsuRequestPage } from './DsuRequestPage'
import './dsu.css'

/**
 * The Delaware State University Adult & Continuing Education demonstration site (#124): the office's
 * program catalog with a request-to-enroll flow, styled after desu.edu and linking back to it.
 * Served at / and /lms/catalog/* on dsu.learndifferently.tech, or with ?site=dsu on any host.
 * Always marked as a demonstration: it is not an official DSU website.
 */
export function DsuSite({ pathname }: { pathname: string }) {
  const ctx = resolveContext(window.location.hostname, window.location.search)
  const href = (path: string) => withContext(ctx, path)
  const request = /^\/lms\/catalog\/([^/]+)\/request\/?$/.exec(pathname)
  const program = /^\/lms\/catalog\/([^/]+)\/?$/.exec(pathname)
  const tenant = ctx.tenant ?? 'dsu'

  let crumb = 'Program catalog'
  let page: ReactNode = <DsuCatalogPage tenant={tenant} href={href} />
  if (request) {
    crumb = 'Request enrollment'
    page = <DsuRequestPage tenant={tenant} courseId={decodeURIComponent(request[1])} href={href} />
  } else if (program) {
    crumb = 'Program'
    page = <DsuProgramPage tenant={tenant} courseId={decodeURIComponent(program[1])} href={href} />
  }

  // Never indexed, wherever it is served (home.html has no robots tag), and a title per page.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])
  useEffect(() => {
    document.title = `${crumb} — DSU Adult & Continuing Education (demonstration)`
  }, [crumb])

  return (
    <div className="dsu">
      <a className="dsu-skip" href="#dsu-main">
        Skip to content
      </a>
      <div className="dsu-demo" role="note">
        <strong>Demonstration site</strong> by Learn Differently. This is not an official Delaware
        State University website. Please don&apos;t enter real personal information.{' '}
        <a href={DSU.ace}>Go to the real Adult &amp; Continuing Education page</a>
      </div>
      <header className="dsu-header">
        <div className="dsu-wrap dsu-header-row">
          <a className="dsu-logo" href={href('/')}>
            <img src={DSU.logo} alt="Delaware State University program catalog (demonstration)" />
          </a>
          <nav className="dsu-nav" aria-label="Delaware State University">
            <a href={DSU.home}>DSU home</a>
            <a href={DSU.ace}>Adult &amp; Continuing Ed</a>
            <a href={DSU.priorLearning}>Credit for Prior Learning</a>
            <a href={DSU.courseGuide}>Course guide (PDF)</a>
            <a href={`mailto:${DSU.email}`}>Email the ACE office</a>
          </nav>
        </div>
      </header>
      <div className="dsu-wrap">
        <nav className="dsu-crumbs" aria-label="Breadcrumb">
          <span>Demonstration</span> <span aria-hidden="true">›</span>{' '}
          {crumb === 'Program catalog' ? (
            <span aria-current="page">{crumb}</span>
          ) : (
            <>
              <a href={href('/')}>Program catalog</a> <span aria-hidden="true">›</span>{' '}
              <span aria-current="page">{crumb}</span>
            </>
          )}
        </nav>
        <main id="dsu-main">{page}</main>
      </div>
      <footer className="dsu-footer">
        <div className="dsu-wrap dsu-footer-row">
          <div>
            <p className="dsu-footer-head">
              The real {DSU.office} office
              <br />
              {DSU.name}
            </p>
            <p>
              {DSU.address[0]}
              <br />
              {DSU.address[1]}
              <br />
              Hours: {DSU.hours}
            </p>
          </div>
          <div>
            <p>
              <a href={`tel:${DSU.phone}`}>{DSU.phone}</a>
              <br />
              <a href={`mailto:${DSU.email}`}>{DSU.email}</a>
            </p>
            <p>
              <a href={DSU.ace}>Back to desu.edu</a>
            </p>
            <p>
              <a href={href('/privacy')}>Privacy</a> ·{' '}
              <a href={href('/accessibility')}>Accessibility</a>
            </p>
          </div>
          <p className="dsu-footer-note">
            Demonstration site built by Learn Differently. Requests sent here go to Learn
            Differently, not to DSU. Program details are taken from the office&apos;s published
            course guide; the people shown to staff are fictional.
          </p>
        </div>
      </footer>
    </div>
  )
}
