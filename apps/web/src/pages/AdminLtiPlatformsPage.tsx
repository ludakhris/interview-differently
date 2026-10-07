import { useState } from 'react'
import { Nav } from '@/components/Nav'
import { LtiPlatformsPanel } from '@/components/LtiPlatformsPanel'
import { InfoIcon, LtiPlatformsInfoDialog } from '@/components/LtiPlatformsInfo'
import type { ToolEndpointsResponse } from '@/services/ltiPlatformsService'

/** Admin page: approve or switch off the learning systems that can launch Interview Differently. */
export function AdminLtiPlatformsPage() {
  const [infoOpen, setInfoOpen] = useState(false)
  const [endpoints, setEndpoints] = useState<Partial<ToolEndpointsResponse>>()
  return (
    <div className="min-h-screen bg-surface">
      <Nav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-12">
        <div className="mb-8">
          <p className="text-[12px] font-bold uppercase tracking-widest text-slate-mid mb-1">
            Admin · Platforms
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1
              id="platforms-heading"
              tabIndex={-1}
              className="font-display font-extrabold text-[24px] text-fg tracking-tight"
            >
              Platforms
            </h1>
            <button
              type="button"
              onClick={() => setInfoOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-edge/15 text-[13px] font-semibold text-ink/70 hover:text-ink hover:border-edge/30 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-light"
            >
              <InfoIcon size={16} />
              How this works
            </button>
          </div>
          <p className="text-[13px] text-slate-mid mt-1">
            A platform is the learning system that launches Interview Differently. A platform that
            registers itself waits here, switched off, until you approve it.
          </p>
        </div>
        <LtiPlatformsPanel onHowItWorks={() => setInfoOpen(true)} onEndpoints={setEndpoints} />
      </main>
      <LtiPlatformsInfoDialog
        open={infoOpen}
        endpoints={endpoints}
        onClose={() => setInfoOpen(false)}
      />
    </div>
  )
}
