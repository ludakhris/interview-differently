/**
 * A stand-in tool for trying LTI Dynamic Registration locally (#63). It is not a real tool: it only
 * registers itself with the platform and publishes its keys; it does not implement a launch.
 *
 * Usage (from apps/api, with the API and the learn app running):
 *   npm run mock:lti-tool
 * then on /lms/admin/tools choose "Register a tool from its link" and paste
 *   http://localhost:4010/register
 * The tool's tab shows what the platform answered, and the page lists a new connection with one
 * tool, switched off. This writes to whichever database the API uses, so remove the connection
 * afterwards (remove its tool, then the connection) when you are done.
 *
 * Local only: the platform accepts an http://localhost link outside production, and this script
 * refuses to run with NODE_ENV=production. MOCK_TOOL_PORT changes the port (default 4010).
 */

import 'dotenv/config'
import { createServer } from 'node:http'
import { generateKeyPair, jwksOf } from '../src/lti/lti-spec'

if (process.env.NODE_ENV === 'production') {
  console.error('The mock tool is for local development only.')
  process.exit(1)
}

const port = Number(process.env.MOCK_TOOL_PORT ?? 4010)
const base = `http://localhost:${port}`
const keys = generateKeyPair()

const esc = (v: unknown): string => String(v).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const page = (title: string, body: string) =>
  `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>` +
  `<body style="font:16px system-ui;max-width:40em;margin:3em auto;padding:0 1em">` +
  `<h1>${esc(title)}</h1>${body}`

/** Reads the platform's configuration, posts this tool's registration, and reports what came back. */
async function register(configUrl: string, token: string): Promise<string> {
  const config = (await (await fetch(configUrl)).json()) as { registration_endpoint?: string }
  if (!config.registration_endpoint)
    throw new Error('The platform did not name a registration endpoint')
  const res = await fetch(config.registration_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      application_type: 'web',
      response_types: ['id_token'],
      grant_types: ['implicit', 'client_credentials'],
      token_endpoint_auth_method: 'private_key_jwt',
      client_name: `Mock Tool (port ${port})`,
      initiate_login_uri: `${base}/login`,
      redirect_uris: [`${base}/launch`],
      jwks_uri: `${base}/jwks`,
      scope: 'openid https://purl.imsglobal.org/spec/lti-ags/scope/score',
      'https://purl.imsglobal.org/spec/lti-tool-configuration': {
        domain: `localhost:${port}`,
        target_link_uri: `${base}/launch`,
        messages: [{ type: 'LtiResourceLinkRequest' }],
      },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`The platform refused it (${res.status}): ${text}`)
  const out = JSON.parse(text) as { client_id?: string }
  return page(
    'Registered',
    `<p>The platform registered this tool. Its client id is <code>${esc(out.client_id)}</code>.</p>` +
      `<p>Go back to the Connected tools page: it now lists a new connection with one tool that is ` +
      `switched off. You can close this tab.</p>`
  )
}

createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', base)
    const send = (status: number, type: string, body: string) => {
      res.writeHead(status, { 'Content-Type': type })
      res.end(body)
    }
    try {
      if (url.pathname === '/jwks')
        return send(200, 'application/json', JSON.stringify(jwksOf(keys)))
      if (url.pathname === '/register') {
        const config = url.searchParams.get('openid_configuration')
        const token = url.searchParams.get('registration_token')
        if (!config || !token)
          return send(
            400,
            'text/html',
            page(
              'Not a registration link',
              '<p>The link needs openid_configuration and registration_token.</p>'
            )
          )
        return send(200, 'text/html', await register(config, token))
      }
      if (url.pathname === '/login' || url.pathname === '/launch')
        return send(
          200,
          'text/html',
          page('Mock tool', '<p>This stand-in tool does not implement launches.</p>')
        )
      return send(404, 'text/plain', 'Not found')
    } catch (err) {
      send(
        502,
        'text/html',
        page('Registration failed', `<p>${esc(err instanceof Error ? err.message : err)}</p>`)
      )
    }
  })()
}).listen(port, () => console.log(`Mock tool: paste ${base}/register into the registration panel`))
