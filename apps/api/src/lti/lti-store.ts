/**
 * Shared single-use state for both sides of the LTI connection: launch hints, client-assertion
 * ids, login state, submission tokens and rate-limit counters. Every operation is atomic and
 * honors expiry, so any number of server instances (or a restart) can share one store.
 * This file imports nothing from the project; the Prisma implementation is lti-store.prisma.ts.
 *
 * An entry is identified by `scope` + `key`. Values must be JSON and non-null: `peek` and `take`
 * answer `null` for "no live entry".
 */
export interface LtiStore {
  /** Stores (or replaces) an entry that expires `ttlSec` seconds from now. */
  put(scope: string, key: string, value: unknown, ttlSec: number): Promise<void>
  /** The live entry's value, or null. Does not consume it. */
  peek<T = unknown>(scope: string, key: string): Promise<T | null>
  /** Atomically reads and deletes the live entry; null if there is none. Only one caller gets it. */
  take<T = unknown>(scope: string, key: string): Promise<T | null>
  /** Inserts the entry if no live one exists. True if this caller won, false otherwise. */
  claim(scope: string, key: string, ttlSec: number): Promise<boolean>
  /** Deletes the entry (live or not). */
  release(scope: string, key: string): Promise<void>
  /** Atomically increments a counter that expires `ttlSec` after its first hit; returns the new count. */
  count(scope: string, key: string, ttlSec: number): Promise<number>
}

/** Nest injection token for the `LtiStore` in use. */
export const LTI_STORE = 'LTI_STORE'

interface Entry {
  value: unknown
  count: number
  expiresAt: number
}

/** In-process store: for unit tests and a single-instance local fallback. Not shared across processes. */
export class MemoryLtiStore implements LtiStore {
  private readonly entries = new Map<string, Entry>()
  /** Milliseconds since the epoch; replaceable so tests can move time. */
  now: () => number = () => Date.now()

  private id = (scope: string, key: string) => `${scope}\u0000${key}`

  private live(scope: string, key: string): Entry | undefined {
    const id = this.id(scope, key)
    const e = this.entries.get(id)
    if (e && e.expiresAt <= this.now()) {
      this.entries.delete(id)
      return undefined
    }
    return e
  }

  private set(scope: string, key: string, value: unknown, ttlSec: number) {
    this.entries.set(this.id(scope, key), {
      value: value ?? null,
      count: 1,
      expiresAt: this.now() + ttlSec * 1000,
    })
  }

  async put(scope: string, key: string, value: unknown, ttlSec: number) {
    this.set(scope, key, value, ttlSec)
  }

  async peek<T = unknown>(scope: string, key: string) {
    return (this.live(scope, key)?.value ?? null) as T | null
  }

  async take<T = unknown>(scope: string, key: string) {
    const e = this.live(scope, key)
    if (!e) return null
    this.entries.delete(this.id(scope, key))
    return (e.value ?? null) as T | null
  }

  async claim(scope: string, key: string, ttlSec: number) {
    if (this.live(scope, key)) return false
    this.set(scope, key, null, ttlSec)
    return true
  }

  async release(scope: string, key: string) {
    this.entries.delete(this.id(scope, key))
  }

  async count(scope: string, key: string, ttlSec: number) {
    const e = this.live(scope, key)
    if (e) return ++e.count
    this.set(scope, key, null, ttlSec)
    return 1
  }
}
