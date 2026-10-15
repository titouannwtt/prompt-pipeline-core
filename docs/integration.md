# Use it in your project

```sh
npm i github:titouannwtt/prompt-pipeline-core#v0.2.0     # npm builds dist/ on install (the `prepare` script)
```

1. **Serve `dist/` as is**, under `/core/<version>/`. Two files, byte for byte:
   `prompt-pipeline-core.js` and `argon2.worker.js`. Do not bundle, minify, rename or recompress them (a `.br` or
   `.gz` sidecar is fine, the decoded bytes must be identical): the whole point is that they match the published
   fingerprints. The worker is found next to the entry file (`new URL('./argon2.worker.js', import.meta.url)`), so keep
   them in the same folder.
2. **Import the served file**, not a copy inside your bundle. In a bundler, mark the module as external and rewrite it
   to the served path. With Vite/Rollup:
   ```js
   build: { rollupOptions: { external: ['prompt-pipeline-core'], output: { paths: { 'prompt-pipeline-core': '/core/0.2.0/prompt-pipeline-core.js' } } } }
   ```
   Types come from the package (`types` points to `src/index.ts`), so TypeScript works unchanged.
3. **Publish the manifest** at `/.well-known/prompt-pipeline-core.json`, which is what the verifier reads first:
   ```json
   {
     "name": "prompt-pipeline-core",
     "version": "0.2.0",
     "files": { "argon2.worker.js": "<sha256>", "prompt-pipeline-core.js": "<sha256>" },
     "base": "/core/0.2.0/",
     "repo": "https://github.com/titouannwtt/prompt-pipeline-core",
     "release": "https://github.com/titouannwtt/prompt-pipeline-core/releases/tag/v0.2.0"
   }
   ```
   `name`, `version` and `files` are `dist/manifest.json` as built; `base`, `repo` and `release` say where the files
   are and where they are published. `bin/verify.mjs` ignores `repo` (it always reads the official fingerprints from
   this repository), so the manifest cannot redirect a check elsewhere.
4. **Content-Security-Policy**: `script-src 'self' 'wasm-unsafe-eval'` (Argon2 runs in WebAssembly) and
   `worker-src 'self'`.

A complete page is in [`examples/minimal`](../examples/minimal): it encrypts and decrypts a text with a passphrase using
`dist/` and nothing else. After `npm run build`, serve the repository root with any static server and open
`/examples/minimal/` (ES modules do not load from `file://`):

```sh
python3 -m http.server 8000      # then http://localhost:8000/examples/minimal/
```
