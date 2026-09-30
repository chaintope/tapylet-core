export interface NetworkWalletKeys {
  address: string
  publicKey: string
}

export interface WalletData {
  /**
   * BIP39 mnemonic phrase. NOTE: this field holds the plaintext mnemonic — it
   * is encrypted at rest by the SecureKeyValueStore that persists WalletData,
   * not by this field. Always write WalletData through a secure store.
   */
  mnemonic: string
  createdAt: number
  /**
   * Address/publicKey for each network this wallet has a key for, keyed by
   * TIP-0044 network id. A network absent here has no key yet — derivation
   * either hasn't run or failed — and the host is expected to offer a way to
   * (re)generate it rather than treat the absence as an error.
   */
  networks: Record<number, NetworkWalletKeys>
  /**
   * The single mainnet-formatted address used before mainnet and testnet had
   * separate keys (see wallet/hdwallet.ts#getKeyPairFromLegacyMainnetWallet).
   * Present only for wallets that already existed when per-network keys were
   * introduced — a wallet created afterwards never has one. Real funds may
   * still sit here, so it is carried forward as-is and never recomputed from
   * `networks`.
   */
  legacyMainnetAddress?: string
  /**
   * @deprecated Legacy field name for `mnemonic`. Wallets created before the
   * rename persisted the mnemonic here; kept optional so
   * `WalletStorage.getWallet` can migrate them on read. Do not write this field.
   */
  encryptedMnemonic?: string
  /**
   * @deprecated Single-network layout used before mainnet/testnet had
   * separate keys. `WalletStorage.getWallet` moves `address` into
   * `legacyMainnetAddress` and returns an empty `networks` for such a record;
   * the host then regenerates the per-network keys. Do not write these fields.
   */
  address?: string
  /** @deprecated see `address` above. */
  publicKey?: string
}

export interface WalletState {
  address: string | null
  isLocked: boolean
  walletExists: boolean
}
