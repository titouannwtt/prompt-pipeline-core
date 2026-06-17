# @pp/vault-core (AGPL-3.0-or-later)

**SDK Vault open-source et vérifiable de [Prompt Pipeline](https://prompt-pipeline.io).**

C'est la **seule** partie du front qui touche votre **phrase de chiffrement** et le **clair** lors du
chiffrement/déchiffrement. Le reste du site (fermé) ne manipule que du **ciffré** à l'écriture et reçoit le clair
à la demande. Ce module est publié pour qu'un expert puisse **prouver** que vos données sont chiffrées de bout en
bout et que la clé ne quitte jamais votre appareil.

## Garantie (claim honnête, 3 niveaux)
1. **Prouvé (crypto + hash + build reproductible)** : la phrase ne quitte jamais le navigateur ; les enregistrements
   sont chiffrés côté client (Argon2id → AES-256-GCM, `CryptoKey` **non-extractible**) ; seul du ciffré + métadonnées
   non sensibles partent vers le serveur. → **L'opérateur/la base ne peuvent pas déchiffrer.**
2. **Vérifiable au réseau (DevTools)** : le clair ne va qu'aux destinations documentées (relais → cible pour SSH/IA/Drive).
3. **Confiance résiduelle (assumée)** : code livré par l'opérateur (+ Cloudflare) → limite inhérente à tout E2EE web ;
   mitigée par la vérification du hash ci-dessous + (à venir) l'isolation de la phrase dans une iframe sandbox.

## Vérifier que prompt-pipeline.io utilise bien CE code
1. Ouvrir DevTools → onglet réseau → repérer le chunk `vault-core` chargé.
2. En calculer le hash (ou utiliser le bookmarklet fourni — à venir).
3. Le comparer au hash publié sur la **release GitHub** + l'**attestation SLSA** (sigstore/Rekor).
   La confiance vient de GitHub/sigstore, **jamais** du serveur de prompt-pipeline.io.

## Périmètre
- **Incrément 1 (actuel)** : `crypto/` — Argon2id (worker), AES-256-GCM, aléa, encodage, en-tête KDF, types.
- **À venir** : couche persistance chiffrée, client de sync (I/O ciffré uniquement), primitive iframe de saisie de la phrase.

## Portabilité
Pensé sans dépendance DOM (hors la future primitive de saisie) → réutilisable côté application mobile pour partager
le même coffre chiffré entre web et mobile avec la même phrase.
