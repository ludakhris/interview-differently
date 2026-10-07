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
  return { ext, contentType: kind.type }
}

/** A file name safe to put in a storage key and a download name: no path, no odd characters. */
export function safeResumeName(original: string, ext: string): string {
  const base = (original ?? '').split(/[\\/]/).pop() ?? ''
  const stem = base.replace(/\.[A-Za-z0-9]+$/, '').replace(/[^A-Za-z0-9._-]+/g, '_')
  const trimmed = stem.replace(/^[._]+/, '').slice(0, 60) || 'resume'
  return `${trimmed}.${ext}`
}

export const resumeKey = (providerId: string, userId: string, safeName: string): string =>
  `talent/resumes/${providerId}/${userId}/${randomUUID()}-${safeName}`
