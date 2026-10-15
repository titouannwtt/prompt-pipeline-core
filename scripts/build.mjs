// Deterministic build of prompt-pipeline-core. Run with `npm run build`.
//
// Output (dist/):
//   prompt-pipeline-core.js  ESM entry point, hash-wasm bundled in, NOT minified (readable and diffable)
//   argon2.worker.js         ESM Web Worker, loaded by the entry point as `new URL('./argon2.worker.js', import.meta.url)`
//   SHA256SUMS               `sha256sum`-format fingerprints of the two files above
//   manifest.json            { name, version, files: { <name>: <sha256> } }
//
// Determinism: esbuild pinned to an exact version in package-lock.json, fixed target, no timestamp, no absolute
// path (paths in the bundle comments are relative to the package root). Two builds give identical bytes.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ENTRIES = {
  'prompt-pipeline-core.js': 'src/index.ts',
  'argon2.worker.js': 'src/crypto/argon2.worker.ts',
};

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Builds into `outDir` (default: dist/) and returns the manifest. Wipes `outDir` first. */
export async function buildCore({ outDir = join(ROOT, 'dist') } = {}) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const files = {};
  for (const [name, entry] of Object.entries(ENTRIES)) {
    const result = await build({
      absWorkingDir: ROOT,
      entryPoints: [entry],
      outfile: name,
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      minify: false,
      sourcemap: false,
      legalComments: 'eof',
      charset: 'utf8',
      logLevel: 'silent',
    });
    const out = result.outputFiles.find((f) => f.path.endsWith(name));
    if (!out) throw new Error(`esbuild produced no output for ${name}`);
    writeFileSync(join(outDir, name), out.contents);
    files[name] = sha256(out.contents);
  }

  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1)));
  const sums = Object.entries(sorted).map(([name, hash]) => `${hash}  ${name}\n`).join('');
  writeFileSync(join(outDir, 'SHA256SUMS'), sums);
  const manifest = { name: pkg.name, version: pkg.version, files: sorted };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const m = await buildCore();
  console.log(`[prompt-pipeline-core] ${m.name} ${m.version}`);
  for (const [name, hash] of Object.entries(m.files)) console.log(`  ${hash}  ${name}`);
}
