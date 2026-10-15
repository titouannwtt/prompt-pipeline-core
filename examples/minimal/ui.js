import { decryptText, encryptText } from './lib.js';

const $ = (id) => document.getElementById(id);
const out = $('out');

async function run(label, work) {
  out.textContent = `${label}...`;
  try {
    out.textContent = await work();
  } catch (e) {
    out.textContent = `Failed: ${e instanceof Error ? e.message : e}`;
  }
}

$('encrypt').addEventListener('click', () =>
  run('Encrypting', async () => {
    const box = await encryptText($('text').value, $('pass').value);
    $('box').value = JSON.stringify(box);
    return 'Encrypted. The JSON box below is all you need, plus the passphrase.';
  }),
);

$('decrypt').addEventListener('click', () =>
  run('Decrypting', async () => `Decrypted: ${await decryptText(JSON.parse($('box').value), $('pass').value)}`),
);
