import { useEffect, useState } from 'react'

/**
 * "Book a walkthrough", pinned bottom-right once the hero has scrolled off, and hidden again
 * while the walkthrough form (#demo) is on screen so the call to action never appears twice.
 */
export function FloatingCta() {
  const [heroGone, setHeroGone] = useState(false)
  const [formNear, setFormNear] = useState(false)
  useEffect(() => {
    const hero = document.getElementById('top')
    const form = document.getElementById('demo')
    if (!hero || !form || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) setHeroGone(!e.isIntersecting)
        if (e.target === form) setFormNear(e.isIntersecting)
      }
    })
    io.observe(hero)
    io.observe(form)
    return () => io.disconnect()
  }, [])
  const show = heroGone && !formNear
  return (
    <a
      href="#demo"
      className={show ? 'c-float-cta c-float-cta-on' : 'c-float-cta'}
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
    >
      Book a walkthrough
    </a>
  )
}
