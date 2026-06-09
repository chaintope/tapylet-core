import * as tapyrus from "tapyrusjs-lib"
import { validateUtxo, validateTransactionInfo, isValidAmount, MAX_AMOUNT } from "../utils/validation"

const EXPLORER_API_URL = process.env.PLASMO_PUBLIC_EXPLORER_API_URL
  ?? "https://testnet-explorer.tapyrus.dev.chaintope.com/api"

const EXPLORER_URL = process.env.PLASMO_PUBLIC_EXPLORER_URL
  ?? "https://testnet-explorer.tapyrus.dev.chaintope.com"

export const getExplorerTxUrl = (txid: string): string => {
  return `${EXPLORER_URL}/tx/${txid}`
}

// Generate colored coin address from regular address and colorId
export const getColoredAddress = (address: string, colorId: string): string => {
  const network = tapyrus.networks.prod
  const decoded = tapyrus.address.fromBase58Check(address)
  const colorIdBuffer = Buffer.from(colorId, "hex")
  const payment = tapyrus.payments.cp2pkh({
    colorId: colorIdBuffer,
    hash: decoded.hash,
    network,
  })
  return payment.address!
}

export const getExplorerColorUrl = (colorId: string): string => {
  return `${EXPLORER_URL}/color/${colorId}`
}

export interface BalanceInfo {
  colorId: string
  count: number
  received: number
  sent: number
  balanced: number
}

export interface AddressInfo {
  balances: BalanceInfo[]
  tx: {
    txs: unknown[]
    last_seen_txid: string
  }
}

export interface UtxoResponse {
  txid: string
  vout: number
  status: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
  value: number
  color_id?: string
}

export interface Utxo {
  txid: string
  vout: number
  status: {
    confirmed: boolean
    block_height?: number
    block_hash?: string
    block_time?: number
  }
  value: number
  colorId?: string
}

// Color ID for native TPC
export const TPC_COLOR_ID = "000000000000000000000000000000000000000000000000000000000000000000"

export const isTpcColorId = (colorId: string | undefined): boolean => {
  return !colorId || colorId === TPC_COLOR_ID
}

export const getAddressInfo = async (address: string): Promise<AddressInfo> => {
  const response = await fetch(`${EXPLORER_API_URL}/address/${address}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch address info: ${response.status}`)
  }
  return response.json()
}

export const getAddressUtxos = async (address: string): Promise<Utxo[]> => {
  const response = await fetch(`${EXPLORER_API_URL}/address/${address}/utxo`)
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.status}`)
  }
  const data: UtxoResponse[] = await response.json()

  // Validate and map snake_case to camelCase
  const validUtxos: Utxo[] = []
  for (const utxo of data) {
    const mapped = {
      txid: utxo.txid,
      vout: utxo.vout,
      status: utxo.status,
      value: utxo.value,
      colorId: utxo.color_id,
    }
    if (validateUtxo(mapped)) {
      validUtxos.push(mapped)
    }
  }
  return validUtxos
}

export const getBalance = async (address: string): Promise<number> => {
  const info = await getAddressInfo(address)
  const tpcBalance = info.balances.find(b => b.colorId === TPC_COLOR_ID)
  return tpcBalance?.balanced ?? 0
}

export interface BalanceDetails {
  confirmed: number
  unconfirmed: number
  total: number
}

export interface AssetBalance {
  colorId: string
  confirmed: number
  unconfirmed: number
  total: number
}

export interface AllBalances {
  tpc: BalanceDetails
  assets: AssetBalance[]
}

export const getBalanceDetails = async (address: string): Promise<BalanceDetails> => {
  const utxos = await getAddressUtxos(address)

  let confirmed = 0
  let unconfirmed = 0

  for (const utxo of utxos) {
    // Only count TPC (uncolored) UTXOs
    if (isTpcColorId(utxo.colorId)) {
      if (utxo.status.confirmed) {
        confirmed += utxo.value
      } else {
        unconfirmed += utxo.value
      }
    }
  }

  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  }
}

export const getAllBalances = async (address: string): Promise<AllBalances> => {
  const utxos = await getAddressUtxos(address)

  const balanceMap = new Map<string, { confirmed: number; unconfirmed: number }>()

  for (const utxo of utxos) {
    const colorId = utxo.colorId ?? TPC_COLOR_ID
    const current = balanceMap.get(colorId) ?? { confirmed: 0, unconfirmed: 0 }

    if (utxo.status.confirmed) {
      current.confirmed += utxo.value
    } else {
      current.unconfirmed += utxo.value
    }

    balanceMap.set(colorId, current)
  }

  // Extract TPC balance
  const tpcBalance = balanceMap.get(TPC_COLOR_ID) ?? { confirmed: 0, unconfirmed: 0 }
  balanceMap.delete(TPC_COLOR_ID)

  // Convert map to array for assets and sort by colorId for consistent ordering
  const assets: AssetBalance[] = Array.from(balanceMap.entries())
    .map(([colorId, balance]) => ({
      colorId,
      confirmed: balance.confirmed,
      unconfirmed: balance.unconfirmed,
      total: balance.confirmed + balance.unconfirmed,
    }))
    .sort((a, b) => a.colorId.localeCompare(b.colorId))

  return {
    tpc: {
      confirmed: tpcBalance.confirmed,
      unconfirmed: tpcBalance.unconfirmed,
      total: tpcBalance.confirmed + tpcBalance.unconfirmed,
    },
    assets,
  }
}

export const formatColorId = (colorId: string): string => {
  if (colorId.length <= 16) return colorId
  return `${colorId.slice(0, 8)}...${colorId.slice(-8)}`
}

export const formatTokenAmount = (amount: number, decimals?: number): string => {
  if (!decimals) return amount.toLocaleString()
  const value = amount / Math.pow(10, decimals)
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  })
}

export const formatTpc = (tapyrus: number): string => {
  const tpc = tapyrus / 100000000
  return tpc.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  })
}

export const parseTpc = (tpcString: string): number => {
  const tpc = parseFloat(tpcString)
  if (isNaN(tpc)) {
    throw new Error("Invalid TPC amount")
  }
  return Math.round(tpc * 100000000)
}

export const broadcastTransaction = async (txHex: string): Promise<string> => {
  const response = await fetch(`${EXPLORER_API_URL}/tx`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: txHex,
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to broadcast transaction: ${errorText}`)
  }
  return response.text()
}

export interface TransactionStatus {
  confirmed: boolean
  block_height?: number
  block_hash?: string
  block_time?: number
}

export interface TransactionInfo {
  txid: string
  status: TransactionStatus
}

export const getTransactionInfo = async (txid: string): Promise<TransactionInfo> => {
  const response = await fetch(`${EXPLORER_API_URL}/tx/${txid}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch transaction: ${response.status}`)
  }
  const data = await response.json()

  if (!validateTransactionInfo(data)) {
    throw new Error("Invalid transaction info from API")
  }

  return data
}
