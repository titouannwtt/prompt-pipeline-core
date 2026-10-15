// prompt-pipeline-core verification bookmarklet (readable source).
//
// What it does, on any page of a site that serves prompt-pipeline-core:
//   1. reads /.well-known/prompt-pipeline-core.json (what the site claims to serve);
//   2. downloads each listed file and computes its SHA-256 (WebCrypto);
//   3. compares it to the site's manifest AND to the official fingerprints committed in this repository
//      (releases/<version>/SHA256SUMS at tag v<version>, read from raw.githubusercontent.com).
// The official repository is fixed below on purpose: the site cannot point you to another list.
//
// Honest limit: a bookmarklet runs inside the page you are checking, in a browser the site talks to. A site that
// wanted to lie could try to tamper with it. For an independent proof, run `npx github:titouannwtt/prompt-pipeline-core <site>`
// (bin/verify.mjs) or `curl -s <site>/core/<version>/prompt-pipeline-core.js | sha256sum` outside the browser.
//
// Install: create a bookmark and paste the one-line `javascript:` version as its URL. `node verify-bookmarklet.js`
// prints that line (the in-app "Verify it yourself" page shows the same one). Then click it on the site.
//
// Write this function with semicolons, no `%`, and only whole-line comments: the one-liner is built by joining lines.

async function verify() {
  try {
    var m = await (await fetch('/.well-known/prompt-pipeline-core.json', { cache: 'no-store' })).json();
    var sums = await (await fetch('https://raw.githubusercontent.com/titouannwtt/prompt-pipeline-core/v' + m.version + '/releases/' + m.version + '/SHA256SUMS', { cache: 'no-store' })).text();
    var official = {};
    sums.split('\n').forEach(function (l) {
      var p = l.trim().split(/ [ *]/);
      if (p.length === 2) official[p[1]] = p[0];
    });
    var ok = true;
    var out = [];
    for (var n in m.files) {
      var b = await (await fetch(m.base + n, { cache: 'force-cache' })).arrayBuffer();
      var h = [].map.call(new Uint8Array(await crypto.subtle.digest('SHA-256', b)), function (x) {
        return x.toString(16).padStart(2, '0');
      }).join('');
      var good = h === m.files[n] && h === official[n];
      ok = ok && good;
      out.push((good ? 'OK        ' : 'DIFFERENT ') + n + '\n' + h);
    }
    Object.keys(official).forEach(function (n) {
      if (!(n in m.files)) {
        ok = false;
        out.push('MISSING   ' + n);
      }
    });
    alert(
      'prompt-pipeline-core ' + m.version + '\n\n' + out.join('\n\n') + '\n\n' +
        (ok ? 'IDENTICAL to the official release.' : 'DIFFERENT from the official release. Do not enter a secret here.') +
        '\n\nThis check runs inside the page it checks. For an independent proof use: npx github:titouannwtt/prompt-pipeline-core <site>'
    );
  } catch (e) {
    alert('Verification failed: ' + e);
  }
}

// Running this file with Node prints the installable one-liner (comment lines dropped, lines joined).
if (typeof window === 'undefined') {
  const oneLine = verify
    .toString()
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\n\s*/g, '');
  // eslint-disable-next-line no-console
  console.log('javascript:(' + oneLine + ')()');
} else {
  verify();
}
