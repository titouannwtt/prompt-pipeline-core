# Build and releases

`npm run build` writes `dist/`:

| File | Content |
| --- | --- |
| `prompt-pipeline-core.js` | ES module, `hash-wasm` bundled in, **not minified** (readable and diffable) |
| `argon2.worker.js` | the Argon2id Web Worker, loaded by the module from its own folder |
| `SHA256SUMS` | `sha256sum` format, one line per file above |
| `manifest.json` | `{ name, version, files: { <name>: <sha256> } }` |

Determinism comes from esbuild pinned to an exact version in `package-lock.json`, a fixed target, and nothing that
depends on the machine or the date: no timestamp, no absolute path. The test suite builds twice and compares bytes.

Official fingerprints live in the repository, one folder per version: `releases/<version>/SHA256SUMS`. A published
version never changes: a test fails when the sources no longer produce the committed fingerprints of the current
version. To release, bump `version` in `package.json`, run `npm run release` (writes `releases/<version>/SHA256SUMS`),
commit, and tag `v<version>`.

```sh
npm ci          # install (esbuild, hash-wasm, test tools)
npm run build   # dist/
npm test        # crypto, reproducible build, verifier (local fixture server, no network), example, official fingerprints
npm run typecheck
```
