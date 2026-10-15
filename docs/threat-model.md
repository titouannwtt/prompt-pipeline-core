# Threat model

What this module guarantees, as long as the page that loads it is the page you verified:

- The passphrase and the derived key are passed in and never leave the browser. The module makes no network request.
- Only ciphertext (IV + ciphertext with GCM tag) and non-sensitive metadata need to leave the device. Whoever stores
  the ciphertext cannot decrypt it without the passphrase.
- Argon2id parameters live in the header, with a 64 MiB floor, so a stolen ciphertext is costly to attack offline.
- GCM authenticates every record: a wrong passphrase and a tampered blob fail the same way.

What it does **not** guarantee, stated plainly:

1. **The application around the module can see plaintext.** Prompt Pipeline's application is private. It receives the
   passphrase and shows decrypted data, so it *could* send plaintext somewhere else. No library can prevent that.
   You check it by behaviour, not by code: with the browser developer tools open, the passphrase must appear in no
   request, and only ciphertext must go to the storage backend.
2. **In "Managed" mode the operator CAN decrypt.** The same cryptography is used, but the key is held server side
   (wrapped by a separate master key) so that the account can be recovered. Only "Sovereign" mode, where the key comes
   from a passphrase the operator never sees, keeps the operator out. The application says which mode is active.
3. **The operator serves the code.** A malicious operator could serve different code to one user, or serve a page
   that lies to the verification tool running inside it. A check holds for the session it was made in. This is why the
   independent proof is a command run outside the browser (see [Verify a site](verify.md)), and why the in-app
   check says so.
4. **A non-extractable key can still be used.** Script running in the same page (XSS) cannot read the key bytes, but it
   can ask the browser to encrypt or decrypt with the key object while the vault is unlocked.
5. **Memory is not wiped reliably.** JavaScript offers no guaranteed erasure (garbage collection, JIT copies). The
   module zeroes the buffers it owns, as a best effort.
6. **Not independently audited here.** Read the code (a few hundred lines), and commission an audit if you need
   assurance beyond that.
