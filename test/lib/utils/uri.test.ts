import * as tapyrus from 'tapyrusjs-lib'
import {
  buildAddressUri,
  getColorIdFromAddress,
  isTapyrusUri,
  parseAddressFromQR,
  parseTapyrusUri,
  parseTapyrusUriResult,
} from '~/core/utils/uri'

// TIP-0044 network ids
const TESTNET = 1939510133
const MAINNET = 15215628

// Standard and Colored Coin addresses over the same key hash. Built rather
// than hardcoded so the fixtures can't drift out of being valid — decoding a
// Color ID out of the address is part of what's under test.
const HASH = Buffer.from('11'.repeat(20), 'hex')
const COLOR_ID = 'c1' + '22'.repeat(32)
const P2PKH = tapyrus.payments.p2pkh({
  hash: HASH,
  network: tapyrus.networks.prod,
}).address!
const CP2PKH = tapyrus.payments.cp2pkh({
  hash: HASH,
  colorId: Buffer.from(COLOR_ID, 'hex'),
  network: tapyrus.networks.prod,
}).address!
const P2SH = tapyrus.payments.p2sh({
  hash: HASH,
  network: tapyrus.networks.prod,
}).address!
const CP2SH = tapyrus.payments.cp2sh({
  hash: HASH,
  colorId: Buffer.from(COLOR_ID, 'hex'),
  network: tapyrus.networks.prod,
}).address!

// Addresses that decode as base58check but are not valid Tapyrus `prod`
// addresses: the dev network's version bytes, and a Color ID payload wearing
// an uncolored version byte.
const DEV_P2PKH = tapyrus.payments.p2pkh({
  hash: HASH,
  network: tapyrus.networks.dev,
}).address!
const DEV_CP2PKH = tapyrus.payments.cp2pkh({
  hash: HASH,
  colorId: Buffer.from(COLOR_ID, 'hex'),
  network: tapyrus.networks.dev,
}).address!
const MISMATCHED_VERSION = tapyrus.address.toBase58Check(
  HASH,
  tapyrus.networks.prod.pubKeyHash,
  Buffer.from(COLOR_ID, 'hex'),
)

