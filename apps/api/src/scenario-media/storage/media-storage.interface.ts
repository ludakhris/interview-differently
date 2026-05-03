export interface MediaStorage {
  /**
   * Persist an MP4 buffer at the given key and return its public URL.
   * Implementations choose the URL scheme (R2 public bucket, local-static, etc.).
   */
  upload(key: string, buffer: Buffer, contentType: string): Promise<string>

  /** Best-effort delete; absent keys do not error. */
  delete(key: string): Promise<void>
}

export const MEDIA_STORAGE = 'MEDIA_STORAGE'
