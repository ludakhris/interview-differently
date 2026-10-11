import { Prisma } from '@prisma/client'

/**
 * The tables that carry row-level security (the ones with a `tenant_read` policy, see
 * prisma/migrations/20261014110000_tenant_rls). A spec keeps this list equal to the database. A query that
 * cannot reach any of them skips the per-query transaction that sets the tenant context.
 */
export const TENANT_TABLES: ReadonlySet<string> = new Set([
  'Cohort',
  'CohortSession',
  'Enrollment',
  'JoinRequest',
  'Membership',
  'ActivitySession',
  'AttendanceMark',
  'ItemProgress',
  'ItemAttempt',
  'PlanItem',
  'ParticipantNote',
  'SupportItem',
  'Course',
  'CourseModule',
  'CourseItem',
  'CourseOffer',
  'RoleInvite',
])

type Fields = Map<string, string> // relation field name -> the model it points at
const relations = new Map<string, Fields>()
for (const m of Prisma.dmmf.datamodel.models) {
  relations.set(
    m.name,
    new Map(m.fields.filter((f) => f.kind === 'object').map((f) => [f.name, f.type]))
  )
}

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)

/**
 * Whether a query on `model` with these arguments can read or write a tenant table: the model itself is
 * one, or a relation followed anywhere in its select, include, where or nested writes leads to one. When in
 * doubt (an unknown model) it says yes, which only costs speed.
 */
export function touchesTenantTable(model: string, args: unknown): boolean {
  if (TENANT_TABLES.has(model)) return true
  const fields = relations.get(model)
  if (!fields) return true
  const walk = (node: unknown, current: string): boolean => {
    if (Array.isArray(node)) return node.some((n) => walk(n, current))
    if (!isPlain(node)) return false
    const own = relations.get(current)
    for (const [key, value] of Object.entries(node)) {
      const target = own?.get(key)
      if (target) {
        if (TENANT_TABLES.has(target) || walk(value, target)) return true
      } else if (walk(value, current)) {
        return true
      }
    }
    return false
  }
  return walk(args, model)
}
