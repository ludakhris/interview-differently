/** Share of a video a learner must watch before it can be marked complete. */
export const VIDEO_COMPLETE_PCT = 90

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const NOCOOKIE_HOSTS = new Set(['youtube-nocookie.com', 'www.youtube-nocookie.com'])

export interface YouTubeVideo {
  videoId: string
  startSeconds: number | null
}

export const isVideoId = (v: unknown): v is string => typeof v === 'string' && VIDEO_ID.test(v)

/** "90", "90s" or "1m30s" as seconds, or null. */
function seconds(v: string | null): number | null {
  if (!v) return null
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/.exec(v)
  if (!m || (!m[1] && !m[2] && !m[3])) return null
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total > 0 && total <= 86400 ? total : null
}

/**
 * The video in a pasted YouTube link, or null. Only https links on YouTube's own
 * hosts are accepted, and only the 11-character ID is kept: what learners see is
 * built from that ID, never from the pasted text. A bare ID is accepted too.
 */
export function parseYouTube(input: string): YouTubeVideo | null {
  const raw = input.trim()
  if (isVideoId(raw)) return { videoId: raw, startSeconds: null }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const parts = url.pathname.split('/').filter(Boolean)
  let id: string | undefined
  if (host === 'youtu.be') {
    id = parts[0]
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === 'watch') id = url.searchParams.get('v') ?? undefined
    else if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) id = parts[1]
  } else if (NOCOOKIE_HOSTS.has(host)) {
    if (parts[0] === 'embed') id = parts[1]
  }
  if (!isVideoId(id)) return null
  return {
    videoId: id,
    startSeconds: seconds(url.searchParams.get('t') ?? url.searchParams.get('start')),
  }
}
