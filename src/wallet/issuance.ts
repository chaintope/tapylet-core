import * as tapyrus from "tapyrusjs-lib"
import { Metadata } from "tapyrusjs-lib"
import * as ecc from "../lib/secp256k1-compat"
import { getAddressUtxos, broadcastTransaction, isTpcColorId, type Utxo } from "../api/esplora"
import { getKeyPairFromMnemonic } from "./hdwallet"
import { DUST_THRESHOLD, DEFAULT_FEE_RATE } from "../constants/transaction"

export type TokenType = "reissuable" | "non_reissuable" | "nft"

export interface MetadataFields {
  version: string
  name: string
  symbol: string
  tokenType: TokenType
  decimals?: number
  description?: string
  icon?: string
  website?: string
  issuer?: {
    name?: string
    url?: string
    email?: string
  }
  // NFT-specific fields (TIP-0020)
  image?: string
  animation_url?: string
  external_url?: string
  attributes?: Array<{
    trait_type: string
    value: string
    display_type?: string
  }>
}

export interface IssueOptions {
  tokenType: TokenType
  amount: number
  metadata: MetadataFields
  mnemonic: string
  fromAddress: string
  feeRate?: number
}

export interface IssueResult {
  txid: string
  colorId: string
  paymentBase: string
  // OutPoint for c2/c3 tokens (txid:vout format)
  outPoint?: string
}

// Select UTXOs for issuance (TPC only)
const selectUtxosForIssuance = (
  utxos: Utxo[],
  targetAmount: number,
  feeRate: number
): { selectedUtxos: Utxo[]; totalInput: number; fee: number } => {
  // Filter TPC UTXOs only
  const tpcUtxos = utxos.filter((u) => isTpcColorId(u.colorId))

  // Sort by value descending
  const sorted = [...tpcUtxos].sort((a, b) => b.value - a.value)

  const selectedUtxos: Utxo[] = []
  let totalInput = 0
  let estimatedSize = 10 + 34 * 2 // base + 2 outputs (colored + change)

  for (const utxo of sorted) {
    selectedUtxos.push(utxo)
    totalInput += utxo.value
    estimatedSize += 148 // input size

    const fee = estimatedSize * feeRate
    if (totalInput >= targetAmount + fee) {
      return { selectedUtxos, totalInput, fee }
    }
  }

  throw new Error("Insufficient TPC balance for issuance")
}

export const issueToken = async (options: IssueOptions): Promise<IssueResult> => {
  const {
    tokenType,
    amount,
    metadata: metadataFields,
    mnemonic,
    fromAddress,
    feeRate = DEFAULT_FEE_RATE,
  } = options

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0")
  }

  // Get keys from mnemonic
  const { keyPair, publicKey, network } = await getKeyPairFromMnemonic(mnemonic)

  // Create Metadata instance
  const metadata = new Metadata(metadataFields)

  // Create P2C public key (used for all token types)
  const p2cPublicKey = metadata.p2cPublicKey(publicKey)

  // Get TPC UTXOs
  const allUtxos = await getAddressUtxos(fromAddress)
  const tpcUtxos = allUtxos.filter((u) => isTpcColorId(u.colorId))

  if (tpcUtxos.length === 0) {
    throw new Error("No TPC UTXOs available")
  }

  // All token types require two transactions:
  // 1. Send TPC to P2C address
  // 2. Spend that P2C output to issue the token
  return issueTokenInternal(
    tpcUtxos,
    keyPair,
    publicKey,
    p2cPublicKey,
    metadata,
    amount,
    fromAddress,
    feeRate,
    network,
    tokenType
  )
}

