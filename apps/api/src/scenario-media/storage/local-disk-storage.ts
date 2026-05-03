import { Injectable, Logger } from '@nestjs/common'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { MediaStorage } from './media-storage.interface'

/**
 * Dev-mode storage: writes to ./storage/scenario-media on disk.
 * The scenario-media controller exposes GET /api/scenario-media/files/* to serve them.
 * Returned URLs are absolute (built from API_PUBLIC_URL or http://localhost:PORT).
 */
@Injectable()
export class LocalDiskMediaStorage implements MediaStorage {
  private readonly logger = new Logger(LocalDiskMediaStorage.name)
  private readonly root: string
  private readonly publicBase: string

  constructor() {
    this.root = path.resolve(process.cwd(), 'storage', 'scenario-media')
    const port = process.env.PORT ?? '3000'
    this.publicBase = (process.env.API_PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/$/, '')
  }

  async upload(key: string, buffer: Buffer): Promise<string> {
    const target = path.join(this.root, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, buffer)
    this.logger.log(`Wrote ${buffer.length} bytes to ${target}`)
    return `${this.publicBase}/api/scenario-media/files/${key}`
  }

  async delete(key: string): Promise<void> {
    const target = path.join(this.root, key)
    await fs.unlink(target).catch(() => {/* ignore */})
  }

  /** Read a file from the on-disk root — used by the controller's static handler. */
  async read(key: string): Promise<Buffer | null> {
    const target = path.join(this.root, key)
    if (!target.startsWith(this.root)) return null // path traversal guard
    return fs.readFile(target).catch(() => null)
  }

  rootDir(): string {
    return this.root
  }
}
