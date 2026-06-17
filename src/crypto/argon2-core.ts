import { argon2id } from 'hash-wasm';
import type { KdfParams } from './types';

// Dérivation Argon2id PURE (testable headless en Node). Le Worker (argon2.worker.ts) l'appelle ;
// kdf.ts retombe dessus en l'absence de Worker (tests). Sortie : 32 octets (clé AES-256).
export async function deriveBytes(password: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m, // KiB
    hashLength: 32,
    outputType: 'binary',
  });
}
