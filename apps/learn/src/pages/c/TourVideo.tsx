import { useEffect, useRef } from 'react'

/**
 * The outcomes tour: a short, silent, looping recording of the real product. Autoplays
 * muted (React does not render the muted attribute, so it is set here); people who prefer
 * reduced motion get the poster with controls instead.
 */
export function TourVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.muted = true
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.controls = true
      return
    }
    el.play().catch(() => {
      el.controls = true
    })
  }, [])
  return (
    <video
      ref={ref}
      className="c-tour-video"
      src="/site/outcomes-tour.mp4"
      poster="/site/outcomes-tour-poster.jpg"
      width="1280"
      height="860"
      loop
      playsInline
      preload="metadata"
      aria-label="A thirty-second tour of the real product: a state's view across providers, one provider's cohorts, one cohort's gradebook, and the export"
    />
  )
}
