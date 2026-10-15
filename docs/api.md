# API

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
