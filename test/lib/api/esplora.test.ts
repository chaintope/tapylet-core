import {
  broadcastTransaction,
  getAddressInfo,
  getExplorerColorUrl,
  getExplorerTxUrl,
} from '~/core/api/esplora'
import { configureNetwork } from '~/core/config/network'

// TIP-0044 network ids
const TESTNET = 1939510133
const MAINNET = 15215628

const TESTNET_CONFIG = {
  networkId: TESTNET,
  explorer: {
    apiUrl: 'https://testnet-explorer.example.com/api',
    webUrl: 'https://testnet-explorer.example.com',
  },
}

const MAINNET_CONFIG = {
  networkId: MAINNET,
  explorer: {
    apiUrl: 'https://explorer.example.com/api',
    webUrl: 'https://explorer.example.com',
  },
}

const TXID = 'a'.repeat(64)
const COLOR_ID = 'c1' + '22'.repeat(32)

// These tests are about one thing only: that every request goes to the
// endpoint the host configured last, rather than to one captured when the
// module was first imported.
describe('api/esplora endpoint wiring', () => {
  const mockFetch = jest.fn()

  beforeEach(() => {
    mockFetch.mockReset()
    global.fetch = mockFetch as unknown as typeof fetch
    configureNetwork(TESTNET_CONFIG)
  })

  describe('explorer links', () => {
    it('should build links from the configured web url', () => {
      expect(getExplorerTxUrl(TXID)).toBe(
        `https://testnet-explorer.example.com/tx/${TXID}`,
      )
      expect(getExplorerColorUrl(COLOR_ID)).toBe(
        `https://testnet-explorer.example.com/color/${COLOR_ID}`,
      )
    })

    it('should follow a network switch', () => {
      configureNetwork(MAINNET_CONFIG)
      expect(getExplorerTxUrl(TXID)).toBe(
        `https://explorer.example.com/tx/${TXID}`,
      )
      expect(getExplorerColorUrl(COLOR_ID)).toBe(
        `https://explorer.example.com/color/${COLOR_ID}`,
      )
    })
  })

  describe('api requests', () => {
    it('should read addresses from the configured api url', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ address: 'addr' }) })

      await getAddressInfo('addr')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://testnet-explorer.example.com/api/address/addr',
      )
    })

    it('should broadcast to the api url in effect at call time', async () => {
      mockFetch.mockResolvedValue({ ok: true, text: async () => TXID })

      await broadcastTransaction('00')
      configureNetwork(MAINNET_CONFIG)
      await broadcastTransaction('00')

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://testnet-explorer.example.com/api/tx',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://explorer.example.com/api/tx',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  // The configuration lives in module state, so observing the unconfigured
  // case requires a fresh copy of both modules.
  it('should throw instead of falling back to a default endpoint', async () => {
    jest.resetModules()
    const fresh = require('~/core/api/esplora') as typeof import('~/core/api/esplora')

    expect(() => fresh.getExplorerTxUrl(TXID)).toThrow(/not configured/)
    await expect(fresh.getAddressInfo('addr')).rejects.toThrow(/not configured/)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
