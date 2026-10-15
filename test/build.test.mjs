import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { ROOT, buildCore, sha256 } from '../scripts/build.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'ppc-build-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const read = (dir, name) => readFileSync(join(dir, name));

describe('build', () => {
  it('is deterministic: two builds give identical bytes', async () => {
    const a = join(tmp, 'a');
    const b = join(tmp, 'b');
    await buildCore({ outDir: a });
    await buildCore({ outDir: b });
    const names = readdirSync(a).sort();
    expect(names).toEqual(['SHA256SUMS', 'argon2.worker.js', 'manifest.json', 'prompt-pipeline-core.js']);
    expect(readdirSync(b).sort()).toEqual(names);
    for (const n of names) expect(read(a, n).equals(read(b, n))).toBe(true);
  });

  it('SHA256SUMS and manifest.json agree with the files', async () => {
    const dir = join(tmp, 'c');
    const manifest = await buildCore({ outDir: dir });
    expect(manifest.name).toBe('prompt-pipeline-core');
    expect(manifest.version).toBe(pkg.version);
    expect(Object.keys(manifest.files)).toEqual(['argon2.worker.js', 'prompt-pipeline-core.js']);
    expect(JSON.parse(read(dir, 'manifest.json').toString())).toEqual(manifest);
    const sums = read(dir, 'SHA256SUMS').toString().trimEnd().split('\n');
    expect(sums).toHaveLength(2);
    for (const line of sums) {
      const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
      expect(m, line).not.toBeNull();
      expect(sha256(read(dir, m[2]))).toBe(m[1]);
      expect(manifest.files[m[2]]).toBe(m[1]);
    }
  });

  it('embeds no absolute path, no timestamp, no process.env', async () => {
    const dir = join(tmp, 'd');
    await buildCore({ outDir: dir });
    for (const n of ['prompt-pipeline-core.js', 'argon2.worker.js']) {
      const src = read(dir, n).toString();
      expect(src).not.toContain(ROOT);
      expect(src).not.toMatch(/process\.env|Date\.now\(\)\s*\/\/ build/);
    }
  });

  it('the entry file locates its worker next to itself', async () => {
    const dir = join(tmp, 'e');
    await buildCore({ outDir: dir });
    expect(read(dir, 'prompt-pipeline-core.js').toString()).toContain('new URL("./argon2.worker.js", import.meta.url)');
  });

  it('the built entry file really encrypts and decrypts (same output as the sources)', async () => {
    const dir = join(tmp, 'f');
    await buildCore({ outDir: dir });
    const built = await import(pathToFileURL(join(dir, 'prompt-pipeline-core.js')).href);
    const src = await import('../src/index.ts');
    const kdf = { algo: 'argon2id', v: 19, m: 8192, t: 1, p: 1 };
    const salt = new Uint8Array(16).fill(7);
    const kBuilt = await built.deriveKeyBytes('a passphrase', salt, kdf);
    const kSrc = await src.deriveKeyBytes('a passphrase', salt, kdf);
    expect([...kBuilt]).toEqual([...kSrc]);
    const key = await built.importMasterKey(kBuilt);
    const ref = { type: 'note', id: 'n1' };
    const blob = await built.encryptRecord(key, ref, 'héllo');
    expect(await built.decryptRecordToString(key, ref, blob)).toBe('héllo');
    await expect(built.decryptRecordToString(key, { type: 'note', id: 'n2' }, blob)).rejects.toThrow();
  });
});

describe('official fingerprints', () => {
  it('releases/<version>/SHA256SUMS matches the build of the current sources', async () => {
    // Fails when the sources changed without a version bump: a published version never changes.
    const dir = join(tmp, 'g');
    await buildCore({ outDir: dir });
    const official = readFileSync(join(ROOT, 'releases', pkg.version, 'SHA256SUMS'), 'utf8');
    expect(official).toBe(read(dir, 'SHA256SUMS').toString());
  });
});
