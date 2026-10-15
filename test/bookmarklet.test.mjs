// verify-bookmarklet.js: the generated one-liner is a single clean line and, run against stubbed network, gives the right verdict.
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROOT, buildCore } from '../scripts/build.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ppc-bm-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const oneLiner = execFileSync(process.execPath, [join(ROOT, 'verify-bookmarklet.js')], { encoding: 'utf8' }).trimEnd();
let manifest;
let files;
let sums;

beforeAll(async () => {
  manifest = await buildCore({ outDir: join(tmp, 'dist') });
  files = Object.fromEntries(Object.keys(manifest.files).map((n) => [n, readFileSync(join(tmp, 'dist', n))]));
  sums = readFileSync(join(tmp, 'dist', 'SHA256SUMS'), 'utf8');
});

async function runBookmarklet({ tamper = false } = {}) {
  const base = `/core/${manifest.version}/`;
  const answers = {
    '/.well-known/prompt-pipeline-core.json': JSON.stringify({ ...manifest, base }),
    [`https://raw.githubusercontent.com/titouannwtt/prompt-pipeline-core/v${manifest.version}/releases/${manifest.version}/SHA256SUMS`]: sums,
  };
  for (const [n, b] of Object.entries(files)) {
    const bytes = Buffer.from(b);
    if (tamper && n === 'argon2.worker.js') bytes[3] ^= 1;
    answers[base + n] = bytes;
  }
  const alerts = [];
  const fetchStub = async (url) => {
    const body = answers[url];
    if (body === undefined) return { ok: false, status: 404 };
    return {
      ok: true,
      json: async () => JSON.parse(String(body)),
      text: async () => String(body),
      arrayBuffer: async () => new Uint8Array(body).buffer,
    };
  };
  const ctx = vm.createContext({ fetch: fetchStub, alert: (m) => alerts.push(m), crypto: webcrypto });
  await vm.runInContext(oneLiner.replace(/^javascript:/, ''), ctx);
  return alerts;
}

describe('verify-bookmarklet.js', () => {
  it('prints a single javascript: line without characters that break a bookmark URL', () => {
    expect(oneLiner.startsWith('javascript:(')).toBe(true);
    expect(oneLiner).not.toMatch(/[\n\r%]/);
  });

  it('says IDENTICAL when the site serves the official bytes', async () => {
    const [msg, ...rest] = await runBookmarklet();
    expect(rest).toEqual([]);
    expect(msg).toContain('IDENTICAL to the official release');
    expect(msg).not.toContain('DIFFERENT');
  });

  it('says DIFFERENT when one byte changes', async () => {
    const [msg] = await runBookmarklet({ tamper: true });
    expect(msg).toContain('DIFFERENT from the official release');
  });
});
