import { IssuedTokenStore, type IssuedToken } from '~/core/storage/issuedTokenStore'
import { InMemoryKeyValueStore } from '../../helpers/memoryStore'

describe('IssuedTokenStore', () => {
  let kv: InMemoryKeyValueStore
  let store: IssuedTokenStore

  const makeToken = (colorId: string): IssuedToken => ({
    colorId,
    metadata: {
      version: '1',
      name: `Token ${colorId}`,
      symbol: 'TKN',
      tokenType: 'reissuable',
    },
    paymentBase: 'payment-base',
    txid: `txid-${colorId}`,
    timestamp: 1700000000000,
  })

  beforeEach(() => {
    kv = new InMemoryKeyValueStore()
    store = new IssuedTokenStore(kv)
  })

  it('returns an empty array when nothing is stored', async () => {
    expect(await store.getAll()).toEqual([])
  })

  it('adds and lists tokens', async () => {
    const a = makeToken('color-a')
    const b = makeToken('color-b')
    await store.add(a)
    await store.add(b)

    expect(await store.getAll()).toEqual([a, b])
  })

  it('gets a token by colorId', async () => {
    const a = makeToken('color-a')
    await store.add(a)

    expect(await store.get('color-a')).toEqual(a)
  })

  it('returns null when getting an unknown colorId', async () => {
    expect(await store.get('missing')).toBeNull()
  })

  it('removes a token by colorId', async () => {
    const a = makeToken('color-a')
    const b = makeToken('color-b')
    await store.add(a)
    await store.add(b)

    await store.remove('color-a')

    expect(await store.getAll()).toEqual([b])
    expect(await store.get('color-a')).toBeNull()
  })

  it('removing an unknown colorId leaves the list unchanged', async () => {
    const a = makeToken('color-a')
    await store.add(a)

    await store.remove('missing')

    expect(await store.getAll()).toEqual([a])
  })
})
