// In-memory implementations of the storage interfaces, used to test the
// platform-agnostic store classes without touching @plasmohq/storage.

import type { KeyValueStore, SecureKeyValueStore } from '~/core/storage/types'

export class InMemoryKeyValueStore implements KeyValueStore {
  private data = new Map<string, unknown>()
  private watchers = new Map<string, Set<(newValue: unknown) => void>>()

  async get<T>(key: string): Promise<T | null> {
    return (this.data.get(key) as T) ?? null
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data.set(key, value)
    this.watchers.get(key)?.forEach((cb) => cb(value))
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key)
    this.watchers.get(key)?.forEach((cb) => cb(undefined))
  }

  watch(key: string, callback: (newValue: unknown) => void): () => void {
    let set = this.watchers.get(key)
    if (!set) {
      set = new Set()
      this.watchers.set(key, set)
    }
    set.add(callback)
    return () => {
      set!.delete(callback)
    }
  }
}

// Models a password-encrypted store: a value is only readable when the current
// password matches the password that was active when it was written. This
// mirrors @plasmohq SecureStorage's behavior closely enough to test unlock().
export class InMemorySecureStore implements SecureKeyValueStore {
  private data = new Map<string, { password: string; value: unknown }>()
  private password: string | null = null

  async setPassword(password: string): Promise<void> {
    this.password = password
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.data.get(key)
    if (!entry || entry.password !== this.password) {
      return null
    }
    return entry.value as T
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.password === null) {
      throw new Error('Password not set')
    }
    this.data.set(key, { password: this.password, value })
  }

  async remove(key: string): Promise<void> {
    this.data.delete(key)
  }
}
