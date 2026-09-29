import { downloadCsv, filenameSlug, type CsvCell } from '@/lib/csv'
import type { SandboxResult } from './sandboxDb'

// Export / copy for query results (#30). Always the full result set, never
// just the rows the grid is showing.

function toCell(v: unknown): CsvCell {
  if (v === null || v === undefined) return null
  if (typeof v === 'object') return JSON.stringify(v)
  return v as CsvCell
}

export function downloadResultCsv(result: SandboxResult, datasetName: string): void {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '-')
  downloadCsv({
    filename: filenameSlug(datasetName, 'query', stamp),
    headers: result.columns,
    rows: result.allRows.map((r) => r.map(toCell)),
  })
}

/** Tab-separated, so it pastes straight into Excel / Sheets as cells. */
export async function copyResultTsv(result: SandboxResult): Promise<void> {
  const clean = (v: unknown) => {
    const c = toCell(v)
    return c == null ? '' : String(c).replace(/[\t\r\n]+/g, ' ')
  }
  const lines = [result.columns.map(clean), ...result.allRows.map((r) => r.map(clean))].map((l) =>
    l.join('\t')
  )
  await navigator.clipboard.writeText(lines.join('\n'))
}
