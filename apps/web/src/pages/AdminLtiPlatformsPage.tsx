import { Nav } from '@/components/Nav'
import { LtiPlatformsPanel } from '@/components/LtiPlatformsPanel'

/** Admin page: approve or switch off the learning systems that can launch Interview Differently. */
export function AdminLtiPlatformsPage() {
  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
            Admin · Platforms
          </p>
          <h1
            id="platforms-heading"
            tabIndex={-1}
            className="font-display font-extrabold text-[24px] text-fg tracking-tight"
          >
            Platforms
          </h1>
          <p className="text-[13px] text-slate-mid mt-1">
            A platform is the learning system that launches Interview Differently. A platform that
            registers itself waits here, switched off, until you approve it.
          </p>
        </div>
        <LtiPlatformsPanel />
      </main>
    </div>
  )
}
