import { requireHostConfirmation } from './lib/db-guard'
import { PrismaService } from '../src/prisma/prisma.service'
import { withTenantContext, identifyCaller, runAsSystem } from '../src/core/tenant-context'

requireHostConfirmation()
const p = new PrismaService()
// Reads the role the connection has, which switches the tenant context on (DATABASE_URL is the restricted role).
const A = 'demo-inst-delaware-dol'
const say = async (label: string, fn: () => Promise<unknown>) => {
  try {
    console.log(label.padEnd(34), JSON.stringify(await fn()))
  } catch (e) {
    console.log(
      label.padEnd(34),
      'ERR',
      String((e as Error).message)
        .split('\n')
        .filter(Boolean)
        .pop()
        ?.slice(0, 100)
    )
  }
}
;(async () => {
  await p.onModuleInit() // reads the connection's role: DATABASE_URL must be the restricted role
  await say('no context cohorts (want 0)', () => p.cohort.count())
  const staff = (
    await runAsSystem(() =>
      p.membership.findFirst({
        where: { cohortId: null, institution: { id: A } },
        select: { userId: true },
      })
    )
  )?.userId
  console.log('delaware staff membership user:', staff ?? '(none in dev)')
  await runAsSystem(async () => {
    await say('system cohorts (want 25)', () => p.cohort.count())
    await say(
      'system raw (want 25)',
      async () => (await p.$queryRaw<{ n: number }[]>`select count(*)::int n from "Cohort"`)[0].n
    )
    await say('system array tx', () => p.$transaction([p.cohort.count(), p.enrollment.count()]))
    await say(
      'system include',
      async () =>
        (await p.cohort.findMany({ take: 1, include: { enrollments: { take: 1 } } })).length
    )
  })
  // atomicity
  const inst = (await runAsSystem(() =>
    p.institution.findFirst({ where: { parentId: A, kind: 'provider' }, select: { id: true } })
  ))!.id
  await runAsSystem(async () => {
    await p
      .$transaction(async (tx) => {
        await tx.cohort.create({ data: { institutionId: inst, name: 'TXTEST' } })
        throw new Error('boom')
      })
      .catch(() => {})
    await say('after interactive rollback (want 0)', () =>
      p.cohort.count({ where: { name: 'TXTEST' } })
    )
    await p
      .$transaction([
        p.cohort.create({ data: { institutionId: inst, name: 'TXTEST2' } }),
        p.cohort.create({ data: { institutionId: 'nope', name: 'TXTEST3' } }),
      ])
      .catch(() => {})
    await say('after array rollback (want 0)', () =>
      p.cohort.count({ where: { name: { startsWith: 'TXTEST' } } })
    )
  })
  // a learner sees only their own
  const learner = (await runAsSystem(() => p.enrollment.findFirst({ select: { userId: true } })))!
    .userId
  await withTenantContext(async () => {
    identifyCaller({ userId: learner })
    await say('learner enrollments', () => p.enrollment.count())
    await say('learner cohorts', () => p.cohort.count())
    await say('learner notes (want 0)', () => p.participantNote.count())
  })
  await p.$disconnect()
})()
