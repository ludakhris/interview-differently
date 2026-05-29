// chart exhibit. Thin wrapper over the existing MetricChart component used
// by ops monitor nodes — same time-series visual, surfaced as an exhibit.

import type { ChartExhibit as ChartExhibitType } from '@id/types'
import { ExhibitShell } from './ExhibitShell'
import { MetricChart } from '@/components/MetricChart'

export function ChartExhibit({ exhibit }: { exhibit: ChartExhibitType }) {
  return (
    <ExhibitShell
      title={exhibit.title}
      caption={exhibit.caption}
      footnote={exhibit.footnote}
      badge="Chart"
    >
      <MetricChart config={exhibit.chart} />
    </ExhibitShell>
  )
}
