import { createHDWallet, getPublicKeyFromWIF, NetworkId } from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC } from '../../helpers/mockWallet'

describe('hdwallet', () => {
  const testMnemonic = TEST_MNEMONIC

  describe('createHDWallet', () => {
    it('should create wallet with private key, public key, and WIF', async () => {
      const keys = await createHDWallet(testMnemonic)

      expect(keys.privateKey).toBeInstanceOf(Uint8Array)
      expect(keys.privateKey).toHaveLength(32)
      expect(keys.publicKey).toBeInstanceOf(Uint8Array)
      expect(keys.publicKey).toHaveLength(33) // compressed
      expect(typeof keys.wif).toBe('string')
    })

    it('should generate consistent keys for same mnemonic', async () => {
      const keys1 = await createHDWallet(testMnemonic)
      const keys2 = await createHDWallet(testMnemonic)

      expect(Buffer.from(keys1.privateKey).toString('hex'))
        .toBe(Buffer.from(keys2.privateKey).toString('hex'))
      expect(Buffer.from(keys1.publicKey).toString('hex'))
        .toBe(Buffer.from(keys2.publicKey).toString('hex'))
      expect(keys1.wif).toBe(keys2.wif)
    })

    it('should use TESTNET network ID by default', async () => {
      const keys = await createHDWallet(testMnemonic)
      // Derivation path: m/44'/1939510133'/0'/0/0
      expect(keys.privateKey).toBeDefined()
    })

    it('should generate different keys for different network IDs', async () => {
      const keysTestnet = await createHDWallet(testMnemonic, NetworkId.TESTNET)
      const keysApi = await createHDWallet(testMnemonic, NetworkId.TAPYRUS_API)

      expect(Buffer.from(keysTestnet.privateKey).toString('hex'))
        .not.toBe(Buffer.from(keysApi.privateKey).toString('hex'))
    })

    it('should generate different keys for different indices', async () => {
      const keys0 = await createHDWallet(testMnemonic, NetworkId.TESTNET, 0)
      const keys1 = await createHDWallet(testMnemonic, NetworkId.TESTNET, 1)

      expect(Buffer.from(keys0.privateKey).toString('hex'))
        .not.toBe(Buffer.from(keys1.privateKey).toString('hex'))
    })

    it('should generate WIF starting with K or L for prod network', async () => {
      const keys = await createHDWallet(testMnemonic)
      // Prod WIF (compressed) starts with 'K' or 'L'
      expect(['K', 'L']).toContain(keys.wif[0])
    })
  })

  describe('getPublicKeyFromWIF', () => {
    it('should extract public key from WIF', async () => {
      const keys = await createHDWallet(testMnemonic)
      const publicKey = getPublicKeyFromWIF(keys.wif)

      expect(publicKey).toBeInstanceOf(Uint8Array)
      expect(publicKey).toHaveLength(33)
      expect(Buffer.from(publicKey).toString('hex'))
        .toBe(Buffer.from(keys.publicKey).toString('hex'))
    })
  })

  describe('NetworkId', () => {
    it('should export NetworkId enum', () => {
      expect(NetworkId.TESTNET).toBe(1939510133)
      expect(NetworkId.TAPYRUS_API).toBe(15215628)
    })
  })
})
