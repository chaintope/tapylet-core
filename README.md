# @tapylet/core

Platform-agnostic core for [Tapylet](https://github.com/chaintope/tapylet) — the
[Tapyrus](https://www.chaintope.com/en/tapyrus/) wallet logic shared across
clients (browser extension, and future web/mobile front-ends).

This package contains **zero UI / browser / Chrome-extension dependencies**. It
exposes the HD wallet, transaction building, token issuance, Esplora API client,
and storage interfaces. Persistence is left to the consumer via a small adapter
interface, so the same logic runs in any JavaScript environment.

## Install

```bash
npm install @tapylet/core
# or
pnpm add @tapylet/core
```

## ⚠️ Required consumer setup

These two points are **mandatory** for the package to work in a bundled
(browser) build. Skipping them produces confusing runtime/build errors.

### 1. Replace `tiny-secp256k1` with the bundled shim

`tapyrusjs-lib` transitively depends on the real
[`tiny-secp256k1`](https://www.npmjs.com/package/tiny-secp256k1), which uses
WASM + Node's `fs` and **cannot run in a browser**. This package ships a
[`@noble`](https://github.com/paulmillr/noble-curves)-based drop-in replacement
at `@tapylet/core/lib/secp256k1-compat`. Alias `tiny-secp256k1` to it in your
**bundler** config.

For a Parcel/Plasmo consumer, in the consumer's `package.json`:

```jsonc
{
  "alias": {
    "fs": false,
    "path": false,
    // Must be a ROOT-RELATIVE FILE PATH, not a package specifier.
    // Parcel resolves file-path alias targets relative to the package.json
    // that defines the alias, so this works regardless of where (deep in the
    // dependency tree) the import originates.
    "tiny-secp256k1": "./node_modules/@tapylet/core/dist/lib/secp256k1-compat.js"
  }
}
```

> For other bundlers use the equivalent alias mechanism (e.g. Vite/Rollup
> `resolve.alias`, webpack `resolve.alias`) pointing at the same file.

### 2. Use a TypeScript `moduleResolution` that reads `exports`

This package publishes its public API through the `exports` map (subpath
exports). Legacy `"moduleResolution": "node"` (a.k.a. `node10`) does **not** read
`exports` and will fail with `TS2307` on subpath imports. Use:

```jsonc
{
  "compilerOptions": {
    "moduleResolution": "bundler" // or "node16" / "nodenext"
  }
}
```

## Usage

The whole API is available from the root, or via subpath exports that mirror the
source layout.

```ts
// Root barrel — everything in one import
import { generateMnemonic, createHDWallet, getBalance } from "@tapylet/core"

// Or subpath exports
import { generateMnemonic, createHDWallet } from "@tapylet/core/wallet"
import { getBalance, broadcastTransaction } from "@tapylet/core/api"
import { WalletStorage } from "@tapylet/core/storage/walletStorage"
```

### Wallet

```ts
import {
  generateMnemonic,
  validateMnemonic,
  createHDWallet,
  generateAddress,
  createAndSignTransaction,
} from "@tapylet/core/wallet"

const mnemonic = generateMnemonic() // 12-word BIP39 phrase (strength 128)

const keys = await createHDWallet(mnemonic) // { privateKey, publicKey, wif }
const address = generateAddress(keys.publicKey)

// Build + sign a TPC transfer (does not broadcast)
const { txid, txHex } = await createAndSignTransaction({
  fromAddress: address,
  toAddress: "...",
  amount: 1000, // tapyrus
  mnemonic,
})
```

### Token issuance

```ts
import { issueToken } from "@tapylet/core"

const result = await issueToken({
  tokenType: "reissuable", // "reissuable" | "non_reissuable" | "nft"
  amount: 100,
  metadata: { /* MetadataFields */ },
  mnemonic,
  fromAddress: address,
})
// { txid, colorId, paymentBase, outPoint? }
```

### Esplora / token registry API

```ts
import {
  getBalance,
  getAllBalances,
  broadcastTransaction,
  getTokenMetadata,
} from "@tapylet/core/api"

const balance = await getBalance(address)
const txid = await broadcastTransaction(txHex)
```

### Storage (adapter pattern)

The core defines **interfaces**, not implementations. The consumer provides a
`KeyValueStore` and a `SecureKeyValueStore` backed by its platform
(`chrome.storage`, `localStorage`, SQLite, …) and wires them into the store
classes.

```ts
import {
  WalletStorage,
  IssuedTokenStore,
  type KeyValueStore,
  type SecureKeyValueStore,
} from "@tapylet/core"

// Implement these for your platform:
class MyKeyValueStore implements KeyValueStore { /* get/set/remove/watch */ }
class MySecureStore implements SecureKeyValueStore { /* setPassword/get/set/remove */ }

const walletStorage = new WalletStorage(new MySecureStore(), new MyKeyValueStore())
await walletStorage.setPassword("…")
await walletStorage.unlock("…")
const wallet = await walletStorage.getWallet()
```

## API surface

| Subpath | Exports |
| --- | --- |
| `@tapylet/core/wallet` | `generateMnemonic`, `validateMnemonic`, `mnemonicToSeed`, `createHDWallet`, `getKeyPairFromMnemonic`, `generateAddress`, `validateAddress`, `createAndSignTransaction`, `estimateFee`, `createAndSignAssetTransaction`, `burnAsset`, … |
| `@tapylet/core` (issuance) | `issueToken`, `TokenType`, `MetadataFields`, `IssueOptions`, `IssueResult` |
| `@tapylet/core/api` | `getBalance`, `getAllBalances`, `getAddressUtxos`, `broadcastTransaction`, `getTransactionInfo`, `getTokenMetadata`, `formatTpc`, `formatColorId`, `TPC_COLOR_ID`, … |
| `@tapylet/core/storage/*` | `WalletStorage`, `IssuedTokenStore`, `PendingTxStore`, `SettingsStore`, `KeyValueStore`, `SecureKeyValueStore` |
| `@tapylet/core` (types/constants) | `WalletData`, `WalletState`, `DEFAULT_AUTO_LOCK_MINUTES`, `AUTO_LOCK_OPTIONS`, … |

All subpaths are also reachable from the root barrel `@tapylet/core`.

## Development

```bash
pnpm install
pnpm run build   # tsc -> dist/ (CommonJS + .d.ts)
pnpm test        # jest
```

### Local development against a consumer

To iterate on the core while developing a consumer, link it instead of pinning
the published version:

```bash
# in the consumer
pnpm link ../tapylet-core
```

Remember the core ships compiled `dist/`, so run `pnpm run build` after each
change to reflect it in the linked consumer.

### Publishing

```bash
npm version patch   # bump version
npm publish         # access=public is set via publishConfig; 2FA/OTP required
```

## License

MIT
