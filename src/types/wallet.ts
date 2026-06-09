export interface WalletData {
  encryptedMnemonic: string
  address: string
  publicKey: string
  createdAt: number
}

export interface WalletState {
  address: string | null
  isLocked: boolean
  walletExists: boolean
}
