import { randomUUID } from 'node:crypto'

export const MAX_RESUME_BYTES = 5 * 1024 * 1024

interface Kind {
  type: string
  magic: Buffer
}
const KINDS: Record<'pdf' | 'doc' | 'docx', Kind> = {
  pdf: { type: 'application/pdf', magic: Buffer.from('%PDF-', 'latin1') },
  // Old Word files are an OLE2 container.
  doc: {
    type: 'application/msword',
    magic: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  },
  // New Word files are a zip.
  docx: {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  },
}

export interface ResumeCheck {
  ext: 'pdf' | 'doc' | 'docx'
  contentType: string
}

/**
 * A resume must agree with itself three ways: the file name's extension, the content type the
 * browser sent, and the file's own first bytes. Returns null when any of them is off.
 */
export function checkResume(file: {
  originalname: string
  mimetype: string
  buffer: Buffer
}): ResumeCheck | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(file.originalname ?? '')
  const ext = m?.[1].toLowerCase()
  if (ext !== 'pdf' && ext !== 'doc' && ext !== 'docx') return null
  const kind = KINDS[ext]
  if (file.mimetype !== kind.type) return null
  if (file.buffer.length < kind.magic.length) return null
  if (!file.buffer.subarray(0, kind.magic.length).equals(kind.magic)) return null
  if (ext === 'docx' && !looksLikeOoxml(file.buffer)) return null
  return { ext, contentType: kind.type }
}

/**
 * A .docx is a zip, but so is any other zip. Word writes `[Content_Types].xml` (or a `word/` part)
 * first, so one of them must be the first entry name in the opening bytes.
 */
function looksLikeOoxml(buf: Buffer): boolean {
  if (buf.length < 30) return false
  const nameLen = buf.readUInt16LE(26)
  if (30 + nameLen > buf.length) return false
  const first = buf.subarray(30, 30 + nameLen).toString('latin1')
  if (first === '[Content_Types].xml' || first.startsWith('word/')) return true
  // Some writers put `_rels/` or `docProps/` first; accept a Word part visible in the first 4 KB.
  return buf.subarray(0, 4096).includes(Buffer.from('word/', 'latin1'))
}

/** A file name safe to put in a storage key and a download name: no path, no odd characters. */
export function safeResumeName(original: string, ext: string): string {
  const base = (original ?? '').split(/[\\/]/).pop() ?? ''
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_')
  const trimmed = stem.replace(/^[._]+/, '').slice(0, 60) || 'resume'
  return `${trimmed}.${ext}`
}

export const resumeKey = (userId: string, safeName: string): string =>
  `talent/resumes/${userId}/${randomUUID()}-${safeName}`
