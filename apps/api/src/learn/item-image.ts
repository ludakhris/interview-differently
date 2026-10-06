/** Preview images authors upload for items (an external course's card). */

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

const KEY = /^learn-images\/[0-9a-f-]{36}\.(png|jpg|webp)$/

export const isImageKey = (v: unknown): v is string => typeof v === 'string' && KEY.test(v)

/**
 * The image type from the file's own first bytes, never from its name or the
 * type the browser claims. Only PNG, JPEG and WebP are accepted; SVG is left out
 * on purpose because it can carry script.
 */
export function sniffImage(
  b: Buffer
): { ext: 'png' | 'jpg' | 'webp'; type: 'image/png' | 'image/jpeg' | 'image/webp' } | null {
  if (
    b.length >= 8 &&
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return { ext: 'png', type: 'image/png' }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return { ext: 'jpg', type: 'image/jpeg' }
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return { ext: 'webp', type: 'image/webp' }
  return null
}

/**
 * Where a stored image is served from. Production uses the public bucket's
 * address; elsewhere the API serves it back from local disk.
 */
export function imageUrl(key: string): string {
  if (process.env.NODE_ENV === 'production') {
    return `${(process.env.R2_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`
  }
  const base = (
    process.env.API_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? '3000'}`
  ).replace(/\/$/, '')
  return `${base}/api/scenario-media/files/${key}`
}
