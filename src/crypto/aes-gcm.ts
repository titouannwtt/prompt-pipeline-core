import { getRandomBytes } from './random';
import { utf8ToBytes, bytesToUtf8, bytesToBase64, base64ToBytes } from './encoding';
import { FORMAT_VERSION } from './vault-header';
import type { EncryptedBlob } from './types';

// AES-256-GCM via WebCrypto. La clé maître est un CryptoKey NON-EXTRACTIBLE : une XSS qui obtient
// l'objet ne peut pas lire les octets pour cracker hors-ligne (audit 04 §3.5). AEAD = intégrité (tag GCM)
// → AUCUN hash SHA-512 séparé. IV 12 o UNIQUE par message (réutilisation = catastrophe GCM).

// WebCrypto attend des BufferSource « ArrayBuffer-backed » ; nos Uint8Array le sont (jamais SharedArrayBuffer).
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

export async function importMasterKey(bytes: Uint8Array): Promise<CryptoKey> {
  const key = await crypto.subtle.importKey('raw', buf(bytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  bytes.fill(0); // réduit la surface (best-effort, pas une garantie — GC non maîtrisable)
  return key;
}

/** Chiffrement bas niveau avec AAD arbitraire (réutilisé par l'export, phase 11). */
export async function encryptRaw(key: CryptoKey, plaintext: Uint8Array, aad: Uint8Array): Promise<EncryptedBlob> {
  const iv = getRandomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad) }, key, buf(plaintext));
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ct)) };
}

export async function decryptRaw(key: CryptoKey, blob: EncryptedBlob, aad: Uint8Array): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(base64ToBytes(blob.iv)), additionalData: buf(aad) },
    key,
    buf(base64ToBytes(blob.ciphertext)),
  );
  return new Uint8Array(pt);
}

// AAD = pp|fmt|type|id → empêche la substitution d'objets (déchiffrer le blob de A en se faisant passer
// pour B échoue) et lie le format (anti-downgrade).
function recordAad(type: string, id: string, fmt: number): Uint8Array {
  return utf8ToBytes(`pp|${fmt}|${type}|${id}`);
}

export interface RecordRef {
  type: string;
  id: string;
  fmt?: number;
}

export function encryptRecord(key: CryptoKey, ref: RecordRef, plaintext: string): Promise<EncryptedBlob> {
  return encryptRaw(key, utf8ToBytes(plaintext), recordAad(ref.type, ref.id, ref.fmt ?? FORMAT_VERSION));
}

export async function decryptRecordToString(key: CryptoKey, ref: RecordRef, blob: EncryptedBlob): Promise<string> {
  return bytesToUtf8(await decryptRaw(key, blob, recordAad(ref.type, ref.id, ref.fmt ?? FORMAT_VERSION)));
}
