import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const SAY = '/usr/bin/say'
const CACHE = join(tmpdir(), 'ld-spark-voice')

/**
 * Narration for lessons made for the learner, read by macOS's `say` (adaptive checkpoints prototype). Only where
 * the API runs on a Mac (a local demo); anywhere else there is no `say`, and the player uses the browser's voice.
 * The voice is the Mac's default, or SPARK_SAY_VOICE. Each recording is kept, keyed by voice and text.
 */
export const canSpeak = (): boolean => process.platform === 'darwin' && existsSync(SAY)

export async function speak(text: string): Promise<Buffer | null> {
  if (!canSpeak() || !text.trim()) return null
  const voice = process.env.SPARK_SAY_VOICE || ''
  const key = createHash('sha256').update(`${voice}\n${text}`).digest('hex')
  const wav = join(CACHE, `${key}.wav`)
  if (existsSync(wav)) return readFile(wav)
  await mkdir(CACHE, { recursive: true })
  // The text goes in a file, never on the command line, so nothing in it can act as an option.
  const input = join(CACHE, `${key}.txt`)
  await writeFile(input, text.slice(0, 2000), 'utf8')
  await run(
    SAY,
    [
      ...(voice ? ['-v', voice] : []),
      '-f',
      input,
      '-o',
      wav,
      '--file-format=WAVE',
      '--data-format=LEI16@22050',
    ],
    { timeout: 30_000 }
  )
  return readFile(wav)
}
