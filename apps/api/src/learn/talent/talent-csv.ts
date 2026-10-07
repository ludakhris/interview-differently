/**
 * One CSV cell. Text that a spreadsheet would run as a formula (leading = + - @, tab or carriage
 * return) gets a leading apostrophe, then quotes, commas and line breaks are escaped.
 */
export function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csvRow = (cells: (string | number | boolean | null | undefined)[]): string =>
  cells.map(csvCell).join(',')