describe('uri', () => {
  describe('buildAddressUri', () => {
    it('should build a TIP-0021 URI with the network id in the path', () => {
      expect(buildAddressUri(P2PKH, TESTNET)).toBe(`tapyrus:${TESTNET}/${P2PKH}`)
    })

    it('should use the network id it is given', () => {
      expect(buildAddressUri(P2PKH, MAINNET)).toBe(`tapyrus:${MAINNET}/${P2PKH}`)
    })

    it('should round-trip through parseTapyrusUri', () => {
      const parsed = parseTapyrusUri(buildAddressUri(P2PKH, TESTNET), TESTNET)
      expect(parsed?.address).toBe(P2PKH)
    })

    it('should round-trip a Colored Coin address through parseTapyrusUri', () => {
      const parsed = parseTapyrusUri(buildAddressUri(CP2PKH, TESTNET), TESTNET)
      expect(parsed?.address).toBe(CP2PKH)
      expect(parsed?.colorId).toBe(COLOR_ID)
    })
  })

  describe('isTapyrusUri', () => {
    it('should accept a URI with a network id', () => {
      expect(isTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}`)).toBe(true)
    })

    it('should accept the scheme case-insensitively', () => {
      expect(isTapyrusUri(`TAPYRUS:${TESTNET}/${P2PKH}`)).toBe(true)
    })

    it('should reject a bare address', () => {
      expect(isTapyrusUri(P2PKH)).toBe(false)
    })

    it('should reject a legacy URI without a network id', () => {
      expect(isTapyrusUri(`tapyrus:${P2PKH}`)).toBe(false)
    })

    it('should reject another scheme', () => {
      expect(isTapyrusUri(`bitcoin:${P2PKH}`)).toBe(false)
    })
  })

  describe('getColorIdFromAddress', () => {
    it('should return the Color ID for a CP2PKH address', () => {
      expect(getColorIdFromAddress(CP2PKH)).toBe(COLOR_ID)
    })

    it('should return the Color ID for a CP2SH address', () => {
      expect(getColorIdFromAddress(CP2SH)).toBe(COLOR_ID)
    })

    it('should return undefined for a standard address', () => {
      expect(getColorIdFromAddress(P2PKH)).toBeUndefined()
    })

    it('should return undefined for a P2SH address', () => {
      expect(getColorIdFromAddress(P2SH)).toBeUndefined()
    })

    it('should return undefined for a non-address', () => {
      expect(getColorIdFromAddress('not-an-address')).toBeUndefined()
    })

    it('should return undefined for a dev-network Colored Coin address', () => {
      expect(getColorIdFromAddress(DEV_CP2PKH)).toBeUndefined()
    })

    it('should return undefined when a Color ID payload carries an uncolored version byte', () => {
      expect(getColorIdFromAddress(MISMATCHED_VERSION)).toBeUndefined()
    })
  })

  describe('parseTapyrusUri', () => {
    it('should parse address only', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}`, TESTNET)).toEqual({
        address: P2PKH,
        amount: undefined,
        coin: undefined,
        label: undefined,
        message: undefined,
        colorId: undefined,
      })
    })

    it('should parse amount, label and message for a standard address', () => {
      const parsed = parseTapyrusUri(
        `tapyrus:${TESTNET}/${P2PKH}?amount=10.5&label=Chaintope&message=Donation%20for%20project`,
        TESTNET,
      )
      expect(parsed).toEqual({
        address: P2PKH,
        amount: '10.5',
        coin: undefined,
        label: 'Chaintope',
        message: 'Donation for project',
        colorId: undefined,
      })
    })

    it('should parse amount for a P2SH address', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2SH}?amount=1`, TESTNET)).toEqual({
        address: P2SH,
        amount: '1',
        coin: undefined,
        label: undefined,
        message: undefined,
        colorId: undefined,
      })
    })

    it('should parse coin and colorId for a Colored Coin address', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${CP2PKH}?coin=200`, TESTNET)
      expect(parsed?.coin).toBe('200')
      expect(parsed?.colorId).toBe(COLOR_ID)
    })

    it('should parse coin and colorId for a CP2SH address', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${CP2SH}?coin=200`, TESTNET)
      expect(parsed?.address).toBe(CP2SH)
      expect(parsed?.colorId).toBe(COLOR_ID)
    })

    it('should ignore unknown params without the req- prefix', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?somethingyoudontunderstand=50`, TESTNET)
      expect(parsed?.address).toBe(P2PKH)
    })

    it('should reject a req- prefixed param', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?req-future=1`, TESTNET)).toBeNull()
    })

    it('should ignore a REQ- prefixed param because param keys are case-sensitive', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?REQ-future=1`, TESTNET)?.address).toBe(P2PKH)
    })

    it('should reject another network id', () => {
      expect(parseTapyrusUri(`tapyrus:${MAINNET}/${P2PKH}`, TESTNET)).toBeNull()
    })

    it('should reject a URI without a network id', () => {
      expect(parseTapyrusUri(`tapyrus:${P2PKH}`, TESTNET)).toBeNull()
    })

    it('should reject a bare address', () => {
      expect(parseTapyrusUri(P2PKH, TESTNET)).toBeNull()
    })

    it('should reject an address that does not decode', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/not-an-address`, TESTNET)).toBeNull()
    })

    it('should reject an undecodable address carrying an amount', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/not-an-address?amount=1`, TESTNET)).toBeNull()
    })

    it('should reject an address whose version byte is not a Tapyrus one', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${DEV_P2PKH}`, TESTNET)).toBeNull()
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${DEV_CP2PKH}`, TESTNET)).toBeNull()
    })

    it('should reject an address whose version byte disagrees with its payload', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${MISMATCHED_VERSION}`, TESTNET)).toBeNull()
    })

    it('should reject an address containing whitespace', () => {
      expect(
        parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH.slice(0, 5)} ${P2PKH.slice(5)}`, TESTNET),
      ).toBeNull()
    })

    it('should reject coin with a standard address', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?coin=200`, TESTNET)).toBeNull()
    })

    it('should reject amount with a Colored Coin address', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${CP2PKH}?amount=10.5`, TESTNET)).toBeNull()
    })

    it('should reject amount using a comma as decimal separator', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?amount=10,5`, TESTNET)).toBeNull()
    })

    it('should reject a non-integer coin', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${CP2PKH}?coin=1.5`, TESTNET)).toBeNull()
    })

    it('should reject a zero coin', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${CP2PKH}?coin=0`, TESTNET)).toBeNull()
    })

    // Deliberately asymmetric with coin: the ABNF for amount is
    // `"amount=" *digit [ "." *digit ]` with no lower bound, while coin's spec
    // text requires a positive integer. Rejecting a zero amount would be this
    // parser inventing a rule the TIP does not state.
    it('should accept a zero amount', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?amount=0`, TESTNET)?.amount).toBe('0')
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?amount=0.0`, TESTNET)?.amount).toBe(
        '0.0',
      )
    })

    it('should reject malformed percent-encoding in the query', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?label=%zz`, TESTNET)).toBeNull()
    })

    it('should accept the scheme in uppercase', () => {
      expect(parseTapyrusUri(`TAPYRUS:${TESTNET}/${P2PKH}`, TESTNET)?.address).toBe(P2PKH)
    })

    it('should trim surrounding whitespace', () => {
      expect(parseTapyrusUri(`  tapyrus:${TESTNET}/${P2PKH}  `, TESTNET)?.address).toBe(P2PKH)
    })

    it('should keep a literal plus in a label instead of decoding it as a space', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?label=a+b`, TESTNET)
      expect(parsed?.label).toBe('a+b')
    })

    it('should decode a percent-encoded space in a label', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?label=a%20b`, TESTNET)
      expect(parsed?.label).toBe('a b')
    })

    it('should take the first of a repeated param', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?amount=1&amount=99`, TESTNET)
      expect(parsed?.amount).toBe('1')
    })

    it('should strip a fragment from the address', () => {
      expect(parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}#frag`, TESTNET)?.address).toBe(P2PKH)
    })

    it('should strip a fragment following the query', () => {
      const parsed = parseTapyrusUri(`tapyrus:${TESTNET}/${P2PKH}?amount=1#frag`, TESTNET)
      expect(parsed?.amount).toBe('1')
    })
  })

  describe('parseTapyrusUriResult', () => {
    it('should report the payment when the URI is valid', () => {
      const result = parseTapyrusUriResult(`tapyrus:${TESTNET}/${P2PKH}?amount=1`, TESTNET)
      expect(result).toEqual({
        ok: true,
        payment: {
          address: P2PKH,
          amount: '1',
          coin: undefined,
          label: undefined,
          message: undefined,
          colorId: undefined,
        },
      })
    })

    it('should report a network mismatch', () => {
      expect(parseTapyrusUriResult(`tapyrus:${MAINNET}/${P2PKH}`, TESTNET)).toEqual({
        ok: false,
        reason: 'network-mismatch',
      })
    })

    it('should report a non-Tapyrus URI', () => {
      expect(parseTapyrusUriResult(`bitcoin:${P2PKH}`, TESTNET)).toEqual({
        ok: false,
        reason: 'not-a-tapyrus-uri',
      })
    })

    it('should report an invalid address', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/not-an-address`, TESTNET)).toEqual({
        ok: false,
        reason: 'invalid-address',
      })
    })

    it('should report malformed percent-encoding', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/${P2PKH}?label=%zz`, TESTNET)).toEqual({
        ok: false,
        reason: 'malformed-query',
      })
    })

    it('should report an unsupported req- param', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/${P2PKH}?req-future=1`, TESTNET)).toEqual({
        ok: false,
        reason: 'unsupported-required-param',
      })
    })

    it('should report amount used with a Colored Coin address', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/${CP2PKH}?amount=1`, TESTNET)).toEqual({
        ok: false,
        reason: 'amount-with-colored-address',
      })
    })

    it('should report coin used with a standard address', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/${P2PKH}?coin=1`, TESTNET)).toEqual({
        ok: false,
        reason: 'coin-with-standard-address',
      })
    })

    it('should report an invalid amount', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/${P2PKH}?amount=10,5`, TESTNET)).toEqual({
        ok: false,
        reason: 'invalid-amount',
      })
    })

    it('should report an invalid coin', () => {
      expect(parseTapyrusUriResult(`tapyrus:${TESTNET}/${CP2PKH}?coin=0`, TESTNET)).toEqual({
        ok: false,
        reason: 'invalid-coin',
      })
    })
  })

  describe('parseAddressFromQR', () => {
    it('should unwrap the address from a URI', () => {
      expect(parseAddressFromQR(`tapyrus:${TESTNET}/${P2PKH}?amount=1`, TESTNET)).toEqual({
        ok: true,
        address: P2PKH,
      })
    })

    it('should pass a bare address through unchanged', () => {
      expect(parseAddressFromQR(P2PKH, TESTNET)).toEqual({ ok: true, address: P2PKH })
    })

    it('should pass another scheme through unchanged so it fails address validation', () => {
      expect(parseAddressFromQR(`bitcoin:${P2PKH}`, TESTNET)).toEqual({
        ok: true,
        address: `bitcoin:${P2PKH}`,
      })
    })

    it('should report a network mismatch instead of blaming the address', () => {
      expect(parseAddressFromQR(`tapyrus:${MAINNET}/${P2PKH}`, TESTNET)).toEqual({
        ok: false,
        reason: 'network-mismatch',
      })
    })

    it('should report an unsupported req- param', () => {
      expect(parseAddressFromQR(`tapyrus:${TESTNET}/${P2PKH}?req-future=1`, TESTNET)).toEqual({
        ok: false,
        reason: 'unsupported-required-param',
      })
    })

    it('should report an invalid address inside a URI', () => {
      expect(parseAddressFromQR(`tapyrus:${TESTNET}/not-an-address`, TESTNET)).toEqual({
        ok: false,
        reason: 'invalid-address',
      })
    })
  })
})
