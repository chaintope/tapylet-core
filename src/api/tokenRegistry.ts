import { Metadata, NetworkId } from "tapyrusjs-lib"

import { getNetworkId } from "../config/network"

export { Metadata }

// In-memory cache
const metadataCache = new Map<string, Metadata | null>()

export const getTokenMetadata = async (colorId: string): Promise<Metadata | null> => {
  if (metadataCache.has(colorId)) return metadataCache.get(colorId)!

  // Read at call time, not module load: the host injects the network during
  // startup, which may run after this module is first imported. Kept outside
  // the try below so a missing configuration surfaces as an error instead of
  // being cached as "this token has no metadata".
  const networkId = getNetworkId() as NetworkId

  try {
    const entry = await Metadata.fetch(colorId, networkId)
    metadataCache.set(colorId, entry.metadata)
    return entry.metadata
  } catch {
    metadataCache.set(colorId, null)
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
