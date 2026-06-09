// Platform-agnostic storage interfaces.
// These define the contract that wallet logic depends on, so the same
// core can run on Chrome Extension / Mobile / Web by injecting a concrete
// implementation (see adapters/).

/**
 * A simple key-value store with optional change watching.
 * Values are serialized/deserialized by the implementation.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
  /**
   * Watch a single key for changes. Returns an unsubscribe function.
   * Implementations without native watch support may poll or no-op.
   */
  watch(key: string, callback: (newValue: unknown) => void): () => void
}

/**
 * A key-value store whose contents are encrypted at rest behind a password.
 * The password must be set (via setPassword) before reads/writes succeed.
 */
export interface SecureKeyValueStore {
  setPassword(password: string): Promise<void>
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}
