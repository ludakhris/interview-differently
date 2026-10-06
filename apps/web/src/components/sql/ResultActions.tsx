import { useState } from 'react'
import type { SandboxResult } from '@/lib/sql/sandboxDb'
import { copyResultTsv, downloadResultCsv } from '@/lib/sql/exportResult'

/** Copy / CSV buttons for a query result (#30). Not rendered during graded attempts. */
export function ResultActions({
  result,
  datasetName,
}: {
  result: SandboxResult
  datasetName: string
}) {
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  if (result.columns.length === 0) return null

  const copy = async () => {
    try {
      await copyResultTsv(result)
      setCopied('ok')
    } catch {
      setCopied('failed')
    }
    window.setTimeout(() => setCopied(null), 1500)
  }

  const btn = 'font-semibold text-ink/50 hover:text-fg transition-colors'
  const all = `all ${result.rowCount} row${result.rowCount !== 1 ? 's' : ''}`
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={copy}
        title={`Copy ${all} as tab-separated text`}
        className={btn}
      >
        {copied === 'ok' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}
      </button>
      <button
        type="button"
        onClick={() => downloadResultCsv(result, datasetName)}
        title={`Download ${all} as CSV`}
        className={btn}
      >
        ↓ CSV
      </button>
    </span>
  )
}
