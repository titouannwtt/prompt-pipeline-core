// SEUL point d'aléa du produit (audit 04 §3.7) : crypto.getRandomValues. JAMAIS Math.random.
export function getRandomBytes(n: number): Uint8Array {
  if (!Number.isInteger(n) || n <= 0) throw new Error('getRandomBytes: n doit être un entier > 0');
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}
