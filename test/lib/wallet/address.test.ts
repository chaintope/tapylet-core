import { generateAddress, validateAddress, shortenAddress } from '~/core/wallet/address'
import { createHDWallet } from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC } from '../../helpers/mockWallet'

describe('address', () => {
  const testMnemonic = TEST_MNEMONIC

  describe('generateAddress', () => {
    it('should generate a valid Tapyrus address from public key', async () => {
      const keys = await createHDWallet(testMnemonic)
      const address = generateAddress(keys.publicKey)

      expect(typeof address).toBe('string')
      expect(address.length).toBeGreaterThan(25)
    })

    it('should generate consistent address for same public key', async () => {
      const keys = await createHDWallet(testMnemonic)
      const address1 = generateAddress(keys.publicKey)
      const address2 = generateAddress(keys.publicKey)

      expect(address1).toBe(address2)
    })

    it('should generate address starting with 1 for prod network', async () => {
      const keys = await createHDWallet(testMnemonic)
      const address = generateAddress(keys.publicKey)

      // Prod P2PKH addresses start with '1'
      expect(address[0]).toBe('1')
    })

    it('should throw error for invalid public key', () => {
      const invalidPublicKey = new Uint8Array(32) // wrong length
      expect(() => generateAddress(invalidPublicKey)).toThrow()
    })
  })

  describe('validateAddress', () => {
    it('should return true for valid testnet address', async () => {
      const keys = await createHDWallet(testMnemonic)
      const address = generateAddress(keys.publicKey)

      expect(validateAddress(address)).toBe(true)
    })

    it('should return false for invalid address', () => {
      expect(validateAddress('invalid_address')).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(validateAddress('')).toBe(false)
    })

    it('should return false for address with invalid checksum', () => {
      // Invalid address (random string)
      expect(validateAddress('1InvalidAddressXXXXXXXXXXXXXXXXXX')).toBe(false)
    })
  })

  describe('shortenAddress', () => {
    it('should shorten address with default chars', () => {
      const address = 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhex'
      const shortened = shortenAddress(address)

      expect(shortened).toBe('mzBc4X...ztRhex')
      expect(shortened.length).toBeLessThan(address.length)
    })

    it('should shorten address with custom chars', () => {
      const address = 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhex'
      const shortened = shortenAddress(address, 4)

      expect(shortened).toBe('mzBc...Rhex')
    })

    it('should return original if address is shorter than double chars', () => {
      const shortAddress = 'abc'
      expect(shortenAddress(shortAddress, 6)).toBe(shortAddress)
    })
  })
})
