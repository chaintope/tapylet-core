import {
  getNetworkId,
  isValidNetworkId,
  parseNetworkId,
  setNetworkId,
} from '~/core/config/network'

// TIP-0044 network ids
const TESTNET = 1939510133
const MAINNET = 15215628

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

  describe('setNetworkId / getNetworkId', () => {
    it('should return the injected network id', () => {
      setNetworkId(TESTNET)
      expect(getNetworkId()).toBe(TESTNET)
    })

    it('should overwrite a previously injected network id', () => {
      setNetworkId(TESTNET)
      setNetworkId(MAINNET)
      expect(getNetworkId()).toBe(MAINNET)
    })

    it('should reject an invalid network id', () => {
      expect(() => setNetworkId(0)).toThrow(/Invalid Tapyrus network id/)
      expect(() => setNetworkId(1.5)).toThrow(/Invalid Tapyrus network id/)
    })

    // The injected id lives in module state, so the only way to observe the
    // unconfigured case after the tests above is a fresh copy of the module.
    it('should throw when read before the host configures it', () => {
      jest.resetModules()
      const fresh = require('~/core/config/network') as typeof import('~/core/config/network')
      expect(() => fresh.getNetworkId()).toThrow(/not configured/)
    })
  })
})
