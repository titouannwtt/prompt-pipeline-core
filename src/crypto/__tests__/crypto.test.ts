// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { getRandomBytes } from '../random';
import { utf8ToBytes, bytesToUtf8, bytesToBase64, base64ToBytes } from '../encoding';
import { deriveKeyBytes, calibrate } from '../kdf';
import {
  importMasterKey,
  encryptRecord,
  decryptRecordToString,
  encryptRaw,
  decryptRaw,
} from '../aes-gcm';
import type { KdfParams } from '../types';

const SMALL: KdfParams = { algo: 'argon2id', v: 19, m: 8192, t: 1, p: 1 }; // 8 MiB, rapide pour les tests

async function freshKey() {
  return importMasterKey(getRandomBytes(32));
}

describe('encoding', () => {
  it('round-trip base64 et utf8', () => {
    const b = getRandomBytes(40);
    expect([...base64ToBytes(bytesToBase64(b))]).toEqual([...b]);
    expect(bytesToUtf8(utf8ToBytes('héllo 🔒'))).toBe('héllo 🔒');
  });
});

describe('random', () => {
  it('renvoie la bonne taille et refuse n<=0', () => {
    expect(getRandomBytes(16).length).toBe(16);
    expect(() => getRandomBytes(0)).toThrow();
    expect(() => getRandomBytes(-1)).toThrow();
  });
});

describe('aes-gcm', () => {
  it('round-trip enregistrement', async () => {
    const key = await freshKey();
    const blob = await encryptRecord(key, { type: 'aiProfile', id: 'a1' }, 'token-secret');
    expect(await decryptRecordToString(key, { type: 'aiProfile', id: 'a1' }, blob)).toBe('token-secret');
  });

  it('IV unique : deux chiffrements du même clair diffèrent', async () => {
    const key = await freshKey();
    const b1 = await encryptRecord(key, { type: 'aiProfile', id: 'a1' }, 'x');
    const b2 = await encryptRecord(key, { type: 'aiProfile', id: 'a1' }, 'x');
    expect(b1.iv).not.toBe(b2.iv);
    expect(b1.ciphertext).not.toBe(b2.ciphertext);
  });

  it('ciphertext altéré → throw', async () => {
    const key = await freshKey();
    const blob = await encryptRecord(key, { type: 'aiProfile', id: 'a1' }, 'secret');
    const bytes = base64ToBytes(blob.ciphertext);
    bytes[0]! ^= 0xff;
    await expect(
      decryptRecordToString(key, { type: 'aiProfile', id: 'a1' }, { ...blob, ciphertext: bytesToBase64(bytes) }),
    ).rejects.toThrow();
  });

  it('AAD mismatch (mauvais id) → throw : pas de substitution d’objets', async () => {
    const key = await freshKey();
    const blob = await encryptRecord(key, { type: 'aiProfile', id: 'A' }, 'secret');
    await expect(decryptRecordToString(key, { type: 'aiProfile', id: 'B' }, blob)).rejects.toThrow();
  });

  it('clé NON-EXTRACTIBLE : exportKey rejette', async () => {
    const key = await freshKey();
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });
});

describe('kdf (Argon2id)', () => {
  it('déterministe : mêmes (pw, salt, params) → mêmes octets', async () => {
    const salt = getRandomBytes(16);
    const a = await deriveKeyBytes('motdepasse', salt, SMALL);
    const b = await deriveKeyBytes('motdepasse', salt, SMALL);
    expect(a.length).toBe(32);
    expect([...a]).toEqual([...b]);
    const c = await deriveKeyBytes('autre', salt, SMALL);
    expect([...a]).not.toEqual([...c]);
  });

  it('calibrate renvoie des params dans les bornes', async () => {
    const params = await calibrate({ startM: 8192, targetMs: 100_000, floorM: 8192 });
    expect(params.algo).toBe('argon2id');
    expect(params.t).toBe(3);
    expect(params.p).toBe(1);
    expect(params.m).toBeGreaterThanOrEqual(8192);
  });
});

describe('property-based (fast-check)', () => {
  it('decrypt(encrypt(x)) === x pour tout clair', async () => {
    const key = await freshKey();
    const aad = utf8ToBytes('aad');
    await fc.assert(
      fc.asyncProperty(fc.uint8Array({ maxLength: 512 }), async (data) => {
        const blob = await encryptRaw(key, data, aad);
        const back = await decryptRaw(key, blob, aad);
        return [...back].join(',') === [...data].join(',');
      }),
      { numRuns: 25 },
    );
  });
});
