import { useEffect, useState } from 'react'
import './cohort-jump-bar.css'

const SECTIONS: [string, string][] = [
  ['h-attendance', 'Attendance'],
  ['h-assessments', 'Assessments'],
  ['h-roster', 'Roster'],
]

/**
 * A dark bar of links to the cohort page's sections, with the one being read marked. Only the
 * sections on the page are listed (an online cohort has no attendance), and the bar is hidden when
 * there is nothing to jump to.
 */
export function CohortJumpBar() {
  const [present, setPresent] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)

  // Sections load at different times: look again for a while.
  useEffect(() => {
    const check = () => {
      const now = SECTIONS.map(([id]) => id).filter((id) => document.getElementById(id))
      setPresent((cur) => (cur.join() === now.join() ? cur : now))
    }
    check()
    const timer = window.setInterval(check, 700)
    return () => window.clearInterval(timer)
  }, [])

  // Mark the last section whose heading has reached the upper part of the screen.
  useEffect(() => {
    const els = present
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e)
    if (els.length === 0) return
    const update = () => {
      const reached = els.filter((e) => e.getBoundingClientRect().top <= window.innerHeight * 0.35)
      setActive((reached[reached.length - 1] ?? els[0]).id)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [present])

  if (present.length === 0) return null
  return (
    <nav className="cjb" aria-label="Jump to a section">
      <span className="cjb-label">On this page</span>
      {SECTIONS.filter(([id]) => present.includes(id)).map(([id, label]) => (
        <a
          key={id}
          href={`#${id}`}
          className={active === id ? 'cjb-on' : undefined}
          aria-current={active === id ? 'location' : undefined}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}
