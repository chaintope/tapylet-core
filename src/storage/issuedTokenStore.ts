import type { KeyValueStore } from "./types"

export interface IssuedToken {
  colorId: string
  metadata: {
    version: string
    name: string
    symbol: string
    tokenType: "reissuable" | "non_reissuable" | "nft"
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
  paymentBase: string
  txid: string
  timestamp: number
  // OutPoint for c2/c3 tokens (txid:vout format)
  outPoint?: string
}

const STORAGE_KEY = "issued_tokens"

export class IssuedTokenStore {
  constructor(private storage: KeyValueStore) {}

  async getAll(): Promise<IssuedToken[]> {
    const tokens = await this.storage.get<IssuedToken[]>(STORAGE_KEY)
    return tokens ?? []
  }

  async add(token: IssuedToken): Promise<void> {
    const tokens = await this.getAll()
    tokens.push(token)
    await this.storage.set(STORAGE_KEY, tokens)
  }

  async get(colorId: string): Promise<IssuedToken | null> {
    const tokens = await this.getAll()
    return tokens.find((t) => t.colorId === colorId) ?? null
  }

  async remove(colorId: string): Promise<void> {
    const tokens = await this.getAll()
    const filtered = tokens.filter((t) => t.colorId !== colorId)
    await this.storage.set(STORAGE_KEY, filtered)
  }
}

