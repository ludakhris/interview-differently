import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Worker } from 'worker_threads'
import * as path from 'path'
import { PrismaService } from '../prisma/prisma.service'
import { ClerkService } from '../auth/clerk.service'
import { type UsageRange, type UsageReport } from './usage.aggregate'
import { UsageReportBuilder } from './usage.builder'

/** Dashboard is polled/refreshed by admins; a short cache turns bursts into one computation. */
const REPORT_TTL_MS = 30_000
const REPORT_TIMEOUT_MS = 120_000
/** Caps the worker's heap so a huge report OOMs the worker, not the API. */
const WORKER_HEAP_MB = 2048

interface ReportOpts {
  range: UsageRange
  includeAdmins: boolean
  tzOffsetMinutes: number
}

@Injectable()
export class UsageService {
  private cache = new Map<string, { at: number; report: Promise<UsageReport> }>()
  private readonly useWorker = __filename.endsWith('.js')

  constructor(
    private prisma: PrismaService,
    private clerk: ClerkService
  ) {}

  /**
   * Cached + single-flight: concurrent requests for the same view share one
   * computation, and a fresh result is reused for REPORT_TTL_MS. Building the
   * report reads every log row in scope, so stampedes are what took it down.
   */
  report(opts: ReportOpts): Promise<UsageReport> {
    const key = `${opts.range}|${opts.includeAdmins}|${opts.tzOffsetMinutes}`
    const hit = this.cache.get(key)
    if (hit && Date.now() - hit.at < REPORT_TTL_MS) return hit.report
    const report = this.useWorker
      ? this.runInWorker(opts)
      : new UsageReportBuilder(this.prisma, this.clerk).build(opts)
    this.cache.set(key, { at: Date.now(), report })
    report.catch(() => this.cache.delete(key)) // never cache a failure
    return report
  }

  /**
   * The report is CPU-heavy (it aggregates every log row in scope), so it runs
   * on a worker thread with a heap cap and timeout. In-process under ts-jest,
   * where there is no compiled worker file.
   */
  private runInWorker(opts: ReportOpts): Promise<UsageReport> {
    return new Promise<UsageReport>((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'usage.worker.js'), {
        workerData: opts,
        resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
      })
      const timer = setTimeout(() => {
        void worker.terminate()
        reject(new ServiceUnavailableException('Usage report timed out'))
      }, REPORT_TIMEOUT_MS)
      worker.once('message', (m: { ok: boolean; report?: UsageReport; error?: string }) => {
        clearTimeout(timer)
        void worker.terminate()
        if (m.ok) resolve(m.report as UsageReport)
        else reject(new ServiceUnavailableException(`Usage report failed: ${m.error}`))
      })
      worker.once('error', (err) => {
        clearTimeout(timer)
        reject(new ServiceUnavailableException(`Usage report failed: ${err.message}`))
      })
    })
  }
}
