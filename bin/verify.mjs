#!/usr/bin/env node
// prompt-pipeline-core verifier. Node >= 22, no dependency.
//
//   npx github:titouannwtt/prompt-pipeline-core https://prompt-pipeline.io
//   node bin/verify.mjs <site-url> [--official <file|url>] [--json]
//
// What it does, from your own machine (not from the code a site serves you):
//   1. reads  <site>/.well-known/prompt-pipeline-core.json  (the site's claim: version, base path, file hashes);
//   2. downloads every file listed there and computes its SHA-256 itself;
//   3. checks the downloaded bytes against the site's own manifest;
//   4. checks them against the OFFICIAL fingerprints committed in the public repository
//      (releases/<version>/SHA256SUMS at tag v<version>, read through raw.githubusercontent.com).
// Step 4 is the one that matters: the official list does not come from the site. The repository is fixed in this
// file on purpose, the site cannot redirect you to another one.
//
// Exit code: 0 = identical to the official release, 1 = a difference was found, 2 = could not conclude (network,
// malformed answer, usage). `--json` prints one machine-readable object instead of the text report.
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const OFFICIAL_REPO = 'titouannwtt/prompt-pipeline-core';
const WELL_KNOWN = '.well-known/prompt-pipeline-core.json';
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const HASH_RE = /^[0-9a-f]{64}$/;
const TIMEOUT_MS = 20_000;

export const officialUrl = (version) =>
  `https://raw.githubusercontent.com/${OFFICIAL_REPO}/v${version}/releases/${version}/SHA256SUMS`;

const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

class Inconclusive extends Error {}

