// Dispatcher for the exhibit library. Pass any Exhibit and the renderer
// fans out to the right subtype component. New exhibit kinds added later
// only need a switch arm here.

import type { Exhibit } from '@id/types'
import { DataTable } from './DataTable'
import { ProfitTree } from './ProfitTree'
import { SegmentationMatrix } from './SegmentationMatrix'
import { ChartExhibit } from './ChartExhibit'
import { TextExhibit } from './TextExhibit'

export function ExhibitRenderer({ exhibit }: { exhibit: Exhibit }) {
  switch (exhibit.kind) {
    case 'data-table':
      return <DataTable exhibit={exhibit} />
    case 'profit-tree':
      return <ProfitTree exhibit={exhibit} />
    case 'segmentation-matrix':
      return <SegmentationMatrix exhibit={exhibit} />
    case 'chart':
      return <ChartExhibit exhibit={exhibit} />
    case 'text-exhibit':
      return <TextExhibit exhibit={exhibit} />
  }
}

export { DataTable, ProfitTree, SegmentationMatrix, ChartExhibit, TextExhibit }
