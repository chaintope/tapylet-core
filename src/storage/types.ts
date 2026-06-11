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
 *
 * SECURITY CONTRACT: implementations MUST use authenticated encryption (e.g.
 * AES-GCM) so that reading a value written under a different password fails
 * (throws or returns null) rather than yielding garbage. `WalletStorage.unlock`
 * relies on this: it verifies the password by checking that a sentinel value
 * decrypts back to its expected content. A non-authenticated cipher (e.g.
 * AES-CTR without a MAC) would silently break that check and accept wrong
 * passwords. The key must be derived from the password with a strong KDF
 * (e.g. PBKDF2 with a high iteration count, or Argon2).
 */
export interface SecureKeyValueStore {
  setPassword(password: string): Promise<void>
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  remove(key: string): Promise<void>
}
