/**
 * TIP-0021 URI scheme (`tapyrus:<network_id>/<address>[?params]`).
 *
 * Encoding is used for receive-side QR display, decoding for QR scan and
 * deep link handling. The network id is always passed in by the caller so
 * this module stays platform-agnostic — each client resolves its own
 * current network.
 *
 * See tips/tip-0021.md for the normative spec.
 */
import * as tapyrus from "tapyrusjs-lib"

// The scheme is case-insensitive per the TIP; the rest of the URI, including
// query parameter keys, is case-sensitive.
const TAPYRUS_URI_RE = /^tapyrus:(\d+)\/([^?]+)(?:\?(.*))?$/i

// amountparam = "amount=" *digit [ "." *digit ] — decimal TPC, period as the
// only decimal separator.
const AMOUNT_RE = /^\d+(\.\d*)?$|^\.\d+$/

// coinparam = "coin=" 1*digit — a positive integer number of tokens.
const COIN_RE = /^\d+$/

// Address version bytes. `prod` is the only parameter set this wallet builds
// and validates addresses with (see wallet/address.ts), so the same set applies
// here.
const STANDARD_VERSIONS: number[] = [
  tapyrus.networks.prod.pubKeyHash,
  tapyrus.networks.prod.scriptHash,
]
const COLORED_VERSIONS: number[] = [
  tapyrus.networks.prod.coloredPubKeyHash,
  tapyrus.networks.prod.coloredScriptHash,
]

export interface TapyrusUriPayment {
  /**
   * The address as written in the URI. Checked only far enough to determine
   * its type — base58check with a `prod` version byte — which is not the same
   * as being spendable. Callers must still run it through validateAddress (and
   * whatever else the send path requires) before using it as a payment target.
   */
  address: string
  /**
   * Amount of TPC in decimal. Standard (P2PKH/P2SH) addresses only. `"0"` is
   * accepted: the TIP's ABNF is `"amount=" *digit [ "." *digit ]`, which puts
   * no lower bound on the value, unlike `coin` whose spec text requires a
   * positive integer. A zero-amount URI is for the caller to handle.
   */
  amount?: string
  /** Number of Colored Coin tokens. Colored Coin (CP2PKH/CP2SH) addresses only. */
  coin?: string
  label?: string
  message?: string
  /**
   * Color ID of `address`, present only for CP2PKH/CP2SH (Colored Coin)
   * addresses. Derived from the address itself, not a URI param — TIP-0021
   * embeds the Color ID in the address, so it doesn't need to be signalled
   * separately.
   */
  colorId?: string
}

/**
 * Why a URI was rejected. Callers need the distinction because the reasons
 * mean very different things to a user: `network-mismatch` is a genuine
 * cross-network payment attempt worth naming explicitly (the whole point of
 * TIP-0021 making the network id mandatory), while the rest are malformed
 * input.
 */
export type TapyrusUriRejection =
  | "not-a-tapyrus-uri"
  | "network-mismatch"
  | "invalid-address"
  | "malformed-query"
  | "unsupported-required-param"
  | "amount-with-colored-address"
  | "coin-with-standard-address"
  | "invalid-amount"
  | "invalid-coin"

export type TapyrusUriResult =
  | { ok: true; payment: TapyrusUriPayment }
  | { ok: false; reason: TapyrusUriRejection }

export type QRAddressResult =
  | { ok: true; address: string }
  | { ok: false; reason: TapyrusUriRejection }

/**
 * Builds a TIP-0021 URI for the given address on the given network. Used for
 * receive-side QR display; the address itself should still be shown as a raw
 * string so it stays copy-pastable.
 */
export const buildAddressUri = (address: string, networkId: number): string =>
  `tapyrus:${networkId}/${address}`

/**
 * Drops the fragment. RFC 3986 §3.5 delimits it with the first "#" and places
 * it outside the path and query — it is client-side data for dereferencing the
 * resource, never part of the identifier the scheme handler acts on. A
 * `tapyrus:` URI has no use for one, but a link on a webpage or a deep link
 * routed through a browser can still carry one, and leaving it in would either
 * corrupt the address (`<address>#frag`) or the last query value
 * (`amount=1#frag`).
 */
const stripFragment = (raw: string): string => {
  const hash = raw.indexOf("#")
  return hash === -1 ? raw : raw.slice(0, hash)
}

const normalize = (raw: string): string => stripFragment(raw.trim()).trim()

/**
 * Percent-decodes the query component per RFC 3986, as TIP-0021 requires
 * ("encoded according to UTF-8, and then each octet ... percent-encoded as
 * described in RFC 3986"). Deliberately not URLSearchParams: that applies
 * application/x-www-form-urlencoded rules and would turn a literal "+" in a
 * label or message into a space. Returns null on malformed percent-encoding,
 * which makes the whole URI invalid. The first occurrence of a repeated key
 * wins.
 */
const parseQuery = (query: string): Map<string, string> | null => {
  const params = new Map<string, string>()
  if (!query) return params

  for (const pair of query.split("&")) {
    // tapyrusparam may be empty in the ABNF, so "a=1&&b=2" is not an error.
    if (!pair) continue
    const separator = pair.indexOf("=")
    const rawKey = separator === -1 ? pair : pair.slice(0, separator)
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1)
    try {
      const key = decodeURIComponent(rawKey)
      if (!params.has(key)) params.set(key, decodeURIComponent(rawValue))
    } catch {
      return null
    }
  }
  return params
}

