/**
 * The Tapyrus network the host application operates on: the network id, and
 * the Esplora / block explorer endpoints that serve it.
 *
 * The whole configuration is injected by the host at startup rather than read
 * from the environment here. Core runs under Plasmo (which inlines
 * `process.env` at build time), Metro/Hermes (where those variables do not
 * exist at all) and Jest, and each host resolves its network differently —
 * reading a bundler-specific variable from core would silently fall back to a
 * default on every host that doesn't define it, which for a wallet means
 * talking to the wrong network.
 *
 * Id and endpoints are set together, in one call, because they describe one
 * network: the id drives TIP-0021 URIs and token registry lookups, while the
 * endpoints decide which chain balances and broadcasts go to. Setting only one
 * would fetch one network's UTXOs while resolving the other network's token
 * metadata — a wallet showing an empty balance with no error anywhere. There
 * is deliberately no way to set them separately.
 *
 * Network ids are defined by TIP-0044 (1 = Dev, 15215628 = Tapyrus API,
 * 1939510133 = Tapyrus Testnet), but the set is open — private networks pick
 * their own id — so validation checks the shape of the value, not its
 * membership in a list.
 */

// Network ids are unsigned 32-bit values.
const MAX_NETWORK_ID = 0xffffffff

export interface ExplorerUrls {
  /** Esplora REST API base, e.g. "https://example.com/api" */
  apiUrl: string
  /** Block explorer web UI base, e.g. "https://example.com" */
  webUrl: string
}

export interface NetworkConfig {
  /** TIP-0044 network id */
  networkId: number
  explorer: ExplorerUrls
}

let config: NetworkConfig | null = null

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
 * Rejects anything that isn't an absolute http(s) URL, and drops trailing
 * slashes since every call site appends a path beginning with "/". A relative
 * or misspelled value would otherwise surface much later as a failed fetch
 * against an address that looks plausible in the logs.
 *
 * `raw` is unknown rather than string because this package is consumed from
 * JavaScript too, where the declared type guarantees nothing.
 */
const normalizeUrl = (raw: unknown, field: keyof ExplorerUrls): string => {
  const trimmed = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : ""
  // Case-insensitive: URL schemes are, per RFC 3986.
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    throw new Error(`Invalid explorer ${field}: ${JSON.stringify(raw)}`)
  }
  return trimmed
}

/**
 * Points core at a network. Call this during startup before any API call, and
 * again on every network switch. Throws on an invalid id or a malformed URL so
 * a misconfigured host fails loudly instead of producing URIs for a network
 * that doesn't exist, or quietly reporting an empty balance.
 *
 * Nothing is applied unless the whole configuration validates, so a rejected
 * call leaves the previous network in place rather than half of a new one.
 */
export const configureNetwork = (next: NetworkConfig): void => {
  if (!isValidNetworkId(next?.networkId)) {
    throw new Error(`Invalid Tapyrus network id: ${next?.networkId}`)
  }
  config = {
    networkId: next.networkId,
    explorer: {
      apiUrl: normalizeUrl(next.explorer?.apiUrl, "apiUrl"),
      webUrl: normalizeUrl(next.explorer?.webUrl, "webUrl"),
    },
  }
}

/**
 * Throws when the host hasn't called configureNetwork yet — defaulting here
 * would mean silently using one network's registry while the UI shows
 * another's addresses.
 */
const requireConfig = (): NetworkConfig => {
  if (config === null) {
    throw new Error(
      "Tapyrus network is not configured. Call configureNetwork() during startup.",
    )
  }
  return config
}

/** The configured network id. */
export const getNetworkId = (): number => requireConfig().networkId

/** Esplora REST API base, without a trailing slash. */
export const getExplorerApiUrl = (): string => requireConfig().explorer.apiUrl

/** Block explorer web UI base, without a trailing slash. */
export const getExplorerWebUrl = (): string => requireConfig().explorer.webUrl
