import { PlatformRegistryService } from './platform-registry.service'

type Row = Record<string, unknown>

/** Runs only when awaited, so a transaction can run its operations in order and undo them. */
const lazy = <T>(fn: () => Promise<T>): PromiseLike<T> => ({ then: (a, b) => fn().then(a, b) })

/** An in-memory stand-in for the two platform tables, with the unique (issuer, clientId) key. */
export function fakePlatformDb(initial: Row[] = []) {
  const platforms: Row[] = initial.map((r, i) => ({
    id: `p${i + 1}`,
    enabled: false,
    approvedAt: null,
    createdAt: new Date(2026, 0, 1 + i),
    updatedAt: new Date(),
    ...r,
  }))
  const changes: Row[] = []
  const find = (where: Row) =>
    platforms.find((p) =>
      where.id
        ? p.id === where.id
        : p.issuer === (where.issuer_clientId as Row).issuer &&
          p.clientId === (where.issuer_clientId as Row).clientId
    ) ?? null
  const db = {
    platforms,
    changes,
    ltiPlatform: {
      findMany: async () => platforms.map((p) => ({ ...p })),
      findUnique: async ({ where }: { where: Row }) => {
        const p = find(where)
        return p && { ...p }
      },
      create: ({ data }: { data: Row }) =>
        lazy(async () => {
          if (find({ issuer_clientId: data }))
            throw Object.assign(new Error('unique'), { code: 'P2002' })
          const row = { approvedAt: null, createdAt: new Date(), updatedAt: new Date(), ...data }
          platforms.push(row)
          return { ...row }
        }),
      deleteMany: async ({ where }: { where: Row }) => {
        const i = platforms.findIndex(
          (p) =>
            p.id === where.id && p.enabled === where.enabled && p.approvedAt === where.approvedAt
        )
        if (i >= 0) platforms.splice(i, 1)
        return { count: i >= 0 ? 1 : 0 }
      },
      update: ({ where, data }: { where: Row; data: Row }) =>
        lazy(async () => {
          const p = find(where)!
          Object.assign(p, data)
          return { ...p }
        }),
    },
    ltiPlatformChange: {
      create: ({ data }: { data: Row }) =>
        lazy(async () => {
          const row = { id: `c${changes.length + 1}`, createdAt: new Date(), ...data }
          changes.push(row)
          return row
        }),
      findMany: async ({ where }: { where: Row }) =>
        changes.filter((c) => !where.subjectId || c.subjectId === where.subjectId).reverse(),
    },
    // all or nothing, like the real one
    $transaction: async (ops: PromiseLike<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
      const before = { p: platforms.map((x) => ({ ...x })), c: changes.length }
      try {
        if (typeof ops === 'function') return await ops(db)
        const out: unknown[] = []
        for (const op of ops) out.push(await op)
        return out
      } catch (err) {
        platforms.splice(0, platforms.length, ...before.p)
        changes.length = before.c
        throw err
      }
    },
  }
  return db
}

export const registryOf = (db: ReturnType<typeof fakePlatformDb>) =>
  new PlatformRegistryService(db as never)