/**
 * Decodes a base58check Tapyrus address, requiring a `prod` version byte that
 * agrees with the payload: 54 bytes carrying a Color ID must use a CP2PKH/CP2SH
 * version, 21 bytes a P2PKH/P2SH one. Returns null otherwise, so callers can
 * tell a standard address apart from a colored one and from garbage — a
 * distinction the parameter restrictions below depend on.
 *
 * fromBase58Check accepts any version byte, so without this check a dev-network
 * address, or one from an unrelated chain with a different prefix, parses as a
 * valid payment target. What the check cannot do is identify the network:
 * Tapyrus API (15215628) and Testnet (1939510133) share the `prod` version
 * bytes, and `prod` in turn matches Bitcoin mainnet's, so an address alone can
 * never say which network it belongs to. That is exactly why TIP-0021 makes the
 * network id mandatory — the network id in the URI is the only cross-network
 * guard.
 */
const decodeAddress = (address: string): { colorId?: string } | null => {
  try {
    const { version, colorId } = tapyrus.address.fromBase58Check(address)
    if (colorId) {
      if (!COLORED_VERSIONS.includes(version)) return null
      return { colorId: colorId.toString("hex") }
    }
    if (!STANDARD_VERSIONS.includes(version)) return null
    return {}
  } catch {
    return null
  }
}

/** True if `raw` is shaped like a `tapyrus:<network_id>/...` URI. */
export const isTapyrusUri = (raw: string): boolean => TAPYRUS_URI_RE.test(normalize(raw))

/**
 * Decodes the Color ID embedded in a CP2PKH/CP2SH address. Returns undefined
 * for standard (P2PKH/P2SH) addresses or anything that fails to decode.
 */
export const getColorIdFromAddress = (address: string): string | undefined =>
  decodeAddress(address)?.colorId

/**
 * Parses a full TIP-0021 URI, reporting why it was rejected. Rejection follows
 * the TIP:
 *
 * - `not-a-tapyrus-uri`: not a `tapyrus:` URI carrying a network id ("Clients
 *   MUST reject URIs that do not include a valid network ID")
 * - `network-mismatch`: the network id differs from `expectedNetworkId`, i.e.
 *   the URI targets another Tapyrus network
 * - `invalid-address`: the address is not base58check with a Tapyrus version
 *   byte, so its type — and therefore which parameters it may carry — cannot be
 *   determined
 * - `malformed-query`: the query has broken percent-encoding
 * - `unsupported-required-param`: a `req-` prefixed parameter is present, none
 *   of which are implemented here ("If a client does not implement any
 *   variables which are prefixed with `req-`, it MUST consider the entire URI
 *   invalid")
 * - `amount-with-colored-address` / `coin-with-standard-address`: a violation
 *   of "Address Types and Parameter Restrictions"
 * - `invalid-amount` / `invalid-coin`: malformed value (comma as separator,
 *   non-positive or non-integer `coin`)
 *
 * Unknown parameters without the `req-` prefix are ignored, as the TIP's
 * forward compatibility rules require.
 */
export const parseTapyrusUriResult = (
  raw: string,
  expectedNetworkId: number,
): TapyrusUriResult => {
  const uri = TAPYRUS_URI_RE.exec(normalize(raw))
  if (!uri) return { ok: false, reason: "not-a-tapyrus-uri" }

  const [, networkId, rawAddress, query] = uri
  if (Number(networkId) !== expectedNetworkId) {
    return { ok: false, reason: "network-mismatch" }
  }

  const address = rawAddress.trim()
  const decoded = decodeAddress(address)
  if (!decoded) return { ok: false, reason: "invalid-address" }

  const params = parseQuery(query ?? "")
  if (!params) return { ok: false, reason: "malformed-query" }
  for (const key of params.keys()) {
    if (key.startsWith("req-")) return { ok: false, reason: "unsupported-required-param" }
  }

  const amount = params.get("amount")
  const coin = params.get("coin")
  const colorId = decoded.colorId
  if (colorId && amount !== undefined) {
    return { ok: false, reason: "amount-with-colored-address" }
  }
  if (!colorId && coin !== undefined) {
    return { ok: false, reason: "coin-with-standard-address" }
  }
  if (amount !== undefined && !AMOUNT_RE.test(amount)) {
    return { ok: false, reason: "invalid-amount" }
  }
  if (coin !== undefined && (!COIN_RE.test(coin) || Number(coin) <= 0)) {
    return { ok: false, reason: "invalid-coin" }
  }

  return {
    ok: true,
    payment: {
      address,
      amount,
      coin,
      label: params.get("label"),
      message: params.get("message"),
      colorId,
    },
  }
}

/**
 * Parses a full TIP-0021 URI into its payment fields, or null when it must be
 * rejected. Use parseTapyrusUriResult when the reason matters to the user.
 */
export const parseTapyrusUri = (
  raw: string,
  expectedNetworkId: number,
): TapyrusUriPayment | null => {
  const result = parseTapyrusUriResult(raw, expectedNetworkId)
  return result.ok ? result.payment : null
}

/**
 * Extracts a Tapyrus address from a raw QR payload. Accepts a bare address and
 * a TIP-0021 URI. Anything that isn't shaped like `tapyrus:<network_id>/...`
 * (a bare address, `bitcoin:...`, or a legacy URI without a network id) is
 * returned unchanged so it falls through to validateAddress and surfaces as
 * "invalid address" rather than being silently unwrapped — a successful result
 * therefore carries an address that still needs validating. A URI with the
 * right shape but a rejected payload reports why, so a scan of a mainnet QR on
 * testnet can say so instead of blaming the address.
 */
export const parseAddressFromQR = (
  raw: string,
  expectedNetworkId: number,
): QRAddressResult => {
  const value = normalize(raw)
  if (!isTapyrusUri(value)) return { ok: true, address: value }

  const result = parseTapyrusUriResult(value, expectedNetworkId)
  return result.ok ? { ok: true, address: result.payment.address } : result
}
