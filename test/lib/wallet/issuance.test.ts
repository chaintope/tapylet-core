import { issueToken, type TokenType, type MetadataFields } from '~/core/wallet/issuance'
import * as esplora from '~/core/api/esplora'
import * as hdwallet from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC, TEST_ADDRESS, mockPublicKey, mockKeyPairWithNetwork } from '../../helpers/mockWallet'

// Mock the modules
jest.mock('~/core/api/esplora')
jest.mock('~/core/wallet/hdwallet')

const mockedEsplora = esplora as jest.Mocked<typeof esplora>
const mockedHdwallet = hdwallet as jest.Mocked<typeof hdwallet>

describe('issuance', () => {
  const testMnemonic = TEST_MNEMONIC
  const testAddress = TEST_ADDRESS

  // Mock TPC UTXOs with sufficient balance
  const mockTpcUtxos: esplora.Utxo[] = [
    {
      txid: 'a'.repeat(64),
      vout: 0,
      status: { confirmed: true },
      value: 100000000, // 1 TPC
      colorId: esplora.TPC_COLOR_ID,
    },
  ]

  const baseMetadata: MetadataFields = {
    version: '1.0',
    name: 'Test Token',
    symbol: 'TEST',
    tokenType: 'reissuable',
    decimals: 8,
    description: 'A test token',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedHdwallet.getKeyPairFromMnemonic.mockResolvedValue(mockKeyPairWithNetwork)
    mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)
    mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
      return !colorId || colorId === esplora.TPC_COLOR_ID
    })
    // Return unique txid for each broadcast
    let txCount = 0
    mockedEsplora.broadcastTransaction.mockImplementation(async () => {
      txCount++
      return txCount.toString(16).padStart(64, '0')
    })
  })

  describe('issueToken - reissuable (c1)', () => {
    it('should issue a reissuable token', async () => {
      const result = await issueToken({
        tokenType: 'reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      expect(result.txid).toBeDefined()
      expect(result.colorId).toBeDefined()
      expect(result.colorId).toMatch(/^c1/) // Reissuable colorId starts with c1
      expect(result.paymentBase).toBeDefined()
      expect(result.outPoint).toBeUndefined() // No outPoint for c1
      // 2 broadcasts for c1 (P2C tx + issue tx)
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(2)
    })

    it('should create two transactions for reissuable token: P2C funding tx and issue tx', async () => {
      const broadcastCalls: string[] = []
      mockedEsplora.broadcastTransaction.mockImplementation(async (txHex) => {
        broadcastCalls.push(txHex)
        return (broadcastCalls.length).toString(16).padStart(64, '0')
      })

      const result = await issueToken({
        tokenType: 'reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // Verify two transactions were broadcast (P2C funding + issue)
      expect(broadcastCalls).toHaveLength(2)

      // Verify no outPoint for c1 (colorId derived from P2C public key, not OutPoint)
      expect(result.outPoint).toBeUndefined()

      // Verify second transaction uses first transaction's output as input
      const firstTxId = '0000000000000000000000000000000000000000000000000000000000000001'
      const secondTxHex = broadcastCalls[1]
      const reversedFirstTxId = firstTxId.match(/.{2}/g)!.reverse().join('')
      expect(secondTxHex).toContain(reversedFirstTxId)
    })

    it('should generate consistent colorId for same metadata and key', async () => {
      const result1 = await issueToken({
        tokenType: 'reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      const result2 = await issueToken({
        tokenType: 'reissuable',
        amount: 500000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // Same metadata + same key = same colorId (for reissuable)
      expect(result1.colorId).toBe(result2.colorId)
    })
  })

  describe('issueToken - non_reissuable (c2)', () => {
    it('should issue a non-reissuable token', async () => {
      const result = await issueToken({
        tokenType: 'non_reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'non_reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      expect(result.txid).toBeDefined()
      expect(result.colorId).toBeDefined()
      expect(result.colorId).toMatch(/^c2/) // Non-reissuable colorId starts with c2
      expect(result.paymentBase).toBeDefined()
      expect(result.outPoint).toBeDefined() // Has outPoint for c2
      expect(result.outPoint).toMatch(/^[0-9a-f]{64}:0$/) // Format: txid:0
      // 2 broadcasts for c2 (P2C tx + issue tx)
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(2)
    })

    it('should create two transactions: P2C funding tx and issue tx', async () => {
      const broadcastCalls: string[] = []
      mockedEsplora.broadcastTransaction.mockImplementation(async (txHex) => {
        broadcastCalls.push(txHex)
        return (broadcastCalls.length).toString(16).padStart(64, '0')
      })

      const result = await issueToken({
        tokenType: 'non_reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'non_reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // Verify two transactions were broadcast
      expect(broadcastCalls).toHaveLength(2)

      // Verify outPoint references the first transaction's txid
      const firstTxId = '0000000000000000000000000000000000000000000000000000000000000001'
      expect(result.outPoint).toBe(`${firstTxId}:0`)

      // Verify second transaction uses first transaction's output as input
      const secondTxHex = broadcastCalls[1]
      // The second tx should reference the first tx's txid (reversed for little-endian)
      const reversedFirstTxId = firstTxId.match(/.{2}/g)!.reverse().join('')
      expect(secondTxHex).toContain(reversedFirstTxId)
    })

    it('should generate different colorId for each issuance', async () => {
      const result1 = await issueToken({
        tokenType: 'non_reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'non_reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      const result2 = await issueToken({
        tokenType: 'non_reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'non_reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // Different OutPoint = different colorId
      expect(result1.colorId).not.toBe(result2.colorId)
    })
  })

  describe('issueToken - nft (c3)', () => {
    const nftMetadata: MetadataFields = {
      ...baseMetadata,
      tokenType: 'nft',
      decimals: 0,
      image: 'https://example.com/nft.png',
    }

    it('should issue an NFT', async () => {
      const result = await issueToken({
        tokenType: 'nft',
        amount: 1,
        metadata: nftMetadata,
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      expect(result.txid).toBeDefined()
      expect(result.colorId).toBeDefined()
      expect(result.colorId).toMatch(/^c3/) // NFT colorId starts with c3
      expect(result.paymentBase).toBeDefined()
      expect(result.outPoint).toBeDefined() // Has outPoint for c3
      // 2 broadcasts for c3 (P2C tx + issue tx)
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(2)
    })

    it('should create two transactions for NFT: P2C funding tx and issue tx', async () => {
      const broadcastCalls: string[] = []
      mockedEsplora.broadcastTransaction.mockImplementation(async (txHex) => {
        broadcastCalls.push(txHex)
        return (broadcastCalls.length).toString(16).padStart(64, '0')
      })

      const result = await issueToken({
        tokenType: 'nft',
        amount: 1,
        metadata: nftMetadata,
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // Verify two transactions were broadcast
      expect(broadcastCalls).toHaveLength(2)

      // Verify outPoint references the first transaction's txid
      const firstTxId = '0000000000000000000000000000000000000000000000000000000000000001'
      expect(result.outPoint).toBe(`${firstTxId}:0`)

      // Verify second transaction uses first transaction's output as input
      const secondTxHex = broadcastCalls[1]
      const reversedFirstTxId = firstTxId.match(/.{2}/g)!.reverse().join('')
      expect(secondTxHex).toContain(reversedFirstTxId)
    })

    it('should generate different colorId for each NFT', async () => {
      const result1 = await issueToken({
        tokenType: 'nft',
        amount: 1,
        metadata: nftMetadata,
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      const result2 = await issueToken({
        tokenType: 'nft',
        amount: 1,
        metadata: nftMetadata,
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // Each NFT has unique colorId
      expect(result1.colorId).not.toBe(result2.colorId)
    })
  })

  describe('issueToken - validation', () => {
    it('should throw error if amount is zero or negative', async () => {
      await expect(issueToken({
        tokenType: 'reissuable',
        amount: 0,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })).rejects.toThrow('Amount must be greater than 0')

      await expect(issueToken({
        tokenType: 'reissuable',
        amount: -100,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if no TPC UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([])

      await expect(issueToken({
        tokenType: 'reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })).rejects.toThrow('No TPC UTXOs available')
    })

    it('should throw error if insufficient TPC for fees', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([
        {
          txid: 'a'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 100, // Very small amount
          colorId: esplora.TPC_COLOR_ID,
        },
      ])

      await expect(issueToken({
        tokenType: 'reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })).rejects.toThrow('Insufficient TPC balance for issuance')
    })
  })

  describe('issueToken - paymentBase', () => {
    it('should return original public key as paymentBase', async () => {
      const result = await issueToken({
        tokenType: 'reissuable',
        amount: 1000000,
        metadata: { ...baseMetadata, tokenType: 'reissuable' },
        mnemonic: testMnemonic,
        fromAddress: testAddress,
      })

      // paymentBase should be the original public key hex
      expect(result.paymentBase).toBe(mockPublicKey.toString('hex'))
    })
  })
})
