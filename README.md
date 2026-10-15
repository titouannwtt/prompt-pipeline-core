# prompt-pipeline-core

The encryption module of [Prompt Pipeline](https://prompt-pipeline.io), as a standalone package that any project can
reuse. Apache-2.0, no runtime dependency, built reproducibly, served byte for byte by the sites that use it.

- **Argon2id** key derivation (`hash-wasm`, bundled), run in a Web Worker, with calibrated parameters stored in a
  versioned header.
- **AES-256-GCM** through WebCrypto. The master key is a **non-extractable `CryptoKey`**.
- **Records bound to their identity**: the additional authenticated data is `pp|<fmt>|<type>|<id>`, so a blob cannot
  be replayed as another record or downgraded to another format.
- **Randomness** only from `crypto.getRandomValues`.

The point of this repository is not only the code. It is that **anyone can check that a site runs exactly this code**,
without having the code of that site. That is what the build, the fingerprints and the verifier below are for.

Contents: [Threat model](#threat-model) · [API](#api) · [Use it in your project](#use-it-in-your-project) ·
[Verify a site](#verify-a-site) · [Build and releases](#build-and-releases)

## Threat model

What this module guarantees, as long as the page that loads it is the page you verified:

- The passphrase and the derived key are passed in and never leave the browser. The module makes no network request.
- Only ciphertext (IV + ciphertext with GCM tag) and non-sensitive metadata need to leave the device. Whoever stores
  the ciphertext cannot decrypt it without the passphrase.
- Argon2id parameters live in the header, with a 64 MiB floor, so a stolen ciphertext is costly to attack offline.
- GCM authenticates every record: a wrong passphrase and a tampered blob fail the same way.

What it does **not** guarantee, stated plainly:

1. **The application around the module can see plaintext.** Prompt Pipeline's application is private. It receives the
   passphrase and shows decrypted data, so it *could* send plaintext somewhere else. No library can prevent that.
   You check it by behaviour, not by code: with the browser developer tools open, the passphrase must appear in no
   request, and only ciphertext must go to the storage backend.
2. **In "Managed" mode the operator CAN decrypt.** The same cryptography is used, but the key is held server side
   (wrapped by a separate master key) so that the account can be recovered. Only "Sovereign" mode, where the key comes
   from a passphrase the operator never sees, keeps the operator out. The application says which mode is active.
3. **The operator serves the code.** A malicious operator could serve different code to one user, or serve a page
   that lies to the verification tool running inside it. A check holds for the session it was made in. This is why the
   independent proof is a command run outside the browser (see [Verify a site](#verify-a-site)), and why the in-app
   check says so.
4. **A non-extractable key can still be used.** Script running in the same page (XSS) cannot read the key bytes, but it
   can ask the browser to encrypt or decrypt with the key object while the vault is unlocked.
5. **Memory is not wiped reliably.** JavaScript offers no guaranteed erasure (garbage collection, JIT copies). The
   module zeroes the buffers it owns, as a best effort.
6. **Not independently audited here.** Read the code (a few hundred lines), and commission an audit if you need
   assurance beyond that.

## API

Everything is exported from the entry point (`src/index.ts`, types included).

| Area | Exports |
| --- | --- |
| Key derivation | `deriveKeyBytes(password, salt, params)` (Argon2id, 32 bytes, in a Worker when available), `calibrate(opts?)` (picks `m` so a derivation fits a time target, floor 64 MiB) |
| Key and records | `importMasterKey(bytes)` (non-extractable AES-GCM key, zeroes `bytes`), `encryptRecord(key, { type, id, fmt? }, text)`, `decryptRecordToString(key, ref, blob)` |
| Low level | `encryptRaw(key, bytes, aad)`, `decryptRaw(key, blob, aad)` |
| Header | `DESKTOP_KDF`, `FLOOR_M_KIB`, `FORMAT_VERSION`, `isKdfParams(x)`, `isVaultHeader(x)` |
| Helpers | `getRandomBytes(n)`, `utf8ToBytes`, `bytesToUtf8`, `bytesToBase64`, `base64ToBytes`, `ensureSecureContext()` |
| Types | `KdfParams`, `EncryptedBlob`, `EncryptedRecord`, `VaultHeader`, `RecordType`, `RecordRef`, `VaultError`, `VaultErrorCode` |

```js
import { deriveKeyBytes, importMasterKey, encryptRecord, decryptRecordToString, getRandomBytes, DESKTOP_KDF } from './prompt-pipeline-core.js';

const salt = getRandomBytes(16);
const key = await importMasterKey(await deriveKeyBytes('a long passphrase', salt, DESKTOP_KDF));
const ref = { type: 'note', id: 'n1' };
const blob = await encryptRecord(key, ref, 'hello');            // { iv, ciphertext }, both base64
console.log(await decryptRecordToString(key, ref, blob));       // 'hello'
```

`crypto.subtle` needs a secure context (HTTPS or localhost); otherwise the functions throw
`VaultError('NOT_SECURE_CONTEXT')`.

## Use it in your project

```sh
npm i github:titouannwtt/prompt-pipeline-core#v0.2.0     # npm builds dist/ on install (the `prepare` script)
```

1. **Serve `dist/` as is**, under `/core/<version>/`. Two files, byte for byte:
   `prompt-pipeline-core.js` and `argon2.worker.js`. Do not bundle, minify, rename or recompress them (a `.br` or
   `.gz` sidecar is fine, the decoded bytes must be identical): the whole point is that they match the published
   fingerprints. The worker is found next to the entry file (`new URL('./argon2.worker.js', import.meta.url)`), so keep
   them in the same folder.
2. **Import the served file**, not a copy inside your bundle. In a bundler, mark the module as external and rewrite it
   to the served path. With Vite/Rollup:
   ```js
   build: { rollupOptions: { external: ['prompt-pipeline-core'], output: { paths: { 'prompt-pipeline-core': '/core/0.2.0/prompt-pipeline-core.js' } } } }
   ```
   Types come from the package (`types` points to `src/index.ts`), so TypeScript works unchanged.
3. **Publish the manifest** at `/.well-known/prompt-pipeline-core.json`, which is what the verifier reads first:
   ```json
   {
     "name": "prompt-pipeline-core",
     "version": "0.2.0",
     "files": { "argon2.worker.js": "<sha256>", "prompt-pipeline-core.js": "<sha256>" },
     "base": "/core/0.2.0/",
     "repo": "https://github.com/titouannwtt/prompt-pipeline-core",
     "release": "https://github.com/titouannwtt/prompt-pipeline-core/releases/tag/v0.2.0"
   }
   ```
   `name`, `version` and `files` are `dist/manifest.json` as built; `base`, `repo` and `release` say where the files
   are and where they are published. `bin/verify.mjs` ignores `repo` (it always reads the official fingerprints from
   this repository), so the manifest cannot redirect a check elsewhere.
4. **Content-Security-Policy**: `script-src 'self' 'wasm-unsafe-eval'` (Argon2 runs in WebAssembly) and
   `worker-src 'self'`.

A complete page is in [`examples/minimal`](./examples/minimal): it encrypts and decrypts a text with a passphrase using
`dist/` and nothing else. After `npm run build`, serve the repository root with any static server and open
`/examples/minimal/` (ES modules do not load from `file://`):

```sh
python3 -m http.server 8000      # then http://localhost:8000/examples/minimal/
```

## Verify a site

Three levels, from the quickest to the most complete. Only the last two do not depend on code served by the site.

1. **One click, in the app.** Prompt Pipeline's "Verify it yourself" page hashes the module files it is serving and
   compares them to the site's manifest, then to the official fingerprints in this repository. Honest limit: this check
   runs inside code served by the operator, so a malicious operator could make it say "verified". It catches mistakes,
   stale deployments and tampering by a third party, not a determined operator.
2. **One command, outside the browser.** Node 22, no dependency:
   ```sh
   npx github:titouannwtt/prompt-pipeline-core https://prompt-pipeline.io
   # from a clone:  node bin/verify.mjs https://prompt-pipeline.io
   ```
   It reads `<site>/.well-known/prompt-pipeline-core.json`, downloads every listed file, computes the SHA-256 itself,
   compares it to the site's manifest, **then** to `releases/<version>/SHA256SUMS` at tag `v<version>` in this
   repository (through `raw.githubusercontent.com`). It prints a verdict and exits with `0` (identical), `1` (a
   difference), `2` (could not conclude). `--json` prints a machine-readable report; `--official <file|url>` reads the
   official list from elsewhere (offline tests). The same check by hand:
   ```sh
   curl -s https://prompt-pipeline.io/core/0.2.0/prompt-pipeline-core.js | sha256sum
   curl -s https://raw.githubusercontent.com/titouannwtt/prompt-pipeline-core/v0.2.0/releases/0.2.0/SHA256SUMS
   ```
3. **Rebuild everything.** Check that the official fingerprints are what the source produces:
   ```sh
   git clone --branch v0.2.0 https://github.com/titouannwtt/prompt-pipeline-core && cd prompt-pipeline-core
   npm ci && npm run build
   diff dist/SHA256SUMS releases/0.2.0/SHA256SUMS && echo "official fingerprints = this source"
   ```
   The build is deterministic (see below): same sources, same bytes. Then compare with the files the site serves
   (level 2). Reading the source is the last step: it is short.

There is also [`verify-bookmarklet.js`](./verify-bookmarklet.js), a one-click variant for any page of a site that serves
the module (same limit as level 1, it runs in the browser that talks to the site).

## Build and releases

`npm run build` writes `dist/`:

| File | Content |
| --- | --- |
| `prompt-pipeline-core.js` | ES module, `hash-wasm` bundled in, **not minified** (readable and diffable) |
| `argon2.worker.js` | the Argon2id Web Worker, loaded by the module from its own folder |
| `SHA256SUMS` | `sha256sum` format, one line per file above |
| `manifest.json` | `{ name, version, files: { <name>: <sha256> } }` |

Determinism comes from esbuild pinned to an exact version in `package-lock.json`, a fixed target, and nothing that
depends on the machine or the date: no timestamp, no absolute path. The test suite builds twice and compares bytes.

Official fingerprints live in the repository, one folder per version: `releases/<version>/SHA256SUMS`. A published
version never changes: a test fails when the sources no longer produce the committed fingerprints of the current
version. To release, bump `version` in `package.json`, run `npm run release` (writes `releases/<version>/SHA256SUMS`),
commit, and tag `v<version>`.

```sh
npm ci          # install (esbuild, hash-wasm, test tools)
npm run build   # dist/
npm test        # crypto, reproducible build, verifier (local fixture server, no network), example, official fingerprints
npm run typecheck
```

## License

Apache-2.0 (see [LICENSE](./LICENSE) and [NOTICE](./NOTICE), which also reproduces the MIT notice of the bundled
`hash-wasm`).
