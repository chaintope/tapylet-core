import { Metadata, NetworkId } from "tapyrusjs-lib"

import { getNetworkId } from "../config/network"

export { Metadata }

// In-memory cache, keyed by `${networkId}:${colorId}` — see below.
const metadataCache = new Map<string, Metadata | null>()

export const getTokenMetadata = async (colorId: string): Promise<Metadata | null> => {
  // Read at call time, not module load: the host injects the network during
  // startup, which may run after this module is first imported. Kept outside
  // the try below so a missing configuration surfaces as an error instead of
  // being cached as "this token has no metadata".
  const networkId = getNetworkId() as NetworkId

  // The network is part of the key because setNetworkId may be called again at
  // runtime. A Color ID resolves against a per-network registry, so an entry
  // fetched on one network — including a cached null for "not registered" —
  // says nothing about the same Color ID on another.
  const cacheKey = `${networkId}:${colorId}`
  if (metadataCache.has(cacheKey)) return metadataCache.get(cacheKey)!

  try {
    const entry = await Metadata.fetch(colorId, networkId)
    metadataCache.set(cacheKey, entry.metadata)
    return entry.metadata
  } catch {
    metadataCache.set(cacheKey, null)
    return null
  }
}

// 複数の colorId のメタデータを一括取得
export const getTokenMetadataBatch = async (colorIds: string[]): Promise<Map<string, Metadata>> => {
  const results = new Map<string, Metadata>()
  await Promise.all(
    colorIds.map(async (colorId) => {
      const metadata = await getTokenMetadata(colorId)
      if (metadata) results.set(colorId, metadata)
    })
  )
  return results
}
