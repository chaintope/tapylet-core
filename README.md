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
  NetworkId,
} from "@tapylet/core/wallet"

const mnemonic = generateMnemonic() // 12-word BIP39 phrase (strength 128)

const networkId = NetworkId.TAPYRUS_API // TIP-0044 id; picks the coin type of the derivation path
const keys = await createHDWallet(mnemonic, networkId) // { privateKey, publicKey, wif }
const address = generateAddress(keys.publicKey)

// Build + sign a TPC transfer (does not broadcast)
const { txid, txHex } = await createAndSignTransaction({
  fromAddress: address,
  toAddress: "...",
  amount: 1000, // tapyrus
  mnemonic,
  networkId,
})
```

`split` (1-100) pays the recipient through that many outputs instead of one, so
the recipient can spend in parallel instead of chaining unconfirmed
transactions. Every output gets `floor(amount / split)` and the whole remainder
goes to the last output, so that output can exceed the others by up to
`split - 1`: an amount of 199 split 100 ways yields 99 outputs of 1 and one
output of 100. For TPC every output must clear the dust threshold.
`createAndSignAssetTransaction` accepts the same option for Colored Coins, where
an amount smaller than `split` yields `amount` outputs of 1 instead.

`createAndSignTransaction` requires an uncolored recipient address, because it
spends TPC inputs only and so cannot fund a colored output.

`feeRate` is given in tapyrus per byte and must be between 1 and 1000. Nodes
relay a transaction only at 1 or more, and a rate above 1000 costs more in fees
than any transfer is worth, so both ends are rejected before the transaction is
built.

`estimateFee` returns the fee a transfer of the same arguments would pay,
including a leftover too small to become its own change output:

```ts
const fee = await estimateFee(address, 1000, { feeRate: 10, split: 4 })
```

### Token issuance

```ts
import { issueToken } from "@tapylet/core"

const result = await issueToken({
  tokenType: "reissuable", // "reissuable" | "non_reissuable" | "nft"
  amount: 100,
  metadata: { /* MetadataFields */ },
  mnemonic,
  networkId,
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
| `@tapylet/core/wallet` | `generateMnemonic`, `validateMnemonic`, `mnemonicToSeed`, `createHDWallet`, `getKeyPairFromMnemonic`, `createLegacyMainnetWallet`, `getKeyPairFromLegacyMainnetWallet`, `generateAddress`, `validateAddress`, `createAndSignTransaction`, `estimateFee`, `createAndSignAssetTransaction`, `burnAsset`, … |
| `@tapylet/core` (issuance) | `issueToken`, `TokenType`, `MetadataFields`, `IssueOptions`, `IssueResult` |
| `@tapylet/core/api` | `getBalance`, `getAllBalances`, `getAddressUtxos`, `broadcastTransaction`, `getTransactionInfo`, `getTokenMetadata`, `formatTpc`, `formatColorId`, `TPC_COLOR_ID`, … |
| `@tapylet/core/storage/*` | `WalletStorage`, `IssuedTokenStore`, `PendingTxStore`, `SettingsStore`, `KeyValueStore`, `SecureKeyValueStore` |
| `@tapylet/core` (types/constants) | `WalletData`, `WalletState`, `DEFAULT_AUTO_LOCK_MINUTES`, `AUTO_LOCK_OPTIONS`, … |
| `@tapylet/core/utils/sanitize` | `sanitizeUrl`, `sanitizeImageUrl` |

All subpaths are also reachable from the root barrel `@tapylet/core`.

### URL sanitization

Token metadata is written by the issuer, and any issuer can send a token to any
address, so URLs read out of metadata are untrusted. Pass them through the
sanitizers before rendering.

- `sanitizeUrl` accepts `https:`, `http:` and `ipfs:`, and prefixes `https://`
  when the input carries no scheme. A host followed by a port
  (`example.com:8080/a`, `intranet:8443`) counts as carrying no scheme.
  `https:` and `http:` must name a host: `https:example.com` has no authority
  and a browser resolves it against the page it is rendered on, so it returns
  `undefined`. Everything else, `javascript:` and `data:` included, returns
  `undefined`.
- `sanitizeImageUrl` accepts `https:` URLs and `data:` URLs declaring a raster
  image media type (`png`, `jpeg`, `jpg`, `gif`, `webp`), and prefixes
  `https://` when the input carries no scheme. `http:`, `ipfs:` and
  `data:image/svg+xml` return `undefined`.

**What `sanitizeImageUrl` does not promise.** The check stops at the URL, so
what comes back is only safe to render through `<img>`, which keeps an SVG
inert whatever the bytes turn out to be.

- For a `data:` URL the media type is what the URL declares about itself. The
  payload is never decoded, so `data:image/png;base64,<an SVG>` passes.
- For an `https:` URL nothing about the response is known at all, so
  `https://example.com/icon.svg` passes.

A consumer that fetches the image and inlines it, or renders it through
`<object>`, `<embed>` or a WebView, needs its own guard.

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
