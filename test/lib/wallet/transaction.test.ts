import { createAndSignTransaction, createAndSignAssetTransaction, burnAsset, estimateFee, MAX_SPLIT } from '~/core/wallet/transaction'
import { estimateTxSize, DEFAULT_FEE_RATE, DUST_THRESHOLD, P2PKH_INPUT_SIZE } from '~/core/constants/transaction'
import { MAX_FEE_RATE, MAX_COLORED_AMOUNT } from '~/core/utils/validation'
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
  // The recipient's pubkey hash carrying testColorId, i.e. a cp2pkh address
  const coloredRecipient = tapyrus.address.toBase58Check(
    tapyrus.address.fromBase58Check(TEST_RECIPIENT).hash,
    tapyrus.networks.prod.coloredPubKeyHash,
    Buffer.from(testColorId, 'hex')
  )

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
    mockedHdwallet.getKeyPairFromLegacyMainnetWallet.mockResolvedValue(mockKeyPairWithNetwork)
    mockedEsplora.broadcastTransaction.mockResolvedValue('c'.repeat(64))
  })

  // TPC input total minus p2pkh output total. Colored outputs carry token
  // amounts, not TPC, so they are excluded on both sides.
  const paidTpcFee = (txHex: string, utxos: esplora.Utxo[]): number => {
    const tx = tapyrus.Transaction.fromHex(txHex)
    const byOutpoint = new Map(utxos.map(u => [`${u.txid}:${u.vout}`, u]))
    let inputTpc = 0
    for (const input of tx.ins) {
      const txid = Buffer.from(input.hash).reverse().toString('hex')
      const utxo = byOutpoint.get(`${txid}:${input.index}`)
      if (utxo && (!utxo.colorId || utxo.colorId === esplora.TPC_COLOR_ID)) {
        inputTpc += utxo.value
      }
    }
    const outputTpc = tx.outs
      .filter(out => out.script.length === 25)
      .reduce((sum, out) => sum + out.value, 0)
    return inputTpc - outputTpc
  }

  const txByteSize = (txHex: string): number => txHex.length / 2

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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(typeof result.txHex).toBe('string')
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
      expect(mockedHdwallet.getKeyPairFromMnemonic).toHaveBeenCalledWith(
        testMnemonic, tapyrus.NetworkId.TAPYRUS_API
      )
      expect(mockedHdwallet.getKeyPairFromLegacyMainnetWallet).not.toHaveBeenCalled()
    })

    it('should sign with the legacy key when fromLegacyMainnetWallet is set', async () => {
      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        fromLegacyMainnetWallet: true,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(mockedHdwallet.getKeyPairFromLegacyMainnetWallet).toHaveBeenCalledWith(testMnemonic)
      expect(mockedHdwallet.getKeyPairFromMnemonic).not.toHaveBeenCalled()
    })

    it('should throw error if amount is below dust threshold', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 100, // Below dust threshold
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Amount must be at least 546 tapyrus')
    })

    it('should throw error if amount is not a valid integer', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1.5, // non-integer
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Invalid amount')
    })

    it('should throw error if recipient address is invalid', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: 'not-a-valid-address',
        amount: 10000000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Invalid recipient address')
    })

    it('should throw error if recipient is a colored address', async () => {
      // The transaction has no colored input, so a cp2pkh output would only
      // fail on broadcast
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: coloredRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Recipient address must not be a colored address')
      expect(mockedEsplora.broadcastTransaction).not.toHaveBeenCalled()
    })

    it('should throw error if fee rate is below the relayable minimum', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        feeRate: 0,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should throw error if fee rate is above the absurd-fee limit', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        feeRate: MAX_FEE_RATE + 1,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should accept a fee rate at the absurd-fee limit', async () => {
      const utxos: esplora.Utxo[] = [{
        txid: 'a'.repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 1000000000,
        colorId: esplora.TPC_COLOR_ID,
      }]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        feeRate: MAX_FEE_RATE,
      })

      // tapyrusjs-lib refuses to build above 2500 tapyrus/byte, so the limit
      // has to stay below that for a transaction at the limit to be buildable
      const tx = tapyrus.Transaction.fromHex(result.txHex)
      const outTotal = tx.outs.reduce((sum, out) => sum + out.value, 0)
      expect(utxos[0].value - outTotal).toBe(estimateTxSize(1, 2) * MAX_FEE_RATE)
    })

    it('should throw error if no TPC UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([])

      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('No TPC UTXOs available')
    })

    it('should throw error if insufficient funds', async () => {
      await expect(createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 200000000, // 2 TPC, more than available
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if recipient address is invalid', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: 'not-a-valid-address',
        amount: 100,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Invalid recipient address')
    })

    it('should throw error if recipient address is empty', async () => {
      // An empty recipient must be rejected, not treated as a burn
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: '',
        amount: 100,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Invalid recipient address')
      expect(mockedEsplora.broadcastTransaction).not.toHaveBeenCalled()
    })

    it('should throw error if amount exceeds the maximum output amount', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: MAX_COLORED_AMOUNT + 1,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow(`Amount must not exceed ${MAX_COLORED_AMOUNT}`)
      expect(mockedEsplora.getAddressUtxos).not.toHaveBeenCalled()
    })

    it('should throw error if asset change exceeds the maximum output amount', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([
        ...mockTpcUtxos,
        {
          txid: 'b'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: MAX_COLORED_AMOUNT + 1000,
          colorId: testColorId,
        },
      ])

      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 100,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow(`must not exceed ${MAX_COLORED_AMOUNT}`)
      expect(mockedEsplora.broadcastTransaction).not.toHaveBeenCalled()
    })

    it('should throw error if no asset UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos) // Only TPC, no colored

      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('No TPC UTXOs available for fee')
    })

    it('should throw error if insufficient asset balance', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 2000, // More than available (1000)
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Insufficient asset balance')
    })

    it('should throw error if fee rate is below the relayable minimum', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        feeRate: -1,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should throw error if fee rate is above the absurd-fee limit', async () => {
      await expect(createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        feeRate: MAX_FEE_RATE + 1,
      })).rejects.toThrow('Invalid fee rate')
    })

    it('should include recipient colored output in transaction', async () => {
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(result.txHex).toBeDefined()
      expect(mockedEsplora.broadcastTransaction).toHaveBeenCalledTimes(1)
    })

    it('should sign with the legacy key when fromLegacyMainnetWallet is set', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        fromLegacyMainnetWallet: true,
      })

      expect(result.txid).toBe('c'.repeat(64))
      expect(mockedHdwallet.getKeyPairFromLegacyMainnetWallet).toHaveBeenCalledWith(testMnemonic)
      expect(mockedHdwallet.getKeyPairFromMnemonic).not.toHaveBeenCalled()
    })

    it('should burn all tokens when amount equals balance', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // Burn all
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      expect(result.txid).toBe('c'.repeat(64))
    })

    it('should throw error if amount is zero or negative', async () => {
      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 0,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Amount must be greater than 0')
    })

    it('should throw error if no asset UTXOs available', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)

      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('No asset UTXOs available')
    })

    it('should throw error if no TPC UTXOs for fee', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue(mockColoredUtxos)

      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('No TPC UTXOs available for fee')
    })

    it('should throw error if insufficient asset balance', async () => {
      await expect(burnAsset({
        fromAddress: testAddress,
        amount: 2000,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })).rejects.toThrow('Insufficient asset balance')
    })

    it('should NOT include burned amount in outputs', async () => {
      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 500, // Burn 500, change 500
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      // Burn 500 (with 500 change)
      const burnResult = await burnAsset({
        fromAddress: testAddress,
        amount: 500,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
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

  describe('fee payment', () => {
    beforeEach(() => {
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('pays a fee covering the actual size of a TPC transaction with many inputs', async () => {
      const utxos: esplora.Utxo[] = [1, 2, 3, 4, 5].map(i => ({
        txid: String(i).repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 3000,
        colorId: esplora.TPC_COLOR_ID,
      }))
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await createAndSignTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 10000,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      const fee = paidTpcFee(result.txHex, utxos)
      const expectedFee = (estimateTxSize(0, 2) + 5 * P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
      expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
    })

    it('pays a fee covering asset inputs and colored outputs on a transfer', async () => {
      const assetUtxos: esplora.Utxo[] = ['d', 'e', 'f'].map(c => ({
        txid: c.repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 400,
        colorId: testColorId,
      }))
      const utxos = [...mockTpcUtxos, ...assetUtxos]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1000, // needs all 3 asset UTXOs, 200 asset change
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      expect(tx.ins.length).toBe(4) // 3 asset inputs + 1 TPC input

      const fee = paidTpcFee(result.txHex, utxos)
      // 3 asset inputs + 1 TPC input, 2 colored outputs, 1 TPC change output
      const expectedFee = (estimateTxSize(3, 1, 2) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
      expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
    })

    it('rounds the fee up to an integer for non-integer fee rates', async () => {
      const utxos = [...mockTpcUtxos, ...mockColoredUtxos]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      // Full transfer (no asset change): odd base size of 261 bytes
      // (1 asset input, 1 colored output, 1 TPC change output)
      const result = await createAndSignAssetTransaction({
        fromAddress: testAddress,
        toAddress: testRecipient,
        amount: 1000,
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
        feeRate: 1.5,
      })

      const fee = paidTpcFee(result.txHex, utxos)
      expect(Number.isInteger(fee)).toBe(true)
      const expectedFee = Math.ceil((estimateTxSize(1, 1, 1) + P2PKH_INPUT_SIZE) * 1.5)
      expect(fee).toBe(expectedFee)
    })

    it('creates a TPC change output above dust when burning all tokens', async () => {
      const tpcUtxos: esplora.Utxo[] = [{
        txid: 'a'.repeat(64),
        vout: 0,
        status: { confirmed: true },
        value: 5000,
        colorId: esplora.TPC_COLOR_ID,
      }]
      const utxos = [...tpcUtxos, ...mockColoredUtxos]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const result = await burnAsset({
        fromAddress: testAddress,
        amount: 1000, // burn all: no colored output remains
        colorId: testColorId,
        mnemonic: testMnemonic,
        networkId: tapyrus.NetworkId.TAPYRUS_API,
      })

      const tx = tapyrus.Transaction.fromHex(result.txHex)
      // The TPC change output is the only output and must clear dust
      expect(tx.outs.length).toBe(1)
      expect(tx.outs[0].script.length).toBe(25)
      expect(tx.outs[0].value).toBeGreaterThanOrEqual(DUST_THRESHOLD)

      const fee = paidTpcFee(result.txHex, utxos)
      const expectedFee = (estimateTxSize(1, 1, 0) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
      expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
    })
  })

  describe('estimateFee', () => {
    beforeEach(() => {
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    it('rejects the same arguments the transfer rejects', async () => {
      // NaN would otherwise walk the whole UTXO set and report "Insufficient
      // funds" for an address that has plenty
      await expect(estimateFee(testAddress, NaN)).rejects.toThrow('Invalid amount')
      await expect(estimateFee(testAddress, 1.5)).rejects.toThrow('Invalid amount')
      await expect(estimateFee(testAddress, -1)).rejects.toThrow('Invalid amount')
      await expect(estimateFee(testAddress, 0))
        .rejects.toThrow(`Amount must be at least ${DUST_THRESHOLD} tapyrus`)
      await expect(estimateFee(testAddress, DUST_THRESHOLD - 1))
        .rejects.toThrow(`Amount must be at least ${DUST_THRESHOLD} tapyrus`)
    })

    it('estimates from TPC UTXOs only, ignoring colored UTXOs', async () => {
      const utxos: esplora.Utxo[] = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 20000000, // token amount, not TPC
          colorId: testColorId,
        },
        ...['d', 'e'].map(c => ({
          txid: c.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 6000000,
          colorId: esplora.TPC_COLOR_ID,
        })),
      ]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      const fee = await estimateFee(testAddress, 10000000)

      // Both TPC UTXOs are needed; the colored UTXO must not be counted
      const expectedFee = (estimateTxSize(0, 2) + 2 * P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
      expect(fee).toBe(expectedFee)
    })

    it('throws when the options are given as a bare fee rate', async () => {
      // The old positional form would silently estimate at DEFAULT_FEE_RATE
      await expect(
        estimateFee(testAddress, 10000000, 10 as unknown as { feeRate?: number })
      ).rejects.toThrow('estimateFee takes its options as an object')
    })

    it('throws the same no-UTXO error the transfer throws', async () => {
      mockedEsplora.getAddressUtxos.mockResolvedValue([])

      await expect(estimateFee(testAddress, 10000000))
        .rejects.toThrow('No TPC UTXOs available')
    })

    it('throws when TPC balance is insufficient even if colored UTXOs exist', async () => {
      const utxos: esplora.Utxo[] = [
        {
          txid: 'b'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 999999999, // token amount, not TPC
          colorId: testColorId,
        },
        {
          txid: 'a'.repeat(64),
          vout: 0,
          status: { confirmed: true },
          value: 500,
          colorId: esplora.TPC_COLOR_ID,
        },
      ]
      mockedEsplora.getAddressUtxos.mockResolvedValue(utxos)

      await expect(estimateFee(testAddress, 10000000)).rejects.toThrow('Insufficient funds')
    })
  })

  describe('split', () => {
    beforeEach(() => {
      mockedEsplora.isTpcColorId.mockImplementation((colorId) => {
        return !colorId || colorId === esplora.TPC_COLOR_ID
      })
    })

    // Values of the outputs paying `address`, in transaction order.
    const outputValuesTo = (txHex: string, address: string): number[] => {
      const tx = tapyrus.Transaction.fromHex(txHex)
      const script = tapyrus.address.toOutputScript(address, mockKeyPairWithNetwork.network)
      return tx.outs.filter(out => out.script.equals(script)).map(out => out.value)
    }

    // Values of the colored outputs paying `address` with `colorId`.
    const coloredOutputValuesTo = (txHex: string, address: string, colorId: string): number[] => {
      const tx = tapyrus.Transaction.fromHex(txHex)
      const script = tapyrus.payments.cp2pkh({
        colorId: Buffer.from(colorId, 'hex'),
        hash: tapyrus.address.fromBase58Check(address).hash,
        network: mockKeyPairWithNetwork.network,
      }).output!
      return tx.outs.filter(out => out.script.equals(script)).map(out => out.value)
    }

    describe('createAndSignTransaction', () => {
      beforeEach(() => {
        mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)
      })

      it('creates one recipient output per split', async () => {
        const result = await createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 10000000,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 4,
        })

        expect(outputValuesTo(result.txHex, testRecipient)).toEqual([
          2500000, 2500000, 2500000, 2500000,
        ])
      })

      it('adds the remainder to the last output', async () => {
        const result = await createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 10000003,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 3,
        })

        const values = outputValuesTo(result.txHex, testRecipient)
        expect(values).toEqual([3333334, 3333334, 3333335])
        expect(values.reduce((sum, v) => sum + v, 0)).toBe(10000003)
      })

      it('creates a single recipient output by default', async () => {
        const result = await createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 10000000,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
        })

        expect(outputValuesTo(result.txHex, testRecipient)).toEqual([10000000])
      })

      it('pays a fee covering every split output', async () => {
        const result = await createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 10000000,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 10,
        })

        const fee = paidTpcFee(result.txHex, mockTpcUtxos)
        // 10 recipient outputs + 1 change output, funded by 1 TPC input
        const expectedFee = (estimateTxSize(0, 11) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
        expect(fee).toBe(expectedFee)
        expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
      })

      it('throws when split is out of range', async () => {
        for (const split of [0, 101, 1.5]) {
          await expect(createAndSignTransaction({
            fromAddress: testAddress,
            toAddress: testRecipient,
            amount: 10000000,
            mnemonic: testMnemonic,
            networkId: tapyrus.NetworkId.TAPYRUS_API,
            split,
          })).rejects.toThrow('split must be an integer between 1 and 100')
        }
      })

      it('allows a split whose outputs land exactly on the dust threshold', async () => {
        const result = await createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: DUST_THRESHOLD * 4,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 4,
        })

        expect(outputValuesTo(result.txHex, testRecipient)).toEqual([
          DUST_THRESHOLD, DUST_THRESHOLD, DUST_THRESHOLD, DUST_THRESHOLD,
        ])
      })

      it('pays a fee covering the largest allowed split', async () => {
        const result = await createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 10000000,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: MAX_SPLIT,
        })

        expect(outputValuesTo(result.txHex, testRecipient)).toHaveLength(MAX_SPLIT)
        const fee = paidTpcFee(result.txHex, mockTpcUtxos)
        const expectedFee = (estimateTxSize(0, MAX_SPLIT + 1) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
        expect(fee).toBe(expectedFee)
        expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
      })

      it('throws when a split output would fall below the dust threshold', async () => {
        await expect(createAndSignTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: DUST_THRESHOLD * 4 - 1,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 4,
        })).rejects.toThrow(`Each of the 4 outputs must be at least ${DUST_THRESHOLD} tapyrus`)
      })
    })

    describe('createAndSignAssetTransaction', () => {
      beforeEach(() => {
        mockedEsplora.getAddressUtxos.mockResolvedValue([...mockTpcUtxos, ...mockColoredUtxos])
      })

      it('creates one colored recipient output per split', async () => {
        const result = await createAndSignAssetTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 400,
          colorId: testColorId,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 4,
        })

        expect(coloredOutputValuesTo(result.txHex, testRecipient, testColorId)).toEqual([
          100, 100, 100, 100,
        ])
        // The 600 left over still goes back as a single asset change output
        expect(coloredOutputValuesTo(result.txHex, testAddress, testColorId)).toEqual([600])
      })

      it('creates a single colored recipient output by default', async () => {
        const result = await createAndSignAssetTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 400,
          colorId: testColorId,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
        })

        expect(coloredOutputValuesTo(result.txHex, testRecipient, testColorId)).toEqual([400])
      })

      it('creates only `amount` outputs when the split exceeds the amount', async () => {
        const result = await createAndSignAssetTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 3,
          colorId: testColorId,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 10,
        })

        expect(coloredOutputValuesTo(result.txHex, testRecipient, testColorId)).toEqual([1, 1, 1])
      })

      it('pays a fee covering every colored split output', async () => {
        const result = await createAndSignAssetTransaction({
          fromAddress: testAddress,
          toAddress: testRecipient,
          amount: 400,
          colorId: testColorId,
          mnemonic: testMnemonic,
          networkId: tapyrus.NetworkId.TAPYRUS_API,
          split: 4,
        })

        const fee = paidTpcFee(result.txHex, [...mockTpcUtxos, ...mockColoredUtxos])
        // 1 asset input + 1 TPC input, 5 colored outputs, 1 TPC change output
        const expectedFee = (estimateTxSize(1, 1, 5) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
        expect(fee).toBe(expectedFee)
        expect(fee).toBeGreaterThanOrEqual(txByteSize(result.txHex) * DEFAULT_FEE_RATE)
      })

      it('throws when split is out of range', async () => {
        for (const split of [0, 101, 1.5]) {
          await expect(createAndSignAssetTransaction({
            fromAddress: testAddress,
            toAddress: testRecipient,
            amount: 400,
            colorId: testColorId,
            mnemonic: testMnemonic,
            networkId: tapyrus.NetworkId.TAPYRUS_API,
            split,
          })).rejects.toThrow('split must be an integer between 1 and 100')
        }
      })
    })

    describe('estimateFee', () => {
      beforeEach(() => {
        mockedEsplora.getAddressUtxos.mockResolvedValue(mockTpcUtxos)
      })

      it('counts one recipient output per split', async () => {
        const fee = await estimateFee(testAddress, 10000000, { split: 10 })

        const expectedFee = (estimateTxSize(0, 11) + P2PKH_INPUT_SIZE) * DEFAULT_FEE_RATE
        expect(fee).toBe(expectedFee)
      })

      it('throws when split is out of range', async () => {
        await expect(estimateFee(testAddress, 10000000, { split: 101 }))
          .rejects.toThrow('split must be an integer between 1 and 100')
      })

      it('rejects a split that puts an output below the dust threshold', async () => {
        await expect(estimateFee(testAddress, DUST_THRESHOLD * 4 - 1, { split: 4 }))
          .rejects.toThrow(`Each of the 4 outputs must be at least ${DUST_THRESHOLD} tapyrus`)
      })
    })
  })
})
