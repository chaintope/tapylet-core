export interface WalletData {
  /**
   * BIP39 mnemonic phrase. NOTE: this field holds the plaintext mnemonic — it
   * is encrypted at rest by the SecureKeyValueStore that persists WalletData,
   * not by this field. Always write WalletData through a secure store.
   */
  mnemonic: string
  address: string
  publicKey: string
  createdAt: number
  /**
   * @deprecated Legacy field name for `mnemonic`. Wallets created before the
   * rename persisted the mnemonic here; kept optional so
   * `WalletStorage.getWallet` can migrate them on read. Do not write this field.
   */
  encryptedMnemonic?: string
}

export interface WalletState {
  address: string | null
  isLocked: boolean
  walletExists: boolean
}
