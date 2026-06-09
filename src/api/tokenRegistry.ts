import { Metadata, NetworkId } from "tapyrusjs-lib"

export { Metadata }

const NETWORK_ID_STR = process.env.PLASMO_PUBLIC_NETWORK_ID ?? "1939510133"
const networkId = Number(NETWORK_ID_STR) as NetworkId

// In-memory cache
const metadataCache = new Map<string, Metadata | null>()

export const getTokenMetadata = async (colorId: string): Promise<Metadata | null> => {
  if (metadataCache.has(colorId)) return metadataCache.get(colorId)!

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
