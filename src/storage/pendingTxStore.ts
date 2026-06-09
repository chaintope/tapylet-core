import type { KeyValueStore } from "./types"

export interface PendingTransaction {
  txid: string
  amount: number
  toAddress: string
  timestamp: number
  colorId?: string
}

const STORAGE_KEY = "pending_transactions"

export class PendingTxStore {
  constructor(private storage: KeyValueStore) {}

  async getAll(): Promise<PendingTransaction[]> {
    const txs = await this.storage.get<PendingTransaction[]>(STORAGE_KEY)
    return txs ?? []
  }

  async add(tx: PendingTransaction): Promise<void> {
    const txs = await this.getAll()
    txs.push(tx)
    await this.storage.set(STORAGE_KEY, txs)
  }

  async remove(txid: string): Promise<void> {
    const txs = await this.getAll()
    const filtered = txs.filter((tx) => tx.txid !== txid)
    await this.storage.set(STORAGE_KEY, filtered)
  }

  async clear(): Promise<void> {
    await this.storage.set(STORAGE_KEY, [])
  }
}

