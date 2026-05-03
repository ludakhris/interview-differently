import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { PublicMediaStorage, PrivateMediaStorage } from './media-storage.interface'

/**
 * Dev-mode storage. Both public and private flavours write under
 * ./storage/scenario-media/ and are served via the scenario-media controller's
 * /files/* route. Localhost only — there's no real auth or signing in dev,
 * which is fine for local testing.
 *
 * In production, R2 implementations apply real public/private separation and
 * URL signing.
 */

abstract class LocalDiskStorageBase {
  protected readonly logger: Logger
  protected readonly root: string
  protected readonly publicBase: string

  constructor(loggerName: string) {
    this.logger = new Logger(loggerName)
    this.root = path.resolve(process.cwd(), 'storage', 'scenario-media')
    const port = process.env.PORT ?? '3000'
    this.publicBase = (process.env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '')
  }

  protected async writeFile(key: string, buffer: Buffer): Promise<void> {
    const target = path.join(this.root, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, buffer)
    this.logger.log(`Wrote ${buffer.length} bytes to ${target}`)
  }

  async delete(key: string): Promise<void> {
    const target = path.join(this.root, key)
    await fs.unlink(target).catch(() => {/* ignore */})
  }

  /** Read a file from disk — used by the scenario-media controller's static handler. */
  async read(key: string): Promise<Buffer | null> {
    const target = path.join(this.root, key)
    if (!target.startsWith(this.root)) return null // path traversal guard
    return fs.readFile(target).catch(() => null)
  }

  protected playbackUrl(key: string): string {
    return `${this.publicBase}/api/scenario-media/files/${key}`
  }
}

@Injectable()
export class LocalDiskPublicStorage extends LocalDiskStorageBase implements PublicMediaStorage {
  constructor() { super(LocalDiskPublicStorage.name) }

  async upload(key: string, buffer: Buffer): Promise<string> {
    await this.writeFile(key, buffer)
    return this.playbackUrl(key)
  }
}

@Injectable()
export class LocalDiskPrivateStorage extends LocalDiskStorageBase implements PrivateMediaStorage {
  constructor() { super(LocalDiskPrivateStorage.name) }

  async upload(key: string, buffer: Buffer): Promise<void> {
    await this.writeFile(key, buffer)
  }

  // Dev "signing" is a no-op — return the regular dev playback URL. Localhost
  // only, so the lack of real signing is acceptable.
  async getSignedUrl(key: string): Promise<string> {
    return this.playbackUrl(key)
  }
}
