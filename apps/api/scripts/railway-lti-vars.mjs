/**
 * Writes ONE file with every Railway variable the LTI connection needs (#63), generating the keys
 * and secrets locally. Paste its contents into Railway: project, production environment, service
 * `interview-differently`, Variables, "RAW Editor". Nothing is sent anywhere.
 *
 * Usage (from apps/api):
 *   npm run railway:lti-vars
 *   npm run railway:lti-vars -- --out ../../railway-lti-vars.env --force
 *   npm run railway:lti-vars -- --api-base https://api.example.com/api --learn-url https://learn.example.com --id-web-url https://app.example.com
 *
 * The file holds secrets: it is created readable by you only, refuses to overwrite without
 * --force, and the default name is git-ignored. Delete it after pasting.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const out = resolve(flag('out', 'railway-lti-vars.env'))
const apiBase = flag('api-base', 'https://api.interviewdifferently.com/api')
const learnUrl = flag('learn-url', 'https://learndifferently.tech')
const idWebUrl = flag('id-web-url', 'https://interviewdifferently.com')

for (const [name, value] of [
  ['--api-base', apiBase],
  ['--learn-url', learnUrl],
  ['--id-web-url', idWebUrl],
]) {
  let url
  try {
    url = new URL(value)
  } catch {
    console.error(`${name} is not a URL: ${value}`)
    process.exit(1)
  }
  if (url.protocol !== 'https:') {
    console.error(`${name} must be https for production: ${value}`)
    process.exit(1)
  }
}
if (existsSync(out) && !args.includes('--force')) {
  console.error(`${out} already exists. Delete it or pass --force.`)
  process.exit(1)
}

// A PEM on one line (newlines written as \n), which is the form the API reads from the environment.
const pem = () =>
  generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' })
    .toString()
    .trim()
    .replace(/\n/g, '\\n')
const secret = () => randomBytes(48).toString('base64')
const trim = (url) => url.replace(/\/+$/, '')

const lines = [
  '# Railway variables for the LTI connection (#63).',
  '# Paste into: project > production environment > service "interview-differently" > Variables > RAW Editor.',
  '# Contains secrets. Delete this file after pasting.',
  '',
  `LTI_PLATFORM_PRIVATE_KEY=${pem()}`,
  `LTI_TOOL_PRIVATE_KEY=${pem()}`,
  `LTI_TOOL_SECRET=${secret()}`,
  `LTI_HINT_SECRET=${secret()}`,
  `LTI_API_BASE=${trim(apiBase)}`,
  `LTI_LEARN_URL=${trim(learnUrl)}`,
  `LTI_ID_WEB_URL=${trim(idWebUrl)}`,
  'TRUST_PROXY=1',
  '',
]
writeFileSync(out, lines.join('\n'), { mode: 0o600 })
console.log(`Wrote ${out} (8 variables, readable by you only).`)
console.log(
  'Next: paste into Railway Variables, save, then delete the file. Deploy only after saving.'
)
console.log(
  `Check these URLs are right for production: API ${trim(apiBase)}, LearnDifferently ${trim(learnUrl)}, Interview Differently web ${trim(idWebUrl)}.`
)
