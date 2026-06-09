import type { KeyValueStore } from "./types"

const AUTO_LOCK_KEY = "auto_lock_minutes"
export const DEFAULT_AUTO_LOCK_MINUTES = 5
export const AUTO_LOCK_OPTIONS = [1, 5, 15, 30, 60, 0] as const

const normalizeMinutes = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DEFAULT_AUTO_LOCK_MINUTES
  }
  return value
}

export class SettingsStore {
  constructor(private storage: KeyValueStore) {}

  async getAutoLockMinutes(): Promise<number> {
    const value = await this.storage.get<number>(AUTO_LOCK_KEY)
    return normalizeMinutes(value)
  }

  async setAutoLockMinutes(minutes: number): Promise<void> {
    await this.storage.set(AUTO_LOCK_KEY, minutes)
  }

  watchAutoLockMinutes(callback: (minutes: number) => void): () => void {
    return this.storage.watch(AUTO_LOCK_KEY, (newValue) => {
      callback(normalizeMinutes(newValue))
    })
  }
}

