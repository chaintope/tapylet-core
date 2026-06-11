import { WalletStorage } from '~/core/storage/walletStorage'
import type { WalletData } from '~/core/types/wallet'
import { InMemoryKeyValueStore, InMemorySecureStore } from '../../helpers/memoryStore'

describe('WalletStorage', () => {
  let secure: InMemorySecureStore
  let plain: InMemoryKeyValueStore
  let storage: WalletStorage

  const password = 'correct horse battery staple'
  const walletData: WalletData = {
    mnemonic: 'test test test test test test test test test test test junk',
    address: '1ExampleAddress',
    publicKey: '02abcdef',
    createdAt: 1700000000000,
  }

  beforeEach(() => {
    secure = new InMemorySecureStore()
    plain = new InMemoryKeyValueStore()
    storage = new WalletStorage(secure, plain)
  })

  describe('setPassword / unlock state', () => {
    it('marks the storage as unlocked after setting a password', async () => {
      expect(storage.getIsUnlocked()).toBe(false)
      await storage.setPassword(password)
      expect(storage.getIsUnlocked()).toBe(true)
    })

    it('unlocks with the correct password', async () => {
      await storage.setPassword(password)
      storage.lock()
      expect(storage.getIsUnlocked()).toBe(false)

      const result = await storage.unlock(password)
      expect(result).toBe(true)
      expect(storage.getIsUnlocked()).toBe(true)
    })

    it('does not unlock with a wrong password', async () => {
      await storage.setPassword(password)
      storage.lock()

      const result = await storage.unlock('wrong password')
      expect(result).toBe(false)
      expect(storage.getIsUnlocked()).toBe(false)
    })

    it('lock() clears the unlocked state', async () => {
      await storage.setPassword(password)
      storage.lock()
      expect(storage.getIsUnlocked()).toBe(false)
    })
  })

  describe('saveWallet / getWallet', () => {
    it('saves and retrieves wallet data when unlocked', async () => {
      await storage.setPassword(password)
      await storage.saveWallet(walletData)

      const retrieved = await storage.getWallet()
      expect(retrieved).toEqual(walletData)
    })

    it('throws when saving while locked', async () => {
      await expect(storage.saveWallet(walletData)).rejects.toThrow('Storage is locked')
    })

    it('throws when reading while locked', async () => {
      await storage.setPassword(password)
      await storage.saveWallet(walletData)
      storage.lock()

      await expect(storage.getWallet()).rejects.toThrow('Storage is locked')
    })

    it('returns the saved wallet after a lock/unlock cycle', async () => {
      await storage.setPassword(password)
      await storage.saveWallet(walletData)
      storage.lock()

      await storage.unlock(password)
      expect(await storage.getWallet()).toEqual(walletData)
    })

    it('migrates a legacy wallet that stored the mnemonic under encryptedMnemonic', async () => {
      await storage.setPassword(password)
      // Simulate a wallet persisted before the field rename: only the legacy
      // `encryptedMnemonic` key is present, no `mnemonic`.
      await secure.set('wallet_data', {
        encryptedMnemonic: 'legacy mnemonic phrase',
        address: '1LegacyAddress',
        publicKey: '02legacy',
        createdAt: 1600000000000,
      })

      const retrieved = await storage.getWallet()
      expect(retrieved?.mnemonic).toBe('legacy mnemonic phrase')
    })
  })

  describe('walletExists', () => {
    it('returns false before any wallet is saved', async () => {
      expect(await storage.walletExists()).toBe(false)
    })

    it('returns true after saving a wallet, even while locked', async () => {
      await storage.setPassword(password)
      await storage.saveWallet(walletData)
      storage.lock()

      // walletExists reads from plain storage, so it works while locked.
      expect(await storage.walletExists()).toBe(true)
    })
  })

  describe('clearWallet', () => {
    it('removes wallet data and resets state', async () => {
      await storage.setPassword(password)
      await storage.saveWallet(walletData)

      await storage.clearWallet()

      expect(storage.getIsUnlocked()).toBe(false)
      expect(await storage.walletExists()).toBe(false)
      // A subsequent unlock attempt fails because the password hash is gone.
      expect(await storage.unlock(password)).toBe(false)
    })
  })
})
