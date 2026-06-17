import type { KdfParams, VaultHeader } from './types';

// Version de format. Gravée dans l'AAD → tout changement de format casserait le déchiffrement
// (anti-downgrade), donc à ne PAS modifier sans plan de migration (phase 11 export).
export const FORMAT_VERSION = 1;

// Paramètres KDF de référence (desktop). m en KiB. Plancher mobile = 64 MiB.
export const DESKTOP_KDF: KdfParams = { algo: 'argon2id', v: 19, m: 262144, t: 3, p: 1 };
export const FLOOR_M_KIB = 65536; // 64 MiB

export function isKdfParams(x: unknown): x is KdfParams {
  if (typeof x !== 'object' || x === null) return false;
  const p = x as Record<string, unknown>;
  return p.algo === 'argon2id' && typeof p.m === 'number' && typeof p.t === 'number' && typeof p.p === 'number';
}

export function isVaultHeader(x: unknown): x is VaultHeader {
  if (typeof x !== 'object' || x === null) return false;
  const h = x as Record<string, unknown>;
  return (
    isKdfParams(h.kdf) &&
    typeof h.salt === 'string' &&
    typeof h.fmt === 'number' &&
    typeof h.verifier === 'object' &&
    h.verifier !== null
  );
}
