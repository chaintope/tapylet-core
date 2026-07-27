/**
 * The Tapyrus network the host application operates on.
 *
 * The value is injected by the client at startup rather than read from the
 * environment here. Core runs under Plasmo (which inlines `process.env` at
 * build time), Metro/Hermes (where that variable does not exist at all) and
 * Jest, and each host resolves its network differently — reading a
 * bundler-specific variable from core would silently fall back to a default on
 * every host that doesn't define it, which for a wallet means talking to the
 * wrong network.
 *
 * Network ids are defined by TIP-0044 (1 = Dev, 15215628 = Tapyrus API,
 * 1939510133 = Tapyrus Testnet), but the set is open — private networks pick
 * their own id — so validation checks the shape of the value, not its
 * membership in a list.
 */

// Network ids are unsigned 32-bit values.
const MAX_NETWORK_ID = 0xffffffff

let networkId: number | null = null

/** True if `id` is shaped like a Tapyrus network id. */
export const isValidNetworkId = (id: number): boolean =>
  Number.isInteger(id) && id > 0 && id <= MAX_NETWORK_ID

/**
 * Converts a network id read from configuration (an env var, a build flag) to
 * a number, throwing when it isn't one. Number() alone is too lenient for this:
 * it accepts "0x1", "1e9" and " 12 ", and turns anything else into NaN, which
 * would surface much later as a `tapyrus:NaN/<address>` URI or a registry
 * lookup against a nonexistent network.
 */
export const parseNetworkId = (raw: string): number => {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`Invalid Tapyrus network id: ${JSON.stringify(raw)}`)
  }
  const parsed = Number(raw)
  if (!isValidNetworkId(parsed)) {
    throw new Error(`Tapyrus network id out of range: ${raw}`)
  }
  return parsed
}

/**
 * Sets the network every network-aware part of core operates on. Call this
 * once during startup, before any API call. Throws on an invalid id so a
 * misconfigured build fails loudly instead of producing URIs and lookups for a
 * network that doesn't exist.
 */
export const setNetworkId = (id: number): void => {
  if (!isValidNetworkId(id)) {
    throw new Error(`Invalid Tapyrus network id: ${id}`)
  }
  networkId = id
}

/**
 * The configured network id. Throws when the host hasn't called setNetworkId
 * yet — defaulting here would mean silently using one network's registry while
 * the UI shows another's addresses.
 */
export const getNetworkId = (): number => {
  if (networkId === null) {
    throw new Error(
      "Tapyrus network id is not configured. Call setNetworkId() during startup.",
    )
  }
  return networkId
}
