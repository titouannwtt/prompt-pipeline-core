# vault-core

**The open-source cryptographic core of [Prompt Pipeline](https://prompt-pipeline.io).**

Prompt Pipeline is a zero-trust web workspace where developers store sensitive material — SSH/SQL/FTP
credentials, API keys, OAuth tokens, connection profiles. All of it is encrypted **in your browser** before it is
ever stored locally or synced to the server, using a passphrase that only you hold.

This repository is that encryption engine. It is published under **AGPL-3.0** so that anyone can read, audit, and
independently verify exactly how Prompt Pipeline protects user data — and confirm that the operator of
prompt-pipeline.io **cannot** read it.

## What this module does

It performs every cryptographic operation in the product:

- **Key derivation** from your passphrase — Argon2id (`hash-wasm`), run in a Web Worker, with calibrated
  memory/time parameters embedded in a versioned header.
- **Encryption / decryption** — AES-256-GCM via WebCrypto. The master key is a **non-extractable `CryptoKey`**:
  even a successful XSS that obtains the key object cannot export the raw bytes for offline cracking.
- **Authenticated, bound ciphertext** — each record's AEAD additional data is `pp|<fmt>|<type>|<id>`, which
  prevents object substitution and format downgrade. The GCM tag *is* the integrity check (no separate hash).
- **Safe encoding & randomness** — base64 helpers and `crypto.getRandomValues`-only random bytes.

The passphrase and the derived key are passed into these functions and **never leave the browser**. They are
never sent to any server, never written to network requests, and never persisted in extractable form.

## What you can verify

- **Cryptographic correctness (from source):** read this repository and confirm the algorithms, parameters, the
  non-extractable key, the per-record AAD, and that no code here transmits secrets anywhere.
- **That the running app uses this code:** Prompt Pipeline loads `vault-core` as a separately addressable module.
  Hash the bytes your browser actually loaded (DevTools → Network) and compare them to a reproducible build of this
  repository at the matching version. The trust anchor is this repository, not prompt-pipeline.io's server — and
  the comparison holds even when traffic passes through a CDN/proxy, because you hash what the browser received.
- **That plaintext never leaves (behavioral):** with DevTools open, confirm that your passphrase and decrypted
  data never appear in any outbound request; only ciphertext is stored or synced.

## Verify the running app (tools provided)

- **In-app page** — open prompt-pipeline.io, click the **"Verifiable"** badge in the footer (or append `?verify`).
  It hashes the bytes of the loaded `vault-core` chunk in your browser (SHA-256, WebCrypto) and shows the value to
  compare, plus links to this repo and its attestations.
- **Bookmarklet** — [`verify-bookmarklet.js`](./verify-bookmarklet.js) (readable source; the in-app page also shows a
  copyable one-liner). Click it on any page to print the loaded chunk's SHA-256 and the comparison.
- **SLSA provenance** — every tag/release runs [`.github/workflows/release.yml`](./.github/workflows/release.yml),
  which packs the module and produces a signed build-provenance attestation (GitHub OIDC → sigstore/Rekor). See the
  repo's **Attestations** tab. This anchors source→artifact integrity to a public, tamper-evident log.

**Honest limit:** the served chunk is bundled/minified by the (closed) frontend build, so reproducing its exact bytes
needs that build chain. The strong, repo-anchored guarantees are: the open source above, the SLSA provenance of the
package, and the behavioral network check — re-verify for each sensitive session.

## Public API (`src/index.ts`)

- `crypto/types` — `RecordType`, `KdfParams`, `EncryptedBlob`, `EncryptedRecord`, `VaultHeader`, `VaultError`.
- `crypto/random` — `getRandomBytes`.
- `crypto/encoding` — base64 / UTF-8 helpers.
- `crypto/aes-gcm` — `importMasterKey` (non-extractable), `encryptRecord`, `decryptRecordToString`, `encryptRaw`, `decryptRaw`.
- `crypto/kdf` — `deriveKeyBytes` (Argon2id, worker-offloaded), `calibrate`.
- `crypto/vault-header` — KDF defaults, format version, header validation.

## Install & test

```bash
npm install
npm run typecheck
npm test
```

## Portability

The module has no DOM dependencies, so the same engine can back a native mobile client: signing in with the same
account and entering the same passphrase yields the same key and the same decrypted vault across devices.

## License

AGPL-3.0-or-later (full text in [`LICENSE`](./LICENSE)). Network use of a derivative obliges you to publish the
corresponding source. This keeps the encryption auditable while deterring closed-source re-hosting of the service.
The copyright holder may use this code in their own (closed) product, as is standard for the author of the work.
