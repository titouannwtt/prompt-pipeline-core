import { deriveBytes } from './argon2-core';
import type { KdfParams } from './types';

// Web Worker Argon2id : déporte le KDF (256 MiB ~1 s) hors du thread UI (sinon l'UI gèle).
interface Req {
  id: number;
  password: string;
  salt: Uint8Array;
  params: KdfParams;
}
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage: (m: unknown, transfer?: Transferable[]) => void;
};

ctx.onmessage = (e) => {
  const { id, password, salt, params } = e.data;
  deriveBytes(password, salt, params)
    .then((out) => {
      ctx.postMessage({ id, ok: true, out }, [out.buffer]);
      out.fill(0);
    })
    .catch((err: unknown) => {
      ctx.postMessage({ id, ok: false, error: String(err) });
    });
};
