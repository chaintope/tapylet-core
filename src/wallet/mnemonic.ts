import * as bip39 from "bip39"

export const generateMnemonic = (strength: 128 | 256 = 128): string => {
  return bip39.generateMnemonic(strength)
}

export const validateMnemonic = (mnemonic: string): boolean => {
  const normalized = normalizeMnemonic(mnemonic)
  return bip39.validateMnemonic(normalized)
}

export const mnemonicToSeed = async (mnemonic: string): Promise<Buffer> => {
  const normalized = normalizeMnemonic(mnemonic)
  return bip39.mnemonicToSeed(normalized)
}

export const normalizeMnemonic = (mnemonic: string): string => {
  return mnemonic.trim().toLowerCase().split(/\s+/).join(" ")
}

export const mnemonicToWords = (mnemonic: string): string[] => {
  return normalizeMnemonic(mnemonic).split(" ")
}

export const wordsToMnemonic = (words: string[]): string => {
  return words.join(" ")
}
