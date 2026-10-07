/** Pure rules for finishing an immersive interview launched from LearnDifferently. */

/** An interview scenario played by voice: immersive mode and a configured interviewer persona. */
export function isVoiceInterview(scenario: {
  mode?: string
  interviewer?: { presenterId?: string; voiceId?: string }
}): boolean {
  return (
    scenario.mode === 'immersive' &&
    Boolean(scenario.interviewer?.presenterId && scenario.interviewer?.voiceId)
  )
}

/** What the server stores when an answer had no speech in it (matches the API's marker). */
export const NO_SPEECH_TRANSCRIPT = '[No speech was detected in this answer.]'

/** True when a finished transcription found no real answer. */
export const heardNothing = (transcript: string | null): boolean =>
  transcript === NO_SPEECH_TRANSCRIPT

/**
 * True once every question node has a response with a transcript (the latest response per node
 * counts, as on the server). Transcription runs after the upload, so this is polled.
 */
export function transcriptsReady(
  responses: { nodeId: string; transcript: string | null }[],
  nodeIds: string[]
): boolean {
  const latest = new Map<string, string | null>()
  for (const r of responses) latest.set(r.nodeId, r.transcript)
  return nodeIds.length > 0 && nodeIds.every((id) => (latest.get(id) ?? '').trim() !== '')
}

/** A plain-language reason for a failed microphone or camera request. */
export function mediaErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone or camera access was blocked. Allow it for this site in your browser (the icon next to the address bar), then press Start recording again.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone or camera was found. Connect one, then press Start recording again.'
  }
  if (name === 'NotReadableError' || name === 'AbortError') {
    return 'Your microphone or camera is in use by another app or could not be started. Close the other app, then press Start recording again.'
  }
  return 'Could not access your microphone. Check your browser permissions, then press Start recording again.'
}
