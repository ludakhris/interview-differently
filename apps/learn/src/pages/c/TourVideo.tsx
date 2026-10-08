import { useRef, useState } from 'react'

/**
 * The outcomes tour: a short, silent recording of the real product. It shows its poster
 * with a play button and only plays when asked; controls appear once it starts.
 */
export function TourVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const start = () => {
    const el = ref.current
    if (!el) return
    el.controls = true
    el.play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(true))
  }
  return (
    <div className={playing ? 'c-tour c-tour-playing' : 'c-tour'}>
      <video
        ref={ref}
        className="c-tour-video"
        src="/site/outcomes-tour.mp4"
        poster="/site/outcomes-tour-poster.jpg"
        width="1280"
        height="860"
        playsInline
        preload="metadata"
        aria-label="A forty-second tour of the real product: a state's view across providers, one provider's cohorts, one cohort's gradebook, attendance, and the export"
      />
      {!playing && (
        <button
          type="button"
          className="c-tour-play"
          onClick={start}
          aria-label="Play the tour, 40 seconds, no sound"
        >
          <span className="c-tour-play-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
