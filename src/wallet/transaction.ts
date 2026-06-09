import * as tapyrus from "tapyrusjs-lib"
import { getAddressUtxos, broadcastTransaction, isTpcColorId, type Utxo } from "../api/esplora"
import { getKeyPairFromMnemonic } from "./hdwallet"
import { DUST_THRESHOLD, DEFAULT_FEE_RATE } from "../constants/transaction"

// Filter UTXOs by colorId
const filterUtxosByColorId = (utxos: Utxo[], colorId?: string): Utxo[] => {
  if (!colorId || isTpcColorId(colorId)) {
    // Return TPC (uncolored) UTXOs
    return utxos.filter(u => isTpcColorId(u.colorId))
  }
  // Return colored UTXOs with matching colorId
  return utxos.filter(u => u.colorId === colorId)
}

export interface SendResult {
  txid: string
  txHex: string
}

export interface SendOptions {
  fromAddress: string
  toAddress: string
  amount: number // in tapyrus
  mnemonic: string
  feeRate?: number
}

const selectUtxos = (
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number
): { selectedUtxos: Utxo[]; totalInput: number; fee: number } => {
  // Sort UTXOs by value (largest first) for efficient selection
  const sortedUtxos = [...utxos].sort((a, b) => b.value - a.value)

  const selectedUtxos: Utxo[] = []
  let totalInput = 0

  // Estimate transaction size: ~10 bytes base + 148 bytes per input + 34 bytes per output
  // We assume 2 outputs (recipient + change)
  const estimateFee = (inputCount: number): number => {
    const estimatedSize = 10 + inputCount * 148 + 2 * 34
    return estimatedSize * feeRate
  }

  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo)
    totalInput += utxo.value

    const fee = estimateFee(selectedUtxos.length)
    if (totalInput >= targetAmount + fee) {
      return { selectedUtxos, totalInput, fee }
    }
  }

  throw new Error("Insufficient funds")
}

export const createAndSignTransaction = async (
  options: SendOptions
): Promise<SendResult> => {
  const { fromAddress, toAddress, amount, mnemonic, feeRate = DEFAULT_FEE_RATE } = options

  // Validate amount
  if (amount < DUST_THRESHOLD) {
    throw new Error(`Amount must be at least ${DUST_THRESHOLD} tapyrus`)
  }

  // Get UTXOs (TPC only)
  const allUtxos = await getAddressUtxos(fromAddress)
  const utxos = filterUtxosByColorId(allUtxos)
  if (utxos.length === 0) {
    throw new Error("No TPC UTXOs available")
  }

  // Select UTXOs
  const { selectedUtxos, totalInput, fee } = selectUtxos(utxos, amount, feeRate)

  // Get keys from mnemonic
  const { keyPair, network } = await getKeyPairFromMnemonic(mnemonic)

  // Create transaction builder
  const txb = new tapyrus.TransactionBuilder(network)
  txb.setVersion(1) // Tapyrus feature field

  // Add inputs
  for (const utxo of selectedUtxos) {
    txb.addInput(utxo.txid, utxo.vout)
  }

  // Add recipient output
  txb.addOutput(toAddress, amount)

  // Add change output if needed
  const change = totalInput - amount - fee
  if (change >= DUST_THRESHOLD) {
    txb.addOutput(fromAddress, change)
  }

  // Sign all inputs
  for (let i = 0; i < selectedUtxos.length; i++) {
    txb.sign({
      prevOutScriptType: "p2pkh",
      vin: i,
      keyPair,
    })
  }

  // Build and extract
  const tx = txb.build()
  const txHex = tx.toHex()

  // Broadcast
  const txid = await broadcastTransaction(txHex)

  return { txid, txHex }
}

export const estimateFee = async (
  fromAddress: string,
  amount: number,
  feeRate: number = DEFAULT_FEE_RATE
): Promise<number> => {
  const utxos = await getAddressUtxos(fromAddress)
  const { fee } = selectUtxos(utxos, amount, feeRate)
  return fee
}

export interface AssetSendOptions {
  fromAddress: string
  toAddress: string
  amount: number
  colorId: string
  mnemonic: string
  feeRate?: number
}

export interface BurnOptions {
  fromAddress: string
  amount: number
  colorId: string
  mnemonic: string
  feeRate?: number
}

const selectAssetUtxos = (
  assetUtxos: Utxo[],
  targetAmount: number
): { selectedUtxos: Utxo[]; totalInput: number } => {
  const sortedUtxos = [...assetUtxos].sort((a, b) => b.value - a.value)

  const selectedUtxos: Utxo[] = []
  let totalInput = 0

  for (const utxo of sortedUtxos) {
    selectedUtxos.push(utxo)
    totalInput += utxo.value

    if (totalInput >= targetAmount) {
      return { selectedUtxos, totalInput }
    }
  }

  throw new Error("Insufficient asset balance")
}

