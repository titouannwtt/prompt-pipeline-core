// Writes releases/<version>/SHA256SUMS from a fresh build: the OFFICIAL fingerprints of a version, committed in
// this repository and read by bin/verify.mjs through raw.githubusercontent.com at tag v<version>.
// Refuses to overwrite a different file: a published version never changes (bump the version instead).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, buildCore } from './build.mjs';

const manifest = await buildCore();
const dir = join(ROOT, 'releases', manifest.version);
const target = join(dir, 'SHA256SUMS');
const fresh = readFileSync(join(ROOT, 'dist', 'SHA256SUMS'), 'utf8');
if (existsSync(target) && readFileSync(target, 'utf8') !== fresh) {
  console.error(`releases/${manifest.version}/SHA256SUMS exists and differs from the build. Bump the version in package.json.`);
  process.exit(1);
}
mkdirSync(dir, { recursive: true });
writeFileSync(target, fresh);
console.log(`releases/${manifest.version}/SHA256SUMS\n${fresh}`);
