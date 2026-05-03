/**
 * Storage abstractions for binary media (rendered avatar clips, candidate
 * response recordings, etc).
 *
 * Two flavours, distinguished by access semantics:
 *
 *   PublicMediaStorage  — uploaded objects are served via a public URL (CDN).
 *                         upload() returns the URL to persist in the DB.
 *                         Used for pre-rendered avatar clips.
 *
 *   PrivateMediaStorage — bucket has no public access. The DB stores the
 *                         object key; readers obtain a time-limited signed
 *                         URL via getSignedUrl().
 *                         Used for candidate response recordings.
 */

interface BaseMediaStorage {
  delete(key: string): Promise<void>
}

export interface PublicMediaStorage extends BaseMediaStorage {
  /** Upload bytes and return the publicly playable URL. */
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>
}

export interface PrivateMediaStorage extends BaseMediaStorage {
  /** Upload bytes. Persist `key` in the DB; the URL is generated on demand. */
  upload(key: string, buffer: Buffer, contentType: string): Promise<void>
  /** Time-limited signed URL for `key`. */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>
}

export const PUBLIC_MEDIA_STORAGE = 'PUBLIC_MEDIA_STORAGE'
export const PRIVATE_MEDIA_STORAGE = 'PRIVATE_MEDIA_STORAGE'

// Back-compat shim — older scenario-media code referenced these names.
export type MediaStorage = PublicMediaStorage
export const MEDIA_STORAGE = PUBLIC_MEDIA_STORAGE
