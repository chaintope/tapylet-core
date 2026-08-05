/**
 * Where core talks to Esplora, and where it sends the user for block explorer
 * pages.
 *
 * As with the network id (see ./network), the host injects this rather than
 * core reading it from the environment: the Chrome extension pins one network
 * at build time through Plasmo, while the mobile app lets the user switch
 * networks from the settings screen, and a constant captured at module load
 * cannot follow that.
 *
 * Unlike the network id this one keeps a default — the Plasmo variables, read
 * once here — so extension builds that never call setExplorerUrls behave
 * exactly as before. A host that switches networks must call setExplorerUrls
 * together with setNetworkId: the two describe the same network, and setting
 * only one means fetching one network's UTXOs while resolving the other
 * network's token metadata.
 */

export interface ExplorerUrls {
  /** Esplora REST API base, e.g. "https://example.com/api" */
  apiUrl: string
  /** Block explorer web UI base, e.g. "https://example.com" */
  webUrl: string
}

const DEFAULT_EXPLORER_URL = "https://testnet-explorer.tapyrus.dev.chaintope.com"

/**
 * Rejects anything that isn't an absolute http(s) URL and drops trailing
 * slashes, since every call site appends a path beginning with "/". A relative
 * or misspelled value would otherwise surface much later as a failed fetch
 * against an address that looks plausible in the logs.
 */
const normalizeUrl = (raw: string, field: keyof ExplorerUrls): string => {
  const trimmed = typeof raw === "string" ? raw.trim().replace(/\/+$/, "") : ""
  if (!/^https?:\/\/\S+$/.test(trimmed)) {
    throw new Error(`Invalid explorer ${field}: ${JSON.stringify(raw)}`)
  }
  return trimmed
}

let urls: ExplorerUrls = {
  apiUrl: normalizeUrl(
    process.env.PLASMO_PUBLIC_EXPLORER_API_URL ?? `${DEFAULT_EXPLORER_URL}/api`,
    "apiUrl",
  ),
  webUrl: normalizeUrl(
    process.env.PLASMO_PUBLIC_EXPLORER_URL ?? DEFAULT_EXPLORER_URL,
    "webUrl",
  ),
}

/**
 * Points core at an Esplora instance. Call this during startup, and again on
 * every network switch, before the next API call. Throws on a malformed URL so
 * a misconfigured host fails loudly instead of quietly reporting an empty
 * balance.
 */
export const setExplorerUrls = (next: ExplorerUrls): void => {
  urls = {
    apiUrl: normalizeUrl(next.apiUrl, "apiUrl"),
    webUrl: normalizeUrl(next.webUrl, "webUrl"),
  }
}

/** Esplora REST API base, without a trailing slash. */
export const getExplorerApiUrl = (): string => urls.apiUrl

/** Block explorer web UI base, without a trailing slash. */
export const getExplorerWebUrl = (): string => urls.webUrl
