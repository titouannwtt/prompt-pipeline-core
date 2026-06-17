import { deriveBytes } from './argon2-core';
import { getRandomBytes } from './random';
import { DESKTOP_KDF, FLOOR_M_KIB } from './vault-header';
import type { KdfParams } from './types';

// API thread principal. En navigateur : déporte la dérivation dans un Worker (UI fluide).
// En Node/tests (pas de Worker) : retombe sur deriveBytes inline.

let workerSingleton: Worker | null = null;
function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!workerSingleton) {
    workerSingleton = new Worker(new URL('./argon2.worker.ts', import.meta.url), { type: 'module' });
  }
  return workerSingleton;
}

let nextId = 0;

export function deriveKeyBytes(password: string, salt: Uint8Array, params: KdfParams): Promise<Uint8Array> {
  const worker = getWorker();
  if (!worker) return deriveBytes(password, salt, params);
  const id = ++nextId;
  return new Promise<Uint8Array>((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; ok: boolean; out?: ArrayBuffer; error?: string }>) => {
      if (e.data.id !== id) return;
      worker.removeEventListener('message', onMessage);
      if (e.data.ok && e.data.out) resolve(new Uint8Array(e.data.out));
      else reject(new Error(e.data.error ?? 'KDF_FAILED'));
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ id, password, salt, params });
  });
}

/**
 * Calibrage adaptatif (audit 04 §3.4) : part de m=256 MiB et réduit par paliers (→128→64) jusqu'à tenir
 * la cible de temps, sans descendre sous le plancher 64 MiB. Les params retenus sont embarqués dans l'en-tête.
 */
export async function calibrate(opts?: { startM?: number; targetMs?: number; floorM?: number }): Promise<KdfParams> {
  const targetMs = opts?.targetMs ?? 1500;
  const floorM = opts?.floorM ?? FLOOR_M_KIB;
  let m = opts?.startM ?? DESKTOP_KDF.m;
  const salt = getRandomBytes(16);

  for (;;) {
    const params: KdfParams = { algo: 'argon2id', v: 19, m, t: 3, p: 1 };
    const start = performance.now();
    try {
      await deriveKeyBytes('calibration-probe', salt, params);
    } catch {
      if (m <= floorM) return { algo: 'argon2id', v: 19, m: floorM, t: 3, p: 1 };
      m = Math.max(floorM, Math.floor(m / 2));
      continue;
    }
    const elapsed = performance.now() - start;
    if (elapsed <= targetMs * 1.4 || m <= floorM) return params;
    m = Math.max(floorM, Math.floor(m / 2));
  }
}
