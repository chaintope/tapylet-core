/**
 * Validation utilities for API responses and user inputs
 */

// Maximum safe integer for amounts (avoid overflow issues)
// Tapyrus max supply is 21 million * 10^8 tapyrus = 2.1 * 10^15
export const MAX_AMOUNT = 2_100_000_000_000_000 // 21 million TPC in tapyrus units

// Maximum amount for colored coins (arbitrary but reasonable limit)
export const MAX_COLORED_AMOUNT = Number.MAX_SAFE_INTEGER

/**
 * Validate that a value is a safe positive integer within range
 */
export const isValidAmount = (value: number, max: number = MAX_AMOUNT): boolean => {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= max
  )
}

/**
 * Validate UTXO data from API
 */
export interface RawUtxo {
  txid: unknown
  vout: unknown
  value: unknown
  status: unknown
  colorId?: unknown
}

export const validateUtxo = (utxo: RawUtxo): boolean => {
  // txid must be 64 character hex string
  if (typeof utxo.txid !== "string" || !/^[a-f0-9]{64}$/i.test(utxo.txid)) {
    console.warn("Invalid UTXO txid:", utxo.txid)
    return false
  }

  // vout must be non-negative integer
  if (typeof utxo.vout !== "number" || !Number.isInteger(utxo.vout) || utxo.vout < 0) {
    console.warn("Invalid UTXO vout:", utxo.vout)
    return false
  }

  // value must be valid amount
  if (typeof utxo.value !== "number" || !isValidAmount(utxo.value)) {
    console.warn("Invalid UTXO value:", utxo.value)
    return false
  }

  // status must be object with confirmed boolean
  if (
    typeof utxo.status !== "object" ||
    utxo.status === null ||
    typeof (utxo.status as Record<string, unknown>).confirmed !== "boolean"
  ) {
    console.warn("Invalid UTXO status:", utxo.status)
    return false
  }

  // colorId is optional but if present must be hex string
  if (utxo.colorId !== undefined && utxo.colorId !== null) {
    if (typeof utxo.colorId !== "string" || !/^[a-f0-9]+$/i.test(utxo.colorId)) {
      console.warn("Invalid UTXO colorId:", utxo.colorId)
      return false
    }
  }

  return true
}

/**
 * Validate transaction info from API
 */
export interface RawTransactionInfo {
  txid: unknown
  status: unknown
}

export const validateTransactionInfo = (info: RawTransactionInfo): boolean => {
  if (typeof info.txid !== "string" || !/^[a-f0-9]{64}$/i.test(info.txid)) {
    console.warn("Invalid transaction txid:", info.txid)
    return false
  }

  if (
    typeof info.status !== "object" ||
    info.status === null ||
    typeof (info.status as Record<string, unknown>).confirmed !== "boolean"
  ) {
    console.warn("Invalid transaction status:", info.status)
    return false
  }

  return true
}

/**
 * Parse and validate amount string, returning validated integer (in smallest unit) or null.
 * When decimals is provided, accepts decimal input (e.g. "10.5" with decimals=2 → 1050).
 */
export const parseAndValidateAmount = (
  amountStr: string,
  max: number = MAX_COLORED_AMOUNT,
  decimals?: number
): number | null => {
  const trimmed = amountStr.trim()
  if (!trimmed) return null

  if (decimals && decimals > 0) {
    // Allow digits with optional decimal point
    if (!/^\d+(\.\d+)?$/.test(trimmed)) return null

    const parts = trimmed.split(".")
    const fracDigits = parts[1]?.length ?? 0
    if (fracDigits > decimals) return null

    const multiplier = Math.pow(10, decimals)
    const parsed = Math.round(parseFloat(trimmed) * multiplier)

    if (!isValidAmount(parsed, max)) return null
    return parsed
  }

  // No decimals: only allow digits
  if (!/^\d+$/.test(trimmed)) return null

  const parsed = parseInt(trimmed, 10)

  if (!isValidAmount(parsed, max)) return null

  return parsed
}
