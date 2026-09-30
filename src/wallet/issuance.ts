import * as tapyrus from "tapyrusjs-lib"
import { Metadata } from "tapyrusjs-lib"
import * as ecc from "../lib/secp256k1-compat"
import { getAddressUtxos, broadcastTransaction, isTpcColorId, type Utxo } from "../api/esplora"
import { resolveKeyPair } from "./resolveKeyPair"
import { isValidAmount, isValidFeeRate, MAX_COLORED_AMOUNT } from "../utils/validation"
import {
  DUST_THRESHOLD,
  DEFAULT_FEE_RATE,
  estimateTxSize,
  feeForSize,
} from "../constants/transaction"
import { splitAmount, validateSplitRange } from "../utils/split"
import { selectTpcUtxos } from "./coinSelection"

export { MAX_SPLIT, splitAmount } from "../utils/split"

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
  networkId: number
  // Sign with the pre-network-split key (see
  // wallet/hdwallet.ts#getKeyPairFromLegacyMainnetWallet) instead of deriving
  // one for networkId.
  fromLegacyMainnetWallet?: boolean
  feeRate?: number
  // Number of colored outputs to split the issued amount across (1-100).
  // Every output gets floor(amount / split); the whole remainder goes to the
  // last output.
  split?: number
}

export interface IssueResult {
  txid: string
  colorId: string
  paymentBase: string
  // OutPoint for c2/c3 tokens (txid:vout format)
  outPoint?: string
}

export const issueToken = async (options: IssueOptions): Promise<IssueResult> => {
  const {
    tokenType,
    amount,
    metadata: metadataFields,
    mnemonic,
    fromAddress,
    networkId,
    fromLegacyMainnetWallet,
    feeRate = DEFAULT_FEE_RATE,
    split = 1,
  } = options

  // The issued amount ends up in colored outputs, so it must fit the output
  // value field. Tx1 is broadcast before those outputs are built, so an
  // amount that cannot encode has to be rejected before any I/O.
  if (!isValidAmount(amount, MAX_COLORED_AMOUNT) || amount <= 0) {
    throw new Error(
      `Amount must be a positive integer no greater than ${MAX_COLORED_AMOUNT}`
    )
  }
  if (!isValidFeeRate(feeRate)) {
    throw new Error("Invalid fee rate")
  }
  // Validated before the NFT substitution below, so an out-of-range split is
  // rejected for every token type.
  validateSplitRange(split)

  // NFTs are indivisible; any other token may be split across outputs.
  const effectiveSplit = tokenType === "nft" ? 1 : split

  // Get keys from mnemonic
  const { keyPair, publicKey, network } = await resolveKeyPair(
    mnemonic,
    networkId,
    fromLegacyMainnetWallet
  )

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
    tokenType,
    effectiveSplit
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
  tokenType: TokenType,
  split: number
): Promise<IssueResult> => {
  // Amount distributed across the colored outputs.
  const splitOutputs = splitAmount(amount, split)
  // Step 1: Create P2C address and send TPC to it
  const p2cPayment = tapyrus.payments.p2pkh({
    pubkey: p2cPublicKey,
    network,
  })
  const p2cAddress = p2cPayment.address!

  // Amount to send to P2C address (dust threshold)
  const p2cAmount = DUST_THRESHOLD

  // Tx2 fee: 1 P2C input + 1 input for fee, N colored outputs (one per split)
  // + 1 p2pkh change output
  const tx2EstimatedSize = estimateTxSize(2, 1, splitOutputs.length)
  const tx2Fee = feeForSize(tx2EstimatedSize, feeRate)

  // Tx2 spends tx1's change to pay its own fee, so tx1 must create a change
  // output that covers it. The funding transaction has 2 p2pkh outputs
  // (P2C + change); its own fee comes from the actual number of inputs.
  const { selectedUtxos, change: tx1Change } = selectTpcUtxos(tpcUtxos, {
    target: p2cAmount,
    feeRate,
    baseSize: estimateTxSize(0, 2),
    minChange: tx2Fee,
    insufficientFundsMessage: "Insufficient TPC balance for issuance",
  })

  // --- Transaction 1: Send to P2C address ---
  const txb1 = new tapyrus.TransactionBuilder(network)
  txb1.setVersion(1)

  for (const utxo of selectedUtxos) {
    txb1.addInput(utxo.txid, utxo.vout)
  }

  // P2C output
  txb1.addOutput(p2cAddress, p2cAmount)

  // Change output, spent by tx2 to pay its fee
  txb1.addOutput(fromAddress, tx1Change)

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

  // Input 1: Change from tx1, which pays tx2's fee
  txb2.addInput(tx1id, 1)
  const tx2InputTotal = p2cAmount + tx1Change

  // Colored outputs (one per split, all to fromAddress)
  const fromAddressDecoded = tapyrus.address.fromBase58Check(fromAddress)
  const coloredScript = tapyrus.payments.cp2pkh({
    colorId: colorId,
    hash: fromAddressDecoded.hash,
    network,
  }).output!
  for (const outputAmount of splitOutputs) {
    txb2.addOutput(coloredScript, outputAmount)
  }

  // Change output. tx1Change covers tx2Fee, so what is left is at least the
  // p2cAmount of DUST_THRESHOLD and always clears the dust threshold.
  const tx2Change = tx2InputTotal - tx2Fee
  txb2.addOutput(fromAddress, tx2Change)

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

  // Sign the change input with the normal keyPair
  txb2.sign({
    prevOutScriptType: "p2pkh",
    vin: 1,
    keyPair,
  })

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
