const mockFetch = jest.fn()

// tokenRegistry uses only Metadata.fetch from the library; NetworkId appears
// solely as a type cast and does not survive compilation.
jest.mock('tapyrusjs-lib', () => ({
  Metadata: { fetch: mockFetch },
}))

// TIP-0044 network ids
const TESTNET = 1939510133
const MAINNET = 15215628

const COLOR_ID = 'c1' + '22'.repeat(32)

const metadata = (name: string) => ({ name }) as never

// Both modules hold state — the metadata cache and the injected network id — so
// every test works on a fresh copy of them.
const load = () => {
  jest.resetModules()
  return {
    registry: require('~/core/api/tokenRegistry') as typeof import('~/core/api/tokenRegistry'),
    network: require('~/core/config/network') as typeof import('~/core/config/network'),
  }
}

describe('api/tokenRegistry', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('without a configured network', () => {
    it('should throw from getTokenMetadata instead of falling back to a default', async () => {
      const { registry } = load()
      await expect(registry.getTokenMetadata(COLOR_ID)).rejects.toThrow(/not configured/)
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should throw from getTokenMetadataBatch', async () => {
      const { registry } = load()
      await expect(registry.getTokenMetadataBatch([COLOR_ID])).rejects.toThrow(/not configured/)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('caching', () => {
    it('should fetch a Color ID once per network', async () => {
      const { registry, network } = load()
      network.setNetworkId(TESTNET)
      mockFetch.mockResolvedValue({ metadata: metadata('token') })

      await registry.getTokenMetadata(COLOR_ID)
      await registry.getTokenMetadata(COLOR_ID)

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith(COLOR_ID, TESTNET)
    })

    it('should refetch the same Color ID after the host switches network', async () => {
      const { registry, network } = load()
      network.setNetworkId(TESTNET)
      mockFetch.mockResolvedValueOnce({ metadata: metadata('testnet token') })
      expect(await registry.getTokenMetadata(COLOR_ID)).toEqual({ name: 'testnet token' })

      network.setNetworkId(MAINNET)
      mockFetch.mockResolvedValueOnce({ metadata: metadata('mainnet token') })
      expect(await registry.getTokenMetadata(COLOR_ID)).toEqual({ name: 'mainnet token' })

      expect(mockFetch).toHaveBeenCalledTimes(2)
      expect(mockFetch).toHaveBeenLastCalledWith(COLOR_ID, MAINNET)
    })

    it('should not carry a cached miss across networks', async () => {
      const { registry, network } = load()
      network.setNetworkId(TESTNET)
      mockFetch.mockRejectedValueOnce(new Error('not registered'))
      expect(await registry.getTokenMetadata(COLOR_ID)).toBeNull()

      network.setNetworkId(MAINNET)
      mockFetch.mockResolvedValueOnce({ metadata: metadata('mainnet token') })
      expect(await registry.getTokenMetadata(COLOR_ID)).toEqual({ name: 'mainnet token' })
    })

    it('should keep returning the cached miss on the same network', async () => {
      const { registry, network } = load()
      network.setNetworkId(TESTNET)
      mockFetch.mockRejectedValue(new Error('not registered'))

      expect(await registry.getTokenMetadata(COLOR_ID)).toBeNull()
      expect(await registry.getTokenMetadata(COLOR_ID)).toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
