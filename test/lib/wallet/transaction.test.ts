import { createAndSignTransaction, createAndSignAssetTransaction, burnAsset } from '~/core/wallet/transaction'
import * as tapyrus from 'tapyrusjs-lib'
import * as esplora from '~/core/api/esplora'
import * as hdwallet from '~/core/wallet/hdwallet'
import { TEST_MNEMONIC, TEST_ADDRESS, TEST_RECIPIENT, mockKeyPairWithNetwork } from '../../helpers/mockWallet'

// Mock the modules
jest.mock('~/core/api/esplora')
jest.mock('~/core/wallet/hdwallet')

const mockedEsplora = esplora as jest.Mocked<typeof esplora>
const mockedHdwallet = hdwallet as jest.Mocked<typeof hdwallet>

describe('transaction', () => {
  const testMnemonic = TEST_MNEMONIC
  const testAddress = TEST_ADDRESS
  const testRecipient = TEST_RECIPIENT
  const testColorId = 'c1ec2fd806701a3f55808cbec3922c38dafaa3070c48c803e9043ee3642c660b46'

  // Mock TPC UTXOs
  const mockTpcUtxos: esplora.Utxo[] = [
    {
      txid: 'a'.repeat(64),
      vout: 0,
      status: { confirmed: true },
      value: 100000000, // 1 TPC
      colorId: esplora.TPC_COLOR_ID,
    },
  ]

  // Mock colored UTXOs
  const mockColoredUtxos: esplora.Utxo[] = [
    {
      txid: 'b'.repeat(64),
      vout: 0,
      status: { confirmed: true },
      value: 1000,
      colorId: testColorId,
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    mockedHdwallet.getKeyPairFromMnemonic.mockResolvedValue(mockKeyPairWithNetwork)
    mockedEsplora.broadcastTransaction.mockResolvedValue('c'.repeat(64))
  })

  describe('createAndSignTransaction', () => {
    beforeEach(() => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('should create and sign a TPC transaction', async () => {
      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000, // 0.1 TPC
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(typeof result.txHex).toBe('string')
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should throw error if amount is below dust threshold', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 100, // Below dust threshold
        mnemonic: testMnemonic,
      })).rejects.toThrow('Amount must be at least 546 tapyrus')
    })

    it('should throw error if amount is not a valid integer', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1.5, // non-integer
        mnemonic: testMnemonic,
      })).rejects.toThrow('Invalid amount')
    })

    it('should throw error if recipient address is invalid', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: 'not-a-valid-address',
        amount: 10000000,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Invalid recipient address')
    })

    it('should throw error if no TPC UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([])

      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No TPC UTXOs available')
    })

    it('should throw error if insufficient funds', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 200000000, // 2 TPC, more than available
        mnemonic: testMnemonic,
      })).rejects.toThrow('Insufficient funds')
    })
  })

  describe('createAndSignAssetTransaction', () => {
    beforeEach(() => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([...mockTpcUtxos, ...mockColoredUtxos])
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('should create and sign an asset transfer transaction', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should throw error if amount is zero or negative', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 0,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if recipient address is invalid', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: 'not-a-valid-address',
        amount: 100,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Invalid recipient address')
    })

    it('should throw error if no asset UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos) // Only TPC, no colored

      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No asset UTXOs available')
    })

    it('should throw error if no TPC UTXOs for fee', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockColoredUtxos) // Only colored, no TPC

      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No TPC UTXOs available for fee')
    })

    it('should throw error if insufficient asset balance', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 2000, // More than available (1000)
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Insufficient asset balance')
    })

    it('should include recipient colored output in transaction', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs (cp2pkh script: 0x21 + colorId(33) + 0xbc + p2pkh)
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 && // Push 33 bytes
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have at least 1 colored output (recipient)
      expect(coloredOutputs.length).toBeGreaterThanOrEqual(1)

      // Recipient output should have the transfer amount
      const recipientOutput = coloredOutputs.find(out => out.value === 500)
      expect(recipientOutput).toBeDefined()
    })

    it('should include asset change output when amount is less than total', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 300, // Less than 1000, so 700 change
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have 2 colored outputs (recipient + change)
      expect(coloredOutputs.length).toBe(2)

      // Should have recipient (300) and change (700)
      const values = coloredOutputs.map(out => out.value).sort((a, b) => a - b)
      expect(values).toEqual([300, 700])
    })
  })

  describe('burnAsset', () => {
    beforeEach(() => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([...mockTpcUtxos, ...mockColoredUtxos])
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('should create and sign a burn transaction', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should burn all tokens when amount equals balance', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // Burn all
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      expect(result.txid).toBe('c'.repeat(64))
    })

    it('should throw error if amount is zero or negative', async () => {
      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 0,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if no asset UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)

      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No asset UTXOs available')
    })

    it('should throw error if no TPC UTXOs for fee', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockColoredUtxos)

      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('No TPC UTXOs available for fee')
    })

    it('should throw error if insufficient asset balance', async () => {
      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 2000,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })).rejects.toThrow('Insufficient asset balance')
    })

    it('should NOT include burned amount in outputs', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 500, // Burn 500, change 500
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs (cp2pkh script: 0x21 + colorId(33) + 0xbc + p2pkh)
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have only 1 colored output (change), not 2 (no recipient)
      expect(coloredOutputs.length).toBe(1)

      // Change output should be 500 (1000 - 500 burned)
      expect(coloredOutputs[0].value).toBe(500)
    })

    it('should have no colored outputs when burning all tokens', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // Burn all
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      // Find colored outputs
      const coloredOutputs = tx.outs.filter(out => {
        return out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
      })

      // Should have no colored outputs (all burned)
      expect(coloredOutputs.length).toBe(0)

      // Should still have TPC change output
      expect(tx.outs.length).toBeGreaterThanOrEqual(1)
    })

    it('should have different output count than transfer for same amount', async () => {
      // Transfer 500 (with 500 change)
      const transferResult = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      // Burn 500 (with 500 change)
      const burnResult = await burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
      })

      const transferTx = tapyrus.Transaction.fromHex(transferResult.txHex)
      const burnTx = tapyrus.Transaction.fromHex(burnResult.txHex)
      const colorIdBuffer = Buffer.from(testColorId, 'hex')

      const countColoredOutputs = (tx: tapyrus.Transaction) =>
        tx.outs.filter(out =>
          out.script.length > 34 &&
          out.script[0] === 0x21 &&
          out.script.subarray(1, 34).equals(colorIdBuffer)
        ).length

      // Transfer has 2 colored outputs (recipient + change)
      expect(countColoredOutputs(transferTx)).toBe(2)

      // Burn has 1 colored output (change only)
      expect(countColoredOutputs(burnTx)).toBe(1)
    })
  })
})
