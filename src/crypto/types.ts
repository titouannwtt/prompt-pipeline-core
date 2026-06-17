// Types du coffre chiffré (phase 4). Aucun secret ici, uniquement des formes de données.

export type RecordType = 'aiProfile' | 'sshProfile' | 'sqlProfile' | 'ftpProfile' | 'githubProfile' | 'mcpConnection' | 'googleConnection' | 'project' | 'pipeline' | 'tab' | 'localFile';

/** Paramètres KDF embarqués dans l'en-tête du coffre (rétrocompat : le déverrouillage les relit). */
export interface KdfParams {
  algo: 'argon2id';
  v: number; // version Argon2 (0x13 = 19)
  m: number; // mémoire en KiB
  t: number; // itérations
  p: number; // parallélisme
}

/** Blob chiffré AES-GCM (iv + ciphertext incluant le tag), encodés base64. */
export interface EncryptedBlob {
  iv: string;
  ciphertext: string;
}

/** Enregistrement stocké en IndexedDB : meta EN CLAIR (non sensible) + payload CHIFFRÉ. */
export interface EncryptedRecord extends EncryptedBlob {
  id: string;
  type: RecordType;
  meta: Record<string, unknown>;
  fmt: number; // version de format d'enregistrement
}

/** En-tête du coffre stocké en clair dans la table meta (le salt n'est pas un secret). */
export interface VaultHeader {
  kdf: KdfParams;
  salt: string; // base64, 16 o
  verifier: EncryptedBlob; // chiffré d'une constante connue → vérifie le mot de passe
  fmt: number;
}

export type VaultErrorCode =
  | 'WRONG_PASSWORD'
  | 'VAULT_LOCKED'
  | 'KDF_FAILED'
  | 'NOT_SECURE_CONTEXT'
  | 'CORRUPT';

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  constructor(code: VaultErrorCode) {
    super(code);
    this.name = 'VaultError';
    this.code = code;
  }
}
