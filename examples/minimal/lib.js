// Minimal use of prompt-pipeline-core: passphrase -> key -> encrypt / decrypt a text. No framework, no bundler.
// The import below is the built file, exactly as a site would serve it (see ../../README.md).
import {
  DESKTOP_KDF,
  FLOOR_M_KIB,
  base64ToBytes,
  bytesToBase64,
  decryptRecordToString,
  deriveKeyBytes,
  encryptRecord,
  getRandomBytes,
  importMasterKey,
} from '../../dist/prompt-pipeline-core.js';

const REF = { type: 'note', id: 'example' }; // bound into the ciphertext (AAD): a blob cannot be replayed as another record
const KDF = { ...DESKTOP_KDF, m: FLOOR_M_KIB }; // 64 MiB Argon2id: fast enough for a demo

async function keyFor(passphrase, salt, kdf) {
  // Argon2id runs in a Web Worker in a browser (dist/argon2.worker.js, next to the entry file), inline in Node.
  return importMasterKey(await deriveKeyBytes(passphrase, salt, kdf)); // non-extractable CryptoKey
}

/** Returns a JSON-safe box: everything needed to decrypt later, except the passphrase. */
export async function encryptText(text, passphrase) {
  const salt = getRandomBytes(16);
  const key = await keyFor(passphrase, salt, KDF);
  const { iv, ciphertext } = await encryptRecord(key, REF, text);
  return { kdf: KDF, salt: bytesToBase64(salt), iv, ciphertext };
}

/** Throws if the passphrase is wrong or the box was altered (AES-GCM authentication). */
export async function decryptText(box, passphrase) {
  const key = await keyFor(passphrase, base64ToBytes(box.salt), box.kdf);
  return decryptRecordToString(key, REF, { iv: box.iv, ciphertext: box.ciphertext });
}
