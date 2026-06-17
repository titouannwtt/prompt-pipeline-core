// Encodage sans dépendance (TextEncoder/Decoder + base64 via btoa/atob, dispos navigateur + Node 22).
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function utf8ToBytes(s: string): Uint8Array {
  return encoder.encode(s);
}

export function bytesToUtf8(b: Uint8Array): string {
  return decoder.decode(b);
}

export function bytesToBase64(b: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < b.length; i++) binary += String.fromCharCode(b[i]!);
  return btoa(binary);
}

export function base64ToBytes(s: string): Uint8Array {
  const binary = atob(s);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
