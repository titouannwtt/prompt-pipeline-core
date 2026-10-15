// bin/verify.mjs against a local fixture server: no network.
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROOT, buildCore } from '../scripts/build.mjs';

const BIN = join(ROOT, 'bin', 'verify.mjs');
const tmp = mkdtempSync(join(tmpdir(), 'ppc-verify-'));
let server;
let url;
let manifest;
let files; // name -> Buffer, the "site"
let routes; // path -> Buffer | string, reset before each test
let officialPath;

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [BIN, ...args], { timeout: 30_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

beforeAll(async () => {
  const dist = join(tmp, 'dist');
  manifest = await buildCore({ outDir: dist });
  files = Object.fromEntries(Object.keys(manifest.files).map((n) => [n, readFileSync(join(dist, n))]));
  officialPath = join(tmp, 'SHA256SUMS');
  writeFileSync(officialPath, readFileSync(join(dist, 'SHA256SUMS')));
  server = createServer((req, res) => {
    const body = routes[new URL(req.url, 'http://x').pathname];
    if (body === undefined) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200).end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  rmSync(tmp, { recursive: true, force: true });
});

const wellKnown = (over = {}) =>
  JSON.stringify({ ...manifest, base: `/core/${manifest.version}/`, repo: 'https://github.com/titouannwtt/prompt-pipeline-core', release: 'x', ...over });

beforeEach(() => {
  routes = { '/.well-known/prompt-pipeline-core.json': wellKnown() };
  for (const [n, b] of Object.entries(files)) routes[`/core/${manifest.version}/${n}`] = b;
});

describe('verify.mjs', () => {
  it('OK, exit 0, when the site serves the official bytes', async () => {
    const r = await run([url, '--official', officialPath]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('VERDICT: OK');
    expect(r.stdout).toContain('prompt-pipeline-core.js');
  });

  it('accepts the optional `verify` word and --json', async () => {
    const r = await run(['verify', url, '--official', officialPath, '--json']);
    expect(r.code).toBe(0);
    const j = JSON.parse(r.stdout);
    expect(j).toMatchObject({ ok: true, verdict: 'identical', version: manifest.version });
    expect(j.files.map((f) => f.status)).toEqual(['ok', 'ok']);
  });

  it('DIFFERENT, exit 1, when one served byte changes (manifest and official untouched)', async () => {
    const bad = Buffer.from(files['prompt-pipeline-core.js']);
    bad[10] ^= 1;
    routes[`/core/${manifest.version}/prompt-pipeline-core.js`] = bad;
    const r = await run([url, '--official', officialPath, '--json']);
    expect(r.code).toBe(1);
    const j = JSON.parse(r.stdout);
    expect(j.verdict).toBe('different');
    expect(j.files.find((f) => f.name === 'prompt-pipeline-core.js').status).toBe('differs-from-site-manifest');
    expect((await run([url, '--official', officialPath])).stdout).toContain('VERDICT: DIFFERENT');
  });

  it('DIFFERENT when the site rewrites its own manifest to match altered bytes (official catches it)', async () => {
    const bad = Buffer.from(files['argon2.worker.js']);
    bad[5] ^= 1;
    const { createHash } = await import('node:crypto');
    routes[`/core/${manifest.version}/argon2.worker.js`] = bad;
    routes['/.well-known/prompt-pipeline-core.json'] = wellKnown({
      files: { ...manifest.files, 'argon2.worker.js': createHash('sha256').update(bad).digest('hex') },
    });
    const j = JSON.parse((await run([url, '--official', officialPath, '--json'])).stdout);
    expect(j.verdict).toBe('different');
    expect(j.files.find((f) => f.name === 'argon2.worker.js').status).toBe('differs-from-official');
  });

  it('DIFFERENT when the site serves an extra file or omits an official one', async () => {
    routes['/core/extra.js'] = 'x';
    routes['/.well-known/prompt-pipeline-core.json'] = wellKnown({
      base: '/core/',
      files: { ...manifest.files, 'extra.js': 'a'.repeat(64) },
    });
    for (const n of Object.keys(files)) routes[`/core/${n}`] = files[n];
    let r = await run([url, '--official', officialPath, '--json']);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).files.map((f) => f.status)).toContain('differs-from-site-manifest');

    const { 'argon2.worker.js': _omit, ...rest } = manifest.files;
    routes['/.well-known/prompt-pipeline-core.json'] = wellKnown({ files: rest });
    r = await run([url, '--official', officialPath, '--json']);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.stdout).files.map((f) => f.status)).toContain('missing-on-site');
  });

  it('INCONCLUSIVE, exit 2, when the manifest is absent, malformed, or the official list unreadable', async () => {
    delete routes['/.well-known/prompt-pipeline-core.json'];
    let r = await run([url, '--official', officialPath]);
    expect(r.code).toBe(2);
    expect(r.stdout).toContain('VERDICT: INCONCLUSIVE');

    routes['/.well-known/prompt-pipeline-core.json'] = 'not json';
    expect((await run([url, '--official', officialPath])).code).toBe(2);

    routes['/.well-known/prompt-pipeline-core.json'] = wellKnown();
    expect((await run([url, '--official', join(tmp, 'missing')])).code).toBe(2);
  });

  it('rejects path traversal in file names and file URLs outside the origin', async () => {
    routes['/.well-known/prompt-pipeline-core.json'] = wellKnown({ files: { '../evil.js': 'a'.repeat(64) } });
    const r = await run([url, '--official', officialPath, '--json']);
    expect(r.code).toBe(2);
    expect(JSON.parse(r.stdout).error).toMatch(/unsafe file name/);
  });

  it('never reads the official list from the repository the site announces', async () => {
    routes['/.well-known/prompt-pipeline-core.json'] = wellKnown({ repo: 'https://github.com/evil/fork' });
    const j = JSON.parse((await run([url, '--official', officialPath, '--json'])).stdout);
    expect(j.verdict).toBe('identical');
    expect(j.notes.join(' ')).toMatch(/another repository/);
  });

  it('usage errors exit 2', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run([url, '--nope'])).code).toBe(2);
  });
});
