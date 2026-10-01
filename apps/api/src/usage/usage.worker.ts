import { parentPort, workerData } from 'worker_threads'
import { PrismaClient } from '@prisma/client'
import { ClerkService } from '../auth/clerk.service'
import { UsageReportBuilder } from './usage.builder'

/**
 * Worker-thread entry for the usage dashboard. It has its own small Prisma
 * pool and Clerk client (same process env), so the heavy load-and-aggregate
 * runs off the API's event loop and can't starve request handling.
 */
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '')
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '3')
  const prisma = new PrismaClient({ datasourceUrl: url.toString() })
  try {
    const report = await new UsageReportBuilder(prisma, new ClerkService()).build(workerData)
    parentPort?.postMessage({ ok: true, report })
  } catch (err) {
    parentPort?.postMessage({ ok: false, error: (err as Error).message })
  } finally {
    await prisma.$disconnect()
  }
}

void main()
