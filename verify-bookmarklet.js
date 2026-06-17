// Prompt Pipeline — vault-core verification bookmarklet (readable source).
//
// What it does: on any prompt-pipeline.io page, it reads /version.json, fetches the isolated `vault-core` chunk
// that the browser actually loaded, computes its SHA-256 with WebCrypto, and shows it next to the published hash.
//
// Why: the cryptographic core runs in its OWN chunk (see the project's vite manualChunks). This lets you hash the
// exact bytes executing in your browser and compare them — OUT OF BAND — to a build of THIS public repository.
// The trust anchor is GitHub (source + SLSA provenance), never the operator's server. version.json is served by
// the operator, so the in-app "consistent/different" line is only a drift sanity-check; the meaningful step is
// comparing the printed SHA-256 against the public source yourself.
//
// How to install: create a new bookmark and paste the one-line `javascript:` version (printed below when you run
// `node verify-bookmarklet.js`, or copy it from the in-app "Verify it yourself" page) as its URL. Then click the
// bookmark while on prompt-pipeline.io.

async function verify() {
  try {
    const v = await (await fetch('/version.json', { cache: 'no-store' })).json();
    const r = v.vaultCore;
    if (!r) return alert('vault-core absent from version.json');
    const buf = await (await fetch(r.file, { cache: 'force-cache' })).arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const hex = [].map.call(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('');
    alert(
      'vault-core ' +
        r.file +
        '\n\nLoaded SHA-256:\n' +
        hex +
        '\n\nversion.json: ' +
        (hex === r.sha256 ? 'IDENTICAL' : 'DIFFERENT -> ' + r.sha256) +
        '\n\nCompare this SHA-256 against a build of the public repo:\n' +
        r.repo,
    );
  } catch (e) {
    alert('Verification failed: ' + e);
  }
}

// Running this file with Node prints the installable one-liner.
if (typeof window === 'undefined') {
  const oneLine = verify
    .toString()
    .replace(/\s*\/\/.*$/gm, '')
    .replace(/\n\s*/g, '');
  // eslint-disable-next-line no-console
  console.log('javascript:(' + oneLine + ')()');
} else {
  verify();
}
