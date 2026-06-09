import * as tapyrus from "tapyrusjs-lib"
import { mnemonicToSeed } from "./mnemonic"

// Re-export NetworkId from tapyrusjs-lib
export const NetworkId = tapyrus.NetworkId

// Default network ID for this wallet
const DEFAULT_NETWORK_ID = tapyrus.NetworkId.TESTNET

const getDerivationPath = (networkId: number, index = 0): string => {
  return `m/44'/${networkId}'/0'/0/${index}`
}

export interface HDWalletKeys {
  privateKey: Uint8Array
  publicKey: Uint8Array
  wif: string
}

export const createHDWallet = async (
  mnemonic: string,
  networkId: tapyrus.NetworkId = DEFAULT_NETWORK_ID,
  index = 0
): Promise<HDWalletKeys> => {
  const seed = await mnemonicToSeed(mnemonic)
  const network = tapyrus.networks.prod
  const derivationPath = getDerivationPath(networkId, index)
  const root = tapyrus.bip32.fromSeed(seed, network)
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
  const network = tapyrus.networks.prod
  const keyPair = tapyrus.ECPair.fromWIF(wif, network)
  return keyPair.publicKey
}

export interface KeyPairWithNetwork {
  keyPair: tapyrus.ECPairInterface
  publicKey: Buffer
  network: tapyrus.Network
}

export const getKeyPairFromMnemonic = async (
  mnemonic: string,
  networkId: tapyrus.NetworkId = DEFAULT_NETWORK_ID,
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
