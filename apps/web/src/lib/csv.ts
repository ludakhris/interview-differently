/**
 * Small client-side CSV download helper. Used by the analytics views to
 * let admins pull each table into Excel / Google Sheets without us having
 * to build a server endpoint per export.
 *
 * Handles the common escaping pitfalls (commas, quotes, newlines) and
 * prepends a UTF-8 BOM so Excel opens non-ASCII strings correctly. If we
 * ever need very large exports (>100k rows), revisit and stream from the
 * server instead.
 */

export type CsvCell = string | number | boolean | null | undefined

export interface CsvOptions {
  /** Filename for the download. `.csv` is appended automatically if missing. */
  filename: string
  /** Header row, in the same order as each row's columns. */
  headers: string[]
  /** Data rows. Each row's length should match `headers`. */
  rows: CsvCell[][]
}

/**
 * Builds a CSV string from headers + rows.
 * Exported separately so callers can preview / log without triggering a download.
 */
export function buildCsv({ headers, rows }: Omit<CsvOptions, 'filename'>): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))]
  return lines.join('\n') + '\n'
}

/**
 * Triggers a CSV download in the browser.
 *
 * Uses an in-memory Blob + a temporary anchor click. No-ops in non-browser
 * contexts (e.g. SSR — though this app doesn't have any today).
 */
export function downloadCsv(opts: CsvOptions): void {
  if (typeof document === 'undefined') return

  const filename = opts.filename.endsWith('.csv') ? opts.filename : `${opts.filename}.csv`
  // U+FEFF = UTF-8 BOM — makes Excel respect the encoding for non-ASCII names.
  const csv = '\ufeff' + buildCsv({ headers: opts.headers, rows: opts.rows })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Defer revoke a tick so Safari / older browsers actually trigger the download.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function escapeCell(value: CsvCell): string {
  if (value == null) return ''
  const str = typeof value === 'string' ? value : String(value)
  // Quote if it contains a delimiter, a quote, or a line break — and escape inner quotes by doubling.
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Helper for filenames: lowercase, replace anything non-alphanumeric with `-`,
 * collapse repeats, trim leading/trailing dashes. So
 *   filenameSlug("Demo U", "Spring 2026")
 *   → "demo-u-spring-2026"
 */
export function filenameSlug(...parts: Array<string | null | undefined>): string {
  return parts
    .filter((p): p is string => Boolean(p && p.trim()))
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-')
}
