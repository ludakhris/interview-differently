/**
 * The connected tools a new environment starts with (#63): the Interview Differently connection
 * and its two tools (a practice lab and a graded assessment), written to the registry tables.
 *
 * Each field comes from env (LTI_API_BASE and the optional LTI_TOOL_* overrides), so every
 * environment points at its own host. It is safe to run again: it only adds what is missing and
 * never changes or removes a row an admin has edited. A tool or connection that already exists
 * (by id; a connection also by client id) is left alone. Every row it adds is recorded in the
 * history as made by "System (seed script)".
 *
 * Usage (from apps/api):
 *   npm run seed:lti-tools -- --dry-run              # show what would be added
 *   npm run seed:lti-tools                           # add what is missing
 *   npm run seed:lti-tools -- --allow-host <host>    # run against a non-dev database
 *
 * Refuses to run unless DATABASE_URL points at localhost or the Railway dev database. Pass
 * --allow-host for production only with the owner's OK, and with that environment's LTI_API_BASE set.
 */

import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { defaultConnections, defaultTools } from '../src/lti/platform/default-tools'
import { diffConnection, diffTool } from '../src/lti/platform/tool-config'

const DEV_HOSTS = ['localhost', '127.0.0.1', 'zephyr.proxy.rlwy.net']
const WHO = { userId: null, userName: 'System (seed script)' }

function targetHost(allowHost: string | undefined): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const host = new URL(url).hostname
  if (DEV_HOSTS.includes(host) || host === allowHost) return host
  throw new Error(
    `DATABASE_URL points at ${host}, which is not a development database. ` +
      `Pass --allow-host ${host} only with the owner's OK.`
  )
}

async function main() {
  const argv = process.argv.slice(2)
  const i = argv.indexOf('--allow-host')
  const host = targetHost(i >= 0 ? argv[i + 1] : undefined)
  const dryRun = argv.includes('--dry-run')
  const prisma = new PrismaClient()
  try {
    console.log(`Database: ${host}${dryRun ? ' (dry run: nothing is written)' : ''}`)
    const connections = await prisma.ltiConnection.findMany({
      select: { id: true, clientId: true },
    })
    const existingTools = new Set(
      (await prisma.ltiTool.findMany({ select: { toolId: true } })).map((t) => t.toolId)
    )

    // A connection is the same registration when its id or client id is already there; tools then
    // attach to the one that exists.
    const idFor = new Map<string, string>()
    const newConnections = defaultConnections().filter((c) => {
      const same = connections.find((x) => x.id === c.id || x.clientId === c.clientId)
      if (same) idFor.set(c.id, same.id)
      return !same
    })
    const newTools = defaultTools()
      .filter((t) => !existingTools.has(t.toolId))
      .map((t) => ({ ...t, connectionId: idFor.get(t.connectionId) ?? t.connectionId }))

    for (const c of defaultConnections())
      console.log(
        `  connection ${c.id}: ${newConnections.some((n) => n.id === c.id) ? 'add' : 'already there'}`
      )
    for (const t of defaultTools())
      console.log(
        `  tool ${t.toolId}: ${newTools.some((n) => n.toolId === t.toolId) ? 'add' : 'already there'}`
      )
    if (dryRun || (newConnections.length === 0 && newTools.length === 0)) {
      console.log(dryRun ? 'Dry run: nothing written.' : 'Nothing to add.')
      return
    }

    const entry = (
      subject: 'connection' | 'tool',
      subjectId: string,
      subjectName: string,
      changes: object
    ) => ({ subject, subjectId, subjectName, action: 'created', ...WHO, changes })
    await prisma.$transaction([
      prisma.ltiConnection.createMany({ data: newConnections, skipDuplicates: true }),
      prisma.ltiTool.createMany({
        data: newTools.map((t) => ({
          toolId: t.toolId,
          connectionId: t.connectionId,
          name: t.name,
          kind: t.kind,
          retries: t.retries,
          labelable: t.labelable,
          enabled: t.enabled,
          workspaceIds: t.workspaceIds,
          referenceLabel: t.referenceLabel,
          referenceHelp: t.referenceHelp,
        })),
        skipDuplicates: true,
      }),
      prisma.ltiRegistryChange.createMany({
        data: [
          ...newConnections.map((c) => entry('connection', c.id, c.name, diffConnection(null, c))),
          ...newTools.map((t) => entry('tool', t.toolId, t.name, diffTool(null, t))),
        ],
      }),
    ])
    console.log(`Added ${newConnections.length} connection(s) and ${newTools.length} tool(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
