import { PrismaPg } from '@prisma/adapter-pg'

/**
 * The Postgres driver Prisma runs on. DATABASE_URL is read when it is called, so the seed and the scripts, which
 * import scripts/lib/owner-env.ts first, connect as the owner. Five seconds to connect, as Prisma 5 had.
 */
export function prismaAdapter(connectionString = process.env.DATABASE_URL) {
  return new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 })
}
