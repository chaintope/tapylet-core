import {
  configureNetwork,
  getExplorerApiUrl,
  getExplorerWebUrl,
  getNetworkId,
  isValidNetworkId,
  parseNetworkId,
} from '~/core/config/network'

// TIP-0044 network ids
const TESTNET = 1939510133
const MAINNET = 15215628

const TESTNET_CONFIG = {
  networkId: TESTNET,
  explorer: {
    apiUrl: 'https://testnet-explorer.tapyrus.dev.chaintope.com/api',
    webUrl: 'https://testnet-explorer.tapyrus.dev.chaintope.com',
  },
}

const MAINNET_CONFIG = {
  networkId: MAINNET,
  explorer: {
    apiUrl: 'https://explorer.api.tapyrus.chaintope.com/api',
    webUrl: 'https://explorer.api.tapyrus.chaintope.com',
  },
}

describe('config/network', () => {
  describe('isValidNetworkId', () => {
    it('should accept a TIP-0044 network id', () => {
      expect(isValidNetworkId(TESTNET)).toBe(true)
      expect(isValidNetworkId(MAINNET)).toBe(true)
    })

    it('should accept the dev network id', () => {
      expect(isValidNetworkId(1)).toBe(true)
    })

    it('should reject zero and negatives', () => {
      expect(isValidNetworkId(0)).toBe(false)
      expect(isValidNetworkId(-1)).toBe(false)
    })

    it('should reject a non-integer', () => {
      expect(isValidNetworkId(1.5)).toBe(false)
      expect(isValidNetworkId(NaN)).toBe(false)
    })

    it('should reject a value beyond 32 bits', () => {
      expect(isValidNetworkId(0x1_0000_0000)).toBe(false)
    })
  })

  describe('parseNetworkId', () => {
    it('should parse a decimal string', () => {
      expect(parseNetworkId(String(TESTNET))).toBe(TESTNET)
    })

    it('should reject a hexadecimal string that Number would accept', () => {
      expect(() => parseNetworkId('0x1')).toThrow(/Invalid Tapyrus network id/)
    })

    it('should reject exponent notation that Number would accept', () => {
      expect(() => parseNetworkId('1e9')).toThrow(/Invalid Tapyrus network id/)
    })

    it('should reject surrounding whitespace that Number would accept', () => {
      expect(() => parseNetworkId(' 12 ')).toThrow(/Invalid Tapyrus network id/)
    })

    it('should reject an empty string', () => {
      expect(() => parseNetworkId('')).toThrow(/Invalid Tapyrus network id/)
    })

    it('should reject a non-numeric string', () => {
      expect(() => parseNetworkId('mainnet')).toThrow(/Invalid Tapyrus network id/)
    })

    it('should reject zero', () => {
      expect(() => parseNetworkId('0')).toThrow(/out of range/)
    })

    it('should reject a value beyond 32 bits', () => {
      expect(() => parseNetworkId('4294967296')).toThrow(/out of range/)
    })
  })

  describe('configureNetwork', () => {
    it('should return the injected configuration', () => {
      configureNetwork(TESTNET_CONFIG)
      expect(getNetworkId()).toBe(TESTNET)
      expect(getExplorerApiUrl()).toBe(TESTNET_CONFIG.explorer.apiUrl)
      expect(getExplorerWebUrl()).toBe(TESTNET_CONFIG.explorer.webUrl)
    })

    it('should overwrite a previously injected configuration', () => {
      configureNetwork(TESTNET_CONFIG)
      configureNetwork(MAINNET_CONFIG)
      expect(getNetworkId()).toBe(MAINNET)
      expect(getExplorerApiUrl()).toBe(MAINNET_CONFIG.explorer.apiUrl)
      expect(getExplorerWebUrl()).toBe(MAINNET_CONFIG.explorer.webUrl)
    })

    it('should reject an invalid network id', () => {
      expect(() =>
        configureNetwork({ ...TESTNET_CONFIG, networkId: 0 }),
      ).toThrow(/Invalid Tapyrus network id/)
      expect(() =>
        configureNetwork({ ...TESTNET_CONFIG, networkId: 1.5 }),
      ).toThrow(/Invalid Tapyrus network id/)
    })

    // Every call site appends a path starting with "/", so a stored trailing
    // slash would produce "//address/...".
    it('should drop trailing slashes and surrounding whitespace from the urls', () => {
      configureNetwork({
        networkId: TESTNET,
        explorer: { apiUrl: '  https://example.com/api//  ', webUrl: 'https://example.com/' },
      })
      expect(getExplorerApiUrl()).toBe('https://example.com/api')
      expect(getExplorerWebUrl()).toBe('https://example.com')
    })

    it('should accept an uppercase scheme', () => {
      configureNetwork({
        networkId: TESTNET,
        explorer: { apiUrl: 'HTTPS://example.com/api', webUrl: 'HTTP://example.com' },
      })
      expect(getExplorerApiUrl()).toBe('HTTPS://example.com/api')
      expect(getExplorerWebUrl()).toBe('HTTP://example.com')
    })

    it('should reject a url without a scheme', () => {
      expect(() =>
        configureNetwork({
          networkId: TESTNET,
          explorer: { ...TESTNET_CONFIG.explorer, apiUrl: 'example.com/api' },
        }),
      ).toThrow(/Invalid explorer apiUrl/)
    })

    it('should reject a non-http scheme', () => {
      expect(() =>
        configureNetwork({
          networkId: TESTNET,
          explorer: { ...TESTNET_CONFIG.explorer, webUrl: 'ftp://example.com' },
        }),
      ).toThrow(/Invalid explorer webUrl/)
    })

    it('should reject an empty url', () => {
      expect(() =>
        configureNetwork({
          networkId: TESTNET,
          explorer: { ...TESTNET_CONFIG.explorer, apiUrl: '' },
        }),
      ).toThrow(/Invalid explorer apiUrl/)
    })

    // The package is consumed from JavaScript too, where the declared type
    // guarantees nothing.
    it('should reject a missing explorer section', () => {
      expect(() =>
        configureNetwork({ networkId: TESTNET } as never),
      ).toThrow(/Invalid explorer apiUrl/)
    })

    // A rejected call must not leave core pointing at half of a network.
    it('should leave the previous configuration untouched when one url is invalid', () => {
      configureNetwork(MAINNET_CONFIG)
      expect(() =>
        configureNetwork({
          networkId: TESTNET,
          explorer: { apiUrl: 'https://example.com/api', webUrl: 'nope' },
        }),
      ).toThrow()
      expect(getNetworkId()).toBe(MAINNET)
      expect(getExplorerApiUrl()).toBe(MAINNET_CONFIG.explorer.apiUrl)
      expect(getExplorerWebUrl()).toBe(MAINNET_CONFIG.explorer.webUrl)
    })

    // The configuration lives in module state, so the only way to observe the
    // unconfigured case after the tests above is a fresh copy of the module.
    it('should throw from every getter before the host configures it', () => {
      jest.resetModules()
      const fresh = require('~/core/config/network') as typeof import('~/core/config/network')
      expect(() => fresh.getNetworkId()).toThrow(/not configured/)
      expect(() => fresh.getExplorerApiUrl()).toThrow(/not configured/)
      expect(() => fresh.getExplorerWebUrl()).toThrow(/not configured/)
    })
  })
})
