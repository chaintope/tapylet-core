import { PendingTxStore, type PendingTransaction } from '~/core/storage/pendingTxStore'
import { InMemoryKeyValueStore } from '../../helpers/memoryStore'

describe('PendingTxStore', () => {
  let kv: InMemoryKeyValueStore
  let store: PendingTxStore

  const makeTx = (txid: string): PendingTransaction => ({
    txid,
    amount: 1000,
    toAddress: '1ExampleAddress',
    timestamp: 1700000000000,
  })

  beforeEach(() => {
    kv = new InMemoryKeyValueStore()
    store = new PendingTxStore(kv)
  })

  it('returns an empty array when nothing is stored', async () => {
    expect(await store.getAll()).toEqual([])
  })

  it('adds and lists transactions', async () => {
    const a = makeTx('txid-a')
    const b = makeTx('txid-b')
    await store.add(a)
    await store.add(b)

    expect(await store.getAll()).toEqual([a, b])
  })

  it('removes a transaction by txid', async () => {
    const a = makeTx('txid-a')
    const b = makeTx('txid-b')
    await store.add(a)
    await store.add(b)

    await store.remove('txid-a')

    expect(await store.getAll()).toEqual([b])
  })

  it('removing an unknown txid leaves the list unchanged', async () => {
    const a = makeTx('txid-a')
    await store.add(a)

    await store.remove('missing')

    expect(await store.getAll()).toEqual([a])
  })

  it('clears all transactions', async () => {
    await store.add(makeTx('txid-a'))
    await store.add(makeTx('txid-b'))

    await store.clear()

    expect(await store.getAll()).toEqual([])
  })
})
