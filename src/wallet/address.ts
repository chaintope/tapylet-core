import * as tapyrus from "tapyrusjs-lib"

export const generateAddress = (publicKey: Uint8Array): string => {
  const network = tapyrus.networks.prod
  const payment = tapyrus.payments.p2pkh({
    pubkey: Buffer.from(publicKey),
    network,
  })

  if (!payment.address) {
    throw new Error("Failed to generate address")
  }

  return payment.address
}

export const validateAddress = (address: string): boolean => {
  try {
    const network = tapyrus.networks.prod
    tapyrus.address.toOutputScript(address, network)
    return true
  } catch {
    return false
  }
}

export const shortenAddress = (address: string, chars = 6): string => {
  if (address.length <= chars * 2) {
    return address
  }
  return `${address.slice(0, chars)}...${address.slice(-chars)}`
}
