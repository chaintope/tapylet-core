import * as tapyrus from "tapyrusjs-lib"
import { mnemonicToSeed } from "./mnemonic"

// Re-export NetworkId from tapyrusjs-lib
export const NetworkId = tapyrus.NetworkId

const getDerivationPath = (networkId: number, index = 0): string => {
  return `m/44'/${networkId}'/0'/0/${index}`
}

export interface HDWalletKeys {
  privateKey: Uint8Array
  publicKey: Uint8Array
  wif: string
}

// Address/WIF/bip32 encoding is always the prod format (Tapyrus separates
// Prod from Dev independently of the network id). networkId only picks the
// derivation path's BIP44 coin type, and has no default so a caller that
// forgets to pass it gets a type error instead of a wallet for a network it
// never asked for.
export const createHDWallet = async (
  mnemonic: string,
  networkId: number,
  index = 0
): Promise<HDWalletKeys> => {
  const seed = await mnemonicToSeed(mnemonic)
  const derivationPath = getDerivationPath(networkId, index)
  const root = tapyrus.bip32.fromSeed(seed, tapyrus.networks.prod)
  const child = root.derivePath(derivationPath)

  if (!child.privateKey) {
    throw new Error("Failed to derive private key")
  }

  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey,
    wif: child.toWIF(),
  }
}

export const getPublicKeyFromWIF = (wif: string): Uint8Array => {
  const keyPair = tapyrus.ECPair.fromWIF(wif, tapyrus.networks.prod)
  return keyPair.publicKey
}

export interface KeyPairWithNetwork {
  keyPair: tapyrus.ECPairInterface
  publicKey: Buffer
  network: tapyrus.Network
}

export const getKeyPairFromMnemonic = async (
  mnemonic: string,
  networkId: number,
  index = 0
): Promise<KeyPairWithNetwork> => {
  const keys = await createHDWallet(mnemonic, networkId, index)
  const network = tapyrus.networks.prod
  const keyPair = tapyrus.ECPair.fromWIF(keys.wif, network)
  return {
    keyPair,
    publicKey: keyPair.publicKey,
    network,
  }
}

// --- Legacy mainnet wallet (pre network-split) ---
//
// Before mainnet and testnet had separate keys, every wallet derived its one
// key with coin type = the testnet TIP-0044 id (the value createHDWallet
// silently defaulted to) and encoded it with the prod address format. Real
// TPC and tokens were sent to that address on mainnet, so this exact
// derivation has to keep working forever, independent of whatever
// createHDWallet's testnet formula becomes in the future. It is written out
// on its own rather than calling createHDWallet(mnemonic, NetworkId.TESTNET,
// index) so a later change to how testnet keys are derived (e.g. a different
// account level) cannot silently break recovery of pre-split funds.
//
// Today it yields exactly the same key, address and WIF as
// createHDWallet(mnemonic, NetworkId.TESTNET, index).
const LEGACY_MAINNET_COIN_TYPE = tapyrus.NetworkId.TESTNET
const getLegacyMainnetDerivationPath = (index = 0): string =>
  `m/44'/${LEGACY_MAINNET_COIN_TYPE}'/0'/0/${index}`

export const createLegacyMainnetWallet = async (
  mnemonic: string,
  index = 0
): Promise<HDWalletKeys> => {
  const seed = await mnemonicToSeed(mnemonic)
  const network = tapyrus.networks.prod
  const root = tapyrus.bip32.fromSeed(seed, network)
  const child = root.derivePath(getLegacyMainnetDerivationPath(index))

  if (!child.privateKey) {
    throw new Error("Failed to derive private key")
  }

  return {
    privateKey: child.privateKey,
    publicKey: child.publicKey,
    wif: child.toWIF(),
  }
}

export const getKeyPairFromLegacyMainnetWallet = async (
  mnemonic: string,
  index = 0
): Promise<KeyPairWithNetwork> => {
  const keys = await createLegacyMainnetWallet(mnemonic, index)
  const network = tapyrus.networks.prod
  const keyPair = tapyrus.ECPair.fromWIF(keys.wif, network)
  return {
    keyPair,
    publicKey: keyPair.publicKey,
    network,
  }
}
