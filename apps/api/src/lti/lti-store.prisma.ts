import { Injectable, OnModuleInit } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import type { LtiStore } from './lti-store'

/** Expired rows are deleted this many at a time, on about 1 in 50 writes and at start. */
const CLEANUP_BATCH = 500
const CLEANUP_ODDS = 0.02

// All times come from the database clock (UTC, like Prisma's TIMESTAMP(3) columns), so
// instances with skewed clocks agree on expiry.
/**
 * `LtiStore` on the `LtiSingleUse` table. Each method is one SQL statement, so it is atomic in
 * Postgres: INSERT ... ON CONFLICT for put/claim/count, DELETE ... RETURNING for take.
 */
@Injectable()
export class PrismaLtiStore implements LtiStore, OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.cleanup()
  }

  /** Never throws: housekeeping must not fail a request or the boot. */
  async cleanup(): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM "LtiSingleUse" WHERE "id" IN (
          SELECT "id" FROM "LtiSingleUse" WHERE "expiresAt" <= (NOW() AT TIME ZONE 'UTC') LIMIT ${CLEANUP_BATCH}
        )`
    } catch {
      /* the next write tries again */
    }
  }

  private maybeCleanup() {
    if (Math.random() < CLEANUP_ODDS) void this.cleanup()
  }

  async put(scope: string, key: string, value: unknown, ttlSec: number) {
    const json = JSON.stringify(value ?? null)
    await this.prisma.$executeRaw`
      INSERT INTO "LtiSingleUse" ("id", "scope", "key", "value", "count", "expiresAt")
      VALUES (${randomUUID()}, ${scope}, ${key}, ${json}::jsonb, 1,
        (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlSec}::double precision))
      ON CONFLICT ("scope", "key") DO UPDATE SET
        "value" = EXCLUDED."value", "count" = 1, "expiresAt" = EXCLUDED."expiresAt"`
    this.maybeCleanup()
  }

  async peek<T = unknown>(scope: string, key: string) {
    const rows = await this.prisma.$queryRaw<{ value: T | null }[]>`
      SELECT "value" FROM "LtiSingleUse"
      WHERE "scope" = ${scope} AND "key" = ${key} AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')`
    return rows[0]?.value ?? null
  }

  async take<T = unknown>(scope: string, key: string) {
    const rows = await this.prisma.$queryRaw<{ value: T | null }[]>`
      DELETE FROM "LtiSingleUse"
      WHERE "scope" = ${scope} AND "key" = ${key} AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
      RETURNING "value"`
    return rows[0]?.value ?? null
  }

  async claim(scope: string, key: string, ttlSec: number) {
    // The conflict branch only fires for an expired row, which this caller then takes over.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO "LtiSingleUse" ("id", "scope", "key", "value", "count", "expiresAt")
      VALUES (${randomUUID()}, ${scope}, ${key}, NULL, 1,
        (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlSec}::double precision))
      ON CONFLICT ("scope", "key") DO UPDATE SET
        "value" = NULL, "count" = 1, "expiresAt" = EXCLUDED."expiresAt"
      WHERE "LtiSingleUse"."expiresAt" <= (NOW() AT TIME ZONE 'UTC')
      RETURNING "id"`
    this.maybeCleanup()
    return rows.length > 0
  }

  async release(scope: string, key: string) {
    await this.prisma.$executeRaw`
      DELETE FROM "LtiSingleUse" WHERE "scope" = ${scope} AND "key" = ${key}`
  }

  async count(scope: string, key: string, ttlSec: number) {
    // An expired counter starts over at 1 with a fresh window; a live one only increments.
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "LtiSingleUse" ("id", "scope", "key", "value", "count", "expiresAt")
      VALUES (${randomUUID()}, ${scope}, ${key}, NULL, 1,
        (NOW() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlSec}::double precision))
      ON CONFLICT ("scope", "key") DO UPDATE SET
        "count" = CASE WHEN "LtiSingleUse"."expiresAt" <= (NOW() AT TIME ZONE 'UTC')
          THEN 1 ELSE "LtiSingleUse"."count" + 1 END,
        "expiresAt" = CASE WHEN "LtiSingleUse"."expiresAt" <= (NOW() AT TIME ZONE 'UTC')
          THEN EXCLUDED."expiresAt" ELSE "LtiSingleUse"."expiresAt" END,
        "value" = NULL
      RETURNING "count"`
    this.maybeCleanup()
    return Number(rows[0].count)
  }
}