// All token types: two transactions (P2C funding + issue)
const issueTokenInternal = async (
  tpcUtxos: Utxo[],
  keyPair: tapyrus.ECPairInterface,
  publicKey: Buffer,
  p2cPublicKey: Buffer,
  metadata: Metadata,
  amount: number,
  fromAddress: string,
  feeRate: number,
  network: tapyrus.Network,
  tokenType: TokenType
): Promise<IssueResult> => {
  // Step 1: Create P2C address and send TPC to it
  const p2cPayment = tapyrus.payments.p2pkh({
    pubkey: p2cPublicKey,
    network,
  })
  const p2cAddress = p2cPayment.address!

  // Amount to send to P2C address (dust threshold)
  const p2cAmount = DUST_THRESHOLD

  // Estimate fees for both transactions
  // Tx1: 1 input, 2 outputs (P2C + change)
  const tx1EstimatedSize = 10 + 148 + 34 * 2
  const tx1Fee = tx1EstimatedSize * feeRate

  // Tx2: 1 P2C input + additional inputs for fee, 2 outputs (colored + change)
  const tx2EstimatedSize = 10 + 148 * 2 + 34 * 2
  const tx2Fee = tx2EstimatedSize * feeRate

  // Total needed: P2C amount + both fees
  const totalNeeded = p2cAmount + tx1Fee + tx2Fee

  const selection = selectUtxosForIssuance(tpcUtxos, totalNeeded, feeRate)
  const { selectedUtxos, totalInput } = selection

  // --- Transaction 1: Send to P2C address ---
  const txb1 = new tapyrus.TransactionBuilder(network)
  txb1.setVersion(1)

  for (const utxo of selectedUtxos) {
    txb1.addInput(utxo.txid, utxo.vout)
  }

  // P2C output
  txb1.addOutput(p2cAddress, p2cAmount)

  // Change output (need to reserve for tx2 fee)
  const tx1Change = totalInput - p2cAmount - tx1Fee
  if (tx1Change >= DUST_THRESHOLD) {
    txb1.addOutput(fromAddress, tx1Change)
  }

  for (let i = 0; i < selectedUtxos.length; i++) {
    txb1.sign({ prevOutScriptType: "p2pkh", vin: i, keyPair })
  }

  const tx1 = txb1.build()
  const tx1id = await broadcastTransaction(tx1.toHex())

  // --- Transaction 2: Issue token from P2C output ---
  // Derive colorId based on token type
  let colorId: Buffer
  let outPointStr: string | undefined

  if (tokenType === "reissuable") {
    // c1: colorId is derived from P2C public key
    colorId = metadata.deriveColorId(publicKey)
  } else {
    // c2/c3: colorId is derived from OutPoint
    const outPoint = {
      txid: Buffer.from(tx1id, "hex").reverse(),
      index: 0,
    }
    colorId = metadata.deriveColorId(undefined, outPoint)
    outPointStr = `${tx1id}:0`
  }
  const colorIdHex = colorId.toString("hex")

  const txb2 = new tapyrus.TransactionBuilder(network)
  txb2.setVersion(1)

  // Input 0: P2C output from tx1
  txb2.addInput(tx1id, 0)

  // Input 1: Change from tx1 for fee (if available)
  let tx2InputTotal = p2cAmount
  if (tx1Change >= DUST_THRESHOLD) {
    txb2.addInput(tx1id, 1)
    tx2InputTotal += tx1Change
  }

  // Colored output
  const fromAddressDecoded = tapyrus.address.fromBase58Check(fromAddress)
  const coloredScript = tapyrus.payments.cp2pkh({
    colorId: colorId,
    hash: fromAddressDecoded.hash,
    network,
  }).output!
  txb2.addOutput(coloredScript, amount)

  // Change output
  const tx2Change = tx2InputTotal - tx2Fee
  if (tx2Change >= DUST_THRESHOLD) {
    txb2.addOutput(fromAddress, tx2Change)
  }

  // Derive P2C private key: p2cPrivateKey = privateKey + commitment
  const commitment = metadata.commitment(publicKey)
  const p2cPrivateKeyBytes = ecc.privateAdd(keyPair.privateKey!, commitment)
  if (!p2cPrivateKeyBytes) {
    throw new Error("Failed to derive P2C private key")
  }
  const p2cKeyPair = tapyrus.ECPair.fromPrivateKey(Buffer.from(p2cPrivateKeyBytes), { network })

  // Sign P2C input (index 0) with P2C keyPair
  txb2.sign({
    prevOutScriptType: "p2pkh",
    vin: 0,
    keyPair: p2cKeyPair,
  })

  // Sign change input (if present) with normal keyPair
  if (tx1Change >= DUST_THRESHOLD) {
    txb2.sign({
      prevOutScriptType: "p2pkh",
      vin: 1,
      keyPair,
    })
  }

  const tx2 = txb2.build()
  const tx2id = await broadcastTransaction(tx2.toHex())

  const result: IssueResult = {
    txid: tx2id,
    colorId: colorIdHex,
    paymentBase: publicKey.toString("hex"),
  }

  if (outPointStr) {
    result.outPoint = outPointStr
  }

  return result
}