// Internal options for asset transactions (transfer or burn)
interface AssetTransactionInternalOptions {
  fromAddress: string
  toAddress?: string // undefined for burn
  amount: number
  colorId: string
  mnemonic: string
  feeRate: number
}

// Internal function for both asset transfer and burn
const createAssetTransactionInternal = async (
  options: AssetTransactionInternalOptions
): Promise<SendResult> => {
  const { fromAddress, toAddress, amount, colorId, mnemonic, feeRate } = options
  const isBurn = !toAddress

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0")
  }

  // Get all UTXOs
  const allUtxos = await getAddressUtxos(fromAddress)

  // Filter asset UTXOs
  const assetUtxos = filterUtxosByColorId(allUtxos, colorId)
  if (assetUtxos.length === 0) {
    throw new Error("No asset UTXOs available")
  }

  // Filter TPC UTXOs for fee
  const tpcUtxos = filterUtxosByColorId(allUtxos)
  if (tpcUtxos.length === 0) {
    throw new Error("No TPC UTXOs available for fee")
  }

  // Select asset UTXOs
  const { selectedUtxos: selectedAssetUtxos, totalInput: totalAssetInput } =
    selectAssetUtxos(assetUtxos, amount)

  // Estimate fee based on number of inputs and outputs
  const estimatedAssetInputs = selectedAssetUtxos.length
  const hasAssetChange = totalAssetInput > amount
  // Transfer: recipient + asset change + TPC change = 3
  // Burn: asset change (if any) + TPC change = 1 or 2
  const estimatedOutputs = isBurn
    ? (hasAssetChange ? 1 : 0) + 1
    : 3
  const estimatedSize = 10 + (estimatedAssetInputs + 1) * 148 + estimatedOutputs * 34
  const estimatedFee = estimatedSize * feeRate

  // Select TPC UTXOs for fee
  const { selectedUtxos: selectedTpcUtxos, totalInput: totalTpcInput, fee } =
    selectUtxos(tpcUtxos, estimatedFee, feeRate)

  // Get keys from mnemonic
  const { keyPair, network } = await getKeyPairFromMnemonic(mnemonic)

  // Create transaction builder
  const txb = new tapyrus.TransactionBuilder(network)
  txb.setVersion(1)

  // Decode from address to get pubkey hash for scripts
  const fromAddressDecoded = tapyrus.address.fromBase58Check(fromAddress)
  const colorIdBuffer = Buffer.from(colorId, "hex")

  // Create prevOutScript for colored inputs
  const coloredPrevOutScript = tapyrus.payments.cp2pkh({
    colorId: colorIdBuffer,
    hash: fromAddressDecoded.hash,
    network,
  }).output!

  // Add asset inputs first (with prevOutScript)
  for (const utxo of selectedAssetUtxos) {
    txb.addInput(utxo.txid, utxo.vout, undefined, coloredPrevOutScript)
  }

  // Add TPC inputs for fee
  for (const utxo of selectedTpcUtxos) {
    txb.addInput(utxo.txid, utxo.vout)
  }

  // Add asset output to recipient (only for transfer)
  if (!isBurn) {
    const toAddressDecoded = tapyrus.address.fromBase58Check(toAddress)
    const recipientScript = tapyrus.payments.cp2pkh({
      colorId: colorIdBuffer,
      hash: toAddressDecoded.hash,
      network,
    }).output!
    txb.addOutput(recipientScript, amount)
  }

  // Add asset change output if needed
  const assetChange = totalAssetInput - amount
  if (assetChange > 0) {
    const changeScript = tapyrus.payments.cp2pkh({
      colorId: colorIdBuffer,
      hash: fromAddressDecoded.hash,
      network,
    }).output!
    txb.addOutput(changeScript, assetChange)
  }

  // Add TPC change output if needed
  const tpcChange = totalTpcInput - fee
  if (tpcChange >= DUST_THRESHOLD) {
    txb.addOutput(fromAddress, tpcChange)
  }

  // Sign all inputs
  const totalInputs = selectedAssetUtxos.length + selectedTpcUtxos.length
  for (let i = 0; i < totalInputs; i++) {
    txb.sign({
      prevOutScriptType: i < selectedAssetUtxos.length ? "cp2pkh" : "p2pkh",
      vin: i,
      keyPair,
    })
  }

  // Build and extract
  const tx = txb.build()
  const txHex = tx.toHex()

  // Broadcast
  const txid = await broadcastTransaction(txHex)

  return { txid, txHex }
}

export const createAndSignAssetTransaction = async (
  options: AssetSendOptions
): Promise<SendResult> => {
  const { feeRate = DEFAULT_FEE_RATE, ...rest } = options
  return createAssetTransactionInternal({ ...rest, feeRate })
}

export const burnAsset = async (
  options: BurnOptions
): Promise<SendResult> => {
  const { feeRate = DEFAULT_FEE_RATE, ...rest } = options
  return createAssetTransactionInternal({ ...rest, feeRate })
}
