import { Nav } from '@/components/Nav'
import { Footer } from '@/components/Footer'
import { LEGAL_REVIEW_PENDING } from './legalConfig'

export function LegalLayout({
  title,
  version,
  children,
}: {
  title: string
  version: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-12">
        {LEGAL_REVIEW_PENDING && (
          <div
            role="note"
            className="mb-8 rounded-lg border border-amber/40 bg-amber/10 px-4 py-3 text-[13px] text-amber-pale"
          >
            <strong>Draft — pending legal review.</strong> Bracketed items must be completed before
            launch.
          </div>
        )}
        <h1 className="font-display font-extrabold text-[30px] text-[#f5f3ee] tracking-tight">
          {title}
        </h1>
        <p className="text-[12px] text-slate-mid mt-1 mb-10">Last updated: {version}</p>
        <div className="space-y-4 text-[14px] leading-[1.75] text-slate-light [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-[18px] [&_h2]:text-[#f5f3ee] [&_h2]:mt-10 [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:text-[#f5f3ee] [&_h3]:mt-6 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-green-light [&_a]:underline [&_strong]:text-[#f5f3ee]">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}
