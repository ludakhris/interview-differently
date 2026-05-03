import { Injectable, Logger } from '@nestjs/common'
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { PublicMediaStorage, PrivateMediaStorage } from './media-storage.interface'

/**
 * Cloudflare R2 storage via the S3-compatible API. Two flavours share the
 * S3 client setup but differ in how playback URLs are produced.
 *
 * Env reading happens lazily in each class so that a missing private bucket
 * (e.g. dev environments) doesn't crash apps that only use the public one.
 */

function makeR2Client(accessKeyId: string, secretAccessKey: string): S3Client {
  const accountId = required('R2_ACCOUNT_ID')
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

// ── Public — pre-rendered avatar clips ──────────────────────────────────────

@Injectable()
export class R2PublicStorage implements PublicMediaStorage {
  private readonly logger = new Logger(R2PublicStorage.name)
  private readonly s3: S3Client | null
  private readonly bucket: string
  private readonly publicBase: string

  constructor() {
    const bucket = process.env.R2_BUCKET
    if (!bucket) {
      this.s3 = null
      this.bucket = ''
      this.publicBase = ''
      return
    }
    const accessKeyId = required('R2_ACCESS_KEY_ID')
    const secretAccessKey = required('R2_SECRET_ACCESS_KEY')
    const publicUrl = required('R2_PUBLIC_URL')
    this.bucket = bucket
    this.publicBase = publicUrl.replace(/\/$/, '')
    this.s3 = makeR2Client(accessKeyId, secretAccessKey)
    this.logger.log(`R2 public storage configured for bucket "${this.bucket}"`)
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<string> {
    if (!this.s3) throw new Error('R2PublicStorage instantiated without R2_BUCKET set')
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // 1-year immutable cache — keys include a content hash, so any change
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

// ── Private — candidate response recordings ─────────────────────────────────

@Injectable()
export class R2PrivateStorage implements PrivateMediaStorage {
  private readonly logger = new Logger(R2PrivateStorage.name)
  private readonly s3: S3Client | null
  private readonly bucket: string

  constructor() {
    const bucket = process.env.R2_RESPONSES_BUCKET
    if (!bucket) {
      this.s3 = null
      this.bucket = ''
      return
    }
    // Allow per-bucket creds; fall back to the main R2 creds (option (a)
    // in the provisioning walkthrough — same token scoped to both buckets).
    const accessKeyId = process.env.R2_RESPONSES_ACCESS_KEY_ID ?? required('R2_ACCESS_KEY_ID')
    const secretAccessKey = process.env.R2_RESPONSES_SECRET_ACCESS_KEY ?? required('R2_SECRET_ACCESS_KEY')
    this.bucket = bucket
    this.s3 = makeR2Client(accessKeyId, secretAccessKey)
    this.logger.log(`R2 private storage configured for bucket "${this.bucket}"`)
  }

  async upload(key: string, buffer: Buffer, contentType: string): Promise<void> {
    if (!this.s3) throw new Error('R2PrivateStorage instantiated without R2_RESPONSES_BUCKET set')
    await this.s3.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }))
  }

  async delete(key: string): Promise<void> {
    if (!this.s3) return
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    if (!this.s3) throw new Error('R2PrivateStorage instantiated without R2_RESPONSES_BUCKET set')
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    )
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`R2 env var ${name} is required`)
  return value
}
