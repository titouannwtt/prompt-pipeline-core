// API publique du SDK Vault open-source (@pp/vault-core, AGPL-3.0-or-later).
//
// Frontière de confiance : c'est la SEULE partie du front qui manipule la phrase de chiffrement et le clair lors
// du (dé)chiffrement. Le reste du site (fermé) ne reçoit que du ciffré à l'écriture et du clair à la demande.
// Vérifiable au runtime : hasher le chunk chargé et le comparer au hash publié sur GitHub (cf. docs verify-it-yourself).
//
// Périmètre actuel (incrément 1) : crypto (Argon2id, AES-256-GCM, clé non-extractible, en-tête KDF).
// À venir : couche persistance chiffrée, client de sync (I/O ciffré), primitive iframe de saisie de la phrase.

export * from './crypto/types';
export * from './crypto/random';
export * from './crypto/encoding';
export * from './crypto/aes-gcm';
export * from './crypto/kdf';
export * from './crypto/vault-header';
