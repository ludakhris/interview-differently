import { Injectable, Logger } from '@nestjs/common'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import type { MediaStorage } from './media-storage.interface'

/**
 * Cloudflare R2 storage via the S3-compatible API.
 *
 * Selected at boot when `R2_BUCKET` is set; constructor throws clearly if any
 * other R2_* env var is missing so misconfiguration fails on startup, not on
 * the first render.
 */
@Injectable()
export class R2MediaStorage implements MediaStorage {
  private readonly logger = new Logger(R2MediaStorage.name)
  private readonly s3: S3Client | null
  private readonly bucket: string
  private readonly publicBase: string

  constructor() {
    const bucket = process.env.R2_BUCKET
    if (!bucket) {
      // Module factory only injects this when R2_BUCKET is set, but guard anyway
      // so a stray instantiation doesn't blow up requiring the rest of the env.
      this.s3 = null
      this.bucket = ''
      this.publicBase = ''
      return
    }
    const accountId = required('R2_ACCOUNT_ID')
    const accessKeyId = required('R2_ACCESS_KEY_ID')
    const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
    const publicUrl = required('R2_PUBLIC_URL')

    this.bucket = bucket
    this.publicBase = publicUrl.replace(/\/$/, '')
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    })
    this.logger.log(`R2 storage configured for bucket "${this.bucket}"`)
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!this.s3) throw new Error('R2MediaStorage instantiated without R2_BUCKET set')
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // 1-year immutable cache — keys include the script hash, so any content change
      // produces a new key. Safe to cache forever at the edge.
      CacheControl: 'public, max-age=31536000, immutable',
    }))
    return `${this.publicBase}/${key}`
  }

  async delete(key: string): Promise<void> {
    if (!this.s3) return
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`R2 env var ${name} is required when R2_BUCKET is set`)
  return value
}
