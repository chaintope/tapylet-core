import {
  getKeyPairFromMnemonic,
  getKeyPairFromLegacyMainnetWallet,
  type KeyPairWithNetwork,
} from "./hdwallet"

// Resolves the signing key. Shared by every transaction-building and issuance
// function so the choice between the legacy key and the per-network key is
// made in exactly one place. It lives outside hdwallet.ts so tests that mock
// hdwallet still exercise this selection.
export const resolveKeyPair = (
  mnemonic: string,
  networkId: number,
  fromLegacyMainnetWallet: boolean | undefined
): Promise<KeyPairWithNetwork> =>
  fromLegacyMainnetWallet
    ? getKeyPairFromLegacyMainnetWallet(mnemonic)
    : getKeyPairFromMnemonic(mnemonic, networkId)
