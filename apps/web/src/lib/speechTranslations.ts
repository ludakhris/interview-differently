/**
 * Acronyms and terms that speech synthesisers mispronounce.
 * Keys are matched as whole words (case-insensitive).
 * Values are the spoken replacement passed to SpeechSynthesisUtterance.
 *
 * To add a new entry: just append to the map — no other changes needed.
 */
export const SPEECH_TRANSLATIONS: Record<string, string> = {
  SLA: 'S.L.A.',
  KPI: 'K.P.I.',
  KPIs: 'K.P.I.s',
  API: 'A.P.I.',
  APIs: 'A.P.I.s',
  SQL: 'S.Q.L.',
  UI: 'U.I.',
  UX: 'U.X.',
  CEO: 'C.E.O.',
  CFO: 'C.F.O.',
  COO: 'C.O.O.',
  CTO: 'C.T.O.',
  HR: 'H.R.',
  P1: 'P. 1',
  P2: 'P. 2',
  P3: 'P. 3',
}

/** Replace known acronyms with their spoken equivalents. */
export function applyAudioTranslations(text: string): string {
  return Object.entries(SPEECH_TRANSLATIONS).reduce((out, [word, spoken]) => {
    return out.replace(new RegExp(`\\b${word}\\b`, 'g'), spoken)
  }, text)
}
