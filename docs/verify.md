# Verify a site

Three levels, from the quickest to the most complete. Only the last two do not depend on code served by the site.

1. **One click, in the app.** Prompt Pipeline's "Verify it yourself" page hashes the module files it is serving and
   compares them to the site's manifest, then to the official fingerprints in this repository. Honest limit: this check
   runs inside code served by the operator, so a malicious operator could make it say "verified". It catches mistakes,
   stale deployments and tampering by a third party, not a determined operator.
2. **One command, outside the browser.** Node 22, no dependency:
   ```sh
   npx github:titouannwtt/prompt-pipeline-core https://prompt-pipeline.io
   # from a clone:  node bin/verify.mjs https://prompt-pipeline.io
   ```
   It reads `<site>/.well-known/prompt-pipeline-core.json`, downloads every listed file, computes the SHA-256 itself,
   compares it to the site's manifest, **then** to `releases/<version>/SHA256SUMS` at tag `v<version>` in this
   repository (through `raw.githubusercontent.com`). It prints a verdict and exits with `0` (identical), `1` (a
   difference), `2` (could not conclude). `--json` prints a machine-readable report; `--official <file|url>` reads the
   official list from elsewhere (offline tests). The same check by hand:
   ```sh
   curl -s https://prompt-pipeline.io/core/0.2.0/prompt-pipeline-core.js | sha256sum
   curl -s https://raw.githubusercontent.com/titouannwtt/prompt-pipeline-core/v0.2.0/releases/0.2.0/SHA256SUMS
   ```
3. **Rebuild everything.** Check that the official fingerprints are what the source produces:
   ```sh
   git clone --branch v0.2.0 https://github.com/titouannwtt/prompt-pipeline-core && cd prompt-pipeline-core
   npm ci && npm run build
   diff dist/SHA256SUMS releases/0.2.0/SHA256SUMS && echo "official fingerprints = this source"
   ```
   The build is deterministic (see [Build and releases](build-and-releases.md)): same sources, same bytes. Then compare with the files the site serves
   (level 2). Reading the source is the last step: it is short.

There is also [`verify-bookmarklet.js`](../verify-bookmarklet.js), a one-click variant for any page of a site that serves
the module (same limit as level 1, it runs in the browser that talks to the site).
