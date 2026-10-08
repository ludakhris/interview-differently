import type { RunnableCourse } from '@id/types'
import { useLoad } from './api'
import { useApp } from './app-context'
import { errorNotice } from './shared'

/** Read-only list of the courses an organization can run: published ones offered to it by providers. */
export function OfferedCoursesPage({ workspace }: { workspace: string }) {
  const { current, href } = useApp()
  const { data, error, loading } = useLoad<RunnableCourse[]>(
    `/learn/workspaces/${encodeURIComponent(workspace)}/runnable-courses`
  )
  if (error) return errorNotice(error)
  if (loading || !data) return <p className="dash-loading">Loading courses…</p>

  return (
    <>
      <div className="dash-head">
        <div>
          <h1 className="dash-h2">Courses</h1>
          <p className="dash-sub">
            {current?.name}. The courses your organization can run as cohorts.
          </p>
        </div>
      </div>

      <div className="dash-notice" role="note">
        <h2 className="dash-h2">Courses are authored by providers</h2>
        <p>
          Only training providers can create and edit courses. This page lists the courses providers
          have offered to your organization, so you can see what is available to run. To change the
          content of a course, contact the provider that offers it. You can start a cohort of any
          course below from <a href={href('/lms/cohorts')}>Cohorts</a>.
        </p>
      </div>

      {data.length === 0 ? (
        <div className="dash-empty">
          <h2 className="dash-card-title">No courses offered yet</h2>
          <p>When a provider offers a course to your organization, it will appear here.</p>
        </div>
      ) : (
        <ul className="dash-courselist">
          {data.map((c) => (
            <li key={c.id} className="dash-card dash-course">
              <div className="dash-course-main">
                <span className="dash-course-title">{c.title}</span>
                <p className="dash-sub">
                  {[c.provider, c.lengthWeeks ? `${c.lengthWeeks} weeks` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
