import {
  SettingsStore,
  DEFAULT_AUTO_LOCK_MINUTES,
} from '~/core/storage/settingsStore'
import { InMemoryKeyValueStore } from '../../helpers/memoryStore'

describe('SettingsStore', () => {
  let kv: InMemoryKeyValueStore
  let store: SettingsStore

  beforeEach(() => {
    kv = new InMemoryKeyValueStore()
    store = new SettingsStore(kv)
  })

  describe('getAutoLockMinutes', () => {
    it('returns the default when nothing is stored', async () => {
      expect(await store.getAutoLockMinutes()).toBe(DEFAULT_AUTO_LOCK_MINUTES)
    })

    it('returns the stored value', async () => {
      await store.setAutoLockMinutes(15)
      expect(await store.getAutoLockMinutes()).toBe(15)
    })

    it('allows 0 (disabled auto-lock)', async () => {
      await store.setAutoLockMinutes(0)
      expect(await store.getAutoLockMinutes()).toBe(0)
    })

    it('falls back to the default for negative values', async () => {
      await store.setAutoLockMinutes(-1)
      expect(await store.getAutoLockMinutes()).toBe(DEFAULT_AUTO_LOCK_MINUTES)
    })

    it('falls back to the default for non-numeric stored values', async () => {
      await kv.set('auto_lock_minutes', 'not-a-number')
      expect(await store.getAutoLockMinutes()).toBe(DEFAULT_AUTO_LOCK_MINUTES)
    })
  })

  describe('watchAutoLockMinutes', () => {
    it('invokes the callback with the normalized new value', async () => {
      const received: number[] = []
      store.watchAutoLockMinutes((minutes) => received.push(minutes))

      await store.setAutoLockMinutes(30)
      await store.setAutoLockMinutes(-5) // normalized to the default

      expect(received).toEqual([30, DEFAULT_AUTO_LOCK_MINUTES])
    })

    it('stops invoking the callback after unsubscribe', async () => {
      const received: number[] = []
      const unsubscribe = store.watchAutoLockMinutes((minutes) => received.push(minutes))

      await store.setAutoLockMinutes(30)
      unsubscribe()
      await store.setAutoLockMinutes(60)

      expect(received).toEqual([30])
    })
  })
})