async function getBytes(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'cache-control': 'no-cache' } });
  } catch (e) {
    throw new Inconclusive(`cannot fetch ${url}: ${e?.cause?.code ?? e?.message ?? e}`);
  }
  if (!res.ok) throw new Inconclusive(`cannot fetch ${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Parses `sha256sum` output: `<64 hex>  <name>` or `<64 hex> *<name>`. Returns { name: hash }. */
export function parseSha256Sums(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line);
    if (!m) throw new Inconclusive(`malformed SHA256SUMS line: ${JSON.stringify(line.slice(0, 80))}`);
    out[m[2]] = m[1].toLowerCase();
  }
  return out;
}

async function loadOfficial(source, version) {
  const src = source ?? officialUrl(version);
  const isUrl = /^https?:\/\//i.test(src);
  let bytes;
  if (isUrl) bytes = await getBytes(src);
  else {
    try {
      bytes = await readFile(src);
    } catch (e) {
      throw new Inconclusive(`cannot read ${src}: ${e.code ?? e.message}`);
    }
  }
  return { source: src, hashes: parseSha256Sums(new TextDecoder().decode(bytes)) };
}

/**
 * Verifies a site. Never throws for a difference: returns a report with `verdict` in
 * 'identical' | 'different' | 'inconclusive'.
 */
export async function verifySite(siteUrl, { official } = {}) {
  const report = { site: siteUrl, version: null, manifestUrl: null, official: null, files: [], notes: [], verdict: 'inconclusive', error: null };
  try {
    const base = new URL(siteUrl);
    if (!/^https?:$/.test(base.protocol)) throw new Inconclusive(`unsupported URL scheme: ${base.protocol}`);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
    if (base.protocol !== 'https:' && !loopback) report.notes.push('The site is served over plain HTTP: the answer cannot be trusted.');

    report.manifestUrl = new URL(WELL_KNOWN, base).href;
    let manifest;
    try {
      manifest = JSON.parse(new TextDecoder().decode(await getBytes(report.manifestUrl)));
    } catch (e) {
      if (e instanceof Inconclusive) throw e;
      throw new Inconclusive(`${report.manifestUrl} is not valid JSON`);
    }
    if (!manifest || typeof manifest.version !== 'string' || !VERSION_RE.test(manifest.version)) throw new Inconclusive('manifest: missing or invalid "version"');
    if (typeof manifest.base !== 'string' || !manifest.base.startsWith('/')) throw new Inconclusive('manifest: missing or invalid "base" (expected an absolute path such as /core/0.2.0/)');
    if (!manifest.files || typeof manifest.files !== 'object' || Object.keys(manifest.files).length === 0) throw new Inconclusive('manifest: missing "files"');
    report.version = manifest.version;
    if (manifest.repo && !String(manifest.repo).replace(/\/+$/, '').endsWith(`github.com/${OFFICIAL_REPO}`)) {
      report.notes.push(`The site points to another repository (${manifest.repo}). Ignored: the official fingerprints are always read from ${OFFICIAL_REPO}.`);
    }

    const off = await loadOfficial(official, manifest.version);
    report.official = off.source;

    for (const [name, claimed] of Object.entries(manifest.files)) {
      if (!NAME_RE.test(name)) throw new Inconclusive(`manifest: unsafe file name ${JSON.stringify(name)}`);
      const file = { name, served: null, manifest: String(claimed).toLowerCase(), official: off.hashes[name] ?? null, status: 'ok' };
      const url = new URL(manifest.base.replace(/\/?$/, '/') + name, base).href;
      if (new URL(url).origin !== base.origin) throw new Inconclusive(`manifest: file URL leaves the site origin (${url})`);
      try {
        file.served = sha256Hex(await getBytes(url));
      } catch (e) {
        file.status = 'unreachable';
        file.detail = e.message;
        report.files.push(file);
        continue;
      }
      if (!HASH_RE.test(file.manifest) || file.served !== file.manifest) file.status = 'differs-from-site-manifest';
      else if (!file.official) file.status = 'not-in-official-release';
      else if (file.served !== file.official) file.status = 'differs-from-official';
      report.files.push(file);
    }
    for (const [name, hash] of Object.entries(off.hashes)) {
      if (!(name in manifest.files)) report.files.push({ name, served: null, manifest: null, official: hash, status: 'missing-on-site' });
    }

    // A proven difference wins over a file that could not be fetched.
    if (report.files.some((f) => f.status !== 'ok' && f.status !== 'unreachable')) report.verdict = 'different';
    else report.verdict = report.files.every((f) => f.status === 'ok') ? 'identical' : 'inconclusive';
  } catch (e) {
    if (!(e instanceof Inconclusive) && !(e instanceof TypeError)) throw e;
    report.error = e.message;
    report.verdict = 'inconclusive';
  }
  return report;
}

const LABEL = {
  ok: 'OK      ',
  'differs-from-site-manifest': 'DIFFERS ',
  'differs-from-official': 'DIFFERS ',
  'not-in-official-release': 'UNKNOWN ',
  'missing-on-site': 'MISSING ',
  unreachable: 'ERROR   ',
};
const EXPLAIN = {
  ok: 'served bytes == site manifest == official release',
  'differs-from-site-manifest': 'served bytes differ from what the site itself announces',
  'differs-from-official': 'served bytes differ from the official release',
  'not-in-official-release': 'file absent from the official release',
  'missing-on-site': 'official file not served by the site',
};

export function renderText(r) {
  const lines = [`prompt-pipeline-core verification of ${r.site}`];
  if (r.version) lines.push(`  site claims version ${r.version}`);
  if (r.official) lines.push(`  official fingerprints: ${r.official}`);
  lines.push('');
  for (const f of r.files) {
    lines.push(`  ${LABEL[f.status] ?? f.status}${f.name}`);
    lines.push(`            served   ${f.served ?? '-'}`);
    lines.push(`            site     ${f.manifest ?? '-'}`);
    lines.push(`            official ${f.official ?? '-'}`);
    if (f.status !== 'ok') lines.push(`            ${f.detail ?? EXPLAIN[f.status]}`);
  }
  for (const n of r.notes) lines.push('', `  note: ${n}`);
  lines.push('');
  if (r.verdict === 'identical') lines.push(`VERDICT: OK. ${r.site} serves exactly prompt-pipeline-core ${r.version}, byte for byte.`);
  else if (r.verdict === 'different') lines.push('VERDICT: DIFFERENT. The code served by this site is NOT the official release. Do not enter a secret there.');
  else lines.push(`VERDICT: INCONCLUSIVE. ${r.error ?? 'Some files could not be checked.'}`);
  return lines.join('\n');
}

const USAGE = `Usage: prompt-pipeline-core [verify] <site-url> [--official <file|url>] [--json]

  <site-url>           e.g. https://prompt-pipeline.io
  --official <src>     official SHA256SUMS (file or URL) instead of the one on raw.githubusercontent.com (offline tests)
  --json               machine-readable report
Exit code: 0 identical, 1 different, 2 inconclusive or usage error.`;

export async function main(argv) {
  const args = argv[0] === 'verify' ? argv.slice(1) : argv;
  let site = null;
  let official;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') json = true;
    else if (a === '--official') official = args[++i];
    else if (a === '-h' || a === '--help') {
      console.log(USAGE);
      return 0;
    } else if (a.startsWith('-') || site) {
      console.error(`Unexpected argument: ${a}\n\n${USAGE}`);
      return 2;
    } else site = a;
  }
  if (!site || (official !== undefined && !official)) {
    console.error(USAGE);
    return 2;
  }
  const report = await verifySite(site, { official });
  console.log(json ? JSON.stringify({ ok: report.verdict === 'identical', ...report }, null, 2) : renderText(report));
  return report.verdict === 'identical' ? 0 : report.verdict === 'different' ? 1 : 2;
}

// realpath: `npx` runs this file through a symlink in node_modules/.bin.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
