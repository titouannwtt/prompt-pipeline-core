// Runs the example's code (examples/minimal/lib.js) against the BUILT files in dist/, in Node.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROOT, buildCore } from '../scripts/build.mjs';

describe('examples/minimal', () => {
  let lib;
  beforeAll(async () => {
    await buildCore(); // dist/ is what the example imports
    lib = await import('../examples/minimal/lib.js');
  });

  it('encrypts then decrypts a text with a passphrase', async () => {
    const box = await lib.encryptText('un secret, 🔒', 'phrase secrète 1');
    expect(JSON.stringify(box)).not.toContain('secret');
    expect(await lib.decryptText(JSON.parse(JSON.stringify(box)), 'phrase secrète 1')).toBe('un secret, 🔒');
  });

  it('refuses a wrong passphrase and an altered box', async () => {
    const box = await lib.encryptText('hello', 'right');
    await expect(lib.decryptText(box, 'wrong')).rejects.toThrow();
    const tampered = { ...box, ciphertext: `${box.ciphertext.slice(0, -4)}AAAA` };
    await expect(lib.decryptText(tampered, 'right')).rejects.toThrow();
  });

  it('the page wires the script and the controls it uses', () => {
    const html = readFileSync(join(ROOT, 'examples/minimal/index.html'), 'utf8');
    const ui = readFileSync(join(ROOT, 'examples/minimal/ui.js'), 'utf8');
    expect(html).toContain('<script type="module" src="./ui.js">');
    for (const id of [...ui.matchAll(/\$\('([a-z]+)'\)/g)].map((m) => m[1]).concat('out')) expect(html).toContain(`id="${id}"`);
  });
});
