// Public API of vault-core (AGPL-3.0-or-later) — the cryptographic core of Prompt Pipeline.
//
// Every cryptographic operation lives here: passphrase → key derivation (Argon2id), AES-256-GCM with a
// non-extractable key, per-record authenticated encryption (AAD = pp|fmt|type|id), and the KDF header. The
// passphrase and key are passed in and never leave the browser. See README.md for how to verify the running app
// uses exactly this code.

export * from './crypto/types';
export * from './crypto/random';
export * from './crypto/encoding';
export * from './crypto/aes-gcm';
export * from './crypto/kdf';
export * from './crypto/vault-header';
