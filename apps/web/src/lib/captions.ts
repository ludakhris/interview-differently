// Captions for a pre-rendered avatar clip, built from the script it speaks. The clip has no word timings, so each
// line is timed in proportion to its length across the clip's duration: close enough to read along with.

const MAX_LINE = 90

/** The script split into caption lines: sentences, with long ones broken at word boundaries. */
export function captionLines(script: string): string[] {
  const lines: string[] = []
  for (const sentence of script.trim().split(/(?<=[.!?])\s+/)) {
    let line = ''
    for (const word of sentence.split(/\s+/).filter(Boolean)) {
      if (line && line.length + 1 + word.length > MAX_LINE) {
        lines.push(line)
        line = word
      } else line = line ? `${line} ${word}` : word
    }
    if (line) lines.push(line)
  }
  return lines
}

function stamp(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`
}

/** A WebVTT file for the script over `duration` seconds, or null when there is nothing to show. */
export function captionsVtt(script: string, duration: number): string | null {
  const lines = captionLines(script)
  if (!lines.length || !(duration > 0)) return null
  const total = lines.reduce((n, l) => n + l.length, 0)
  let at = 0
  const cues = lines.map((line, i) => {
    const end = i === lines.length - 1 ? duration : at + (duration * line.length) / total
    // line:78% keeps the caption above the player's control strip at the bottom.
    const cue = `${stamp(at)} --> ${stamp(end)} line:78%\n${line}`
    at = end
    return cue
  })
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}
