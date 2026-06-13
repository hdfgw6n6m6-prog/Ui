# PulseBoost — Guide complet « de zéro à fonctionnel »

Ce guide te fait passer d'un dépôt cloné à **tout qui marche** : serveur + effecteur
Discord (un seul hébergeur Node), panel admin, analyse IA Gemini, app desktop, et
l'optimisation qui s'adapte au jeu. Suis les étapes **dans l'ordre**.

```
[ App desktop (Windows) ]  --HTTPS-->  [ Serveur Node + effecteur Discord ]  -->  [ Discord API ]
   Tauri + Rust + React                  licence · OAuth · panel · IA Gemini        DM / rôle Pro / logs
```

> Vocabulaire : le « bot » Discord = **effecteur REST** intégré au serveur. Pas de
> gateway, pas de slash command. Donc **une seule chose à héberger** : `server/`.

---

## Vue d'ensemble — les 6 étapes

1. Créer l'application Discord (OAuth + bot).
2. Récupérer une clé API **Gemini**.
3. Héberger le serveur (`server/`) sur ton hébergeur Node + variables d'env.
4. Générer la clé de licence (Ed25519) et la recopier dans l'app.
5. Renseigner les placeholders de l'app + builder le `.exe` (sur Windows).
6. Test de bout en bout (login → clé → IA → profil de jeu).

Garde sous la main un bloc-notes : tu vas collecter ~12 valeurs.

---

## Étape 1 — Application Discord

1. Va sur https://discord.com/developers/applications → **New Application**.
2. Onglet **OAuth2** :
   - Note **Client ID** → `DISCORD_CLIENT_ID`
   - **Reset Secret** → note **Client Secret** → `DISCORD_CLIENT_SECRET`
   - **Redirects** : ajoute EXACTEMENT ces deux URL (remplace par ton domaine/URL d'hébergeur, en HTTPS) :
     - `https://TON-URL/auth/callback`
     - `https://TON-URL/admin/callback`
3. Onglet **Bot** : **Add Bot** → **Reset Token** → note → `DISCORD_BOT_TOKEN`.
   - Active rien de spécial côté intents (l'effecteur n'écoute aucun message).
4. Invite le bot sur **ton serveur Discord** (onglet OAuth2 → URL Generator → scope
   `bot` + permission **Manage Roles**, puis ouvre l'URL).
5. Dans Discord (Paramètres → Avancé → **Mode développeur** ON), clic droit pour
   **Copier l'identifiant** de :
   - ton **serveur** → `DISCORD_GUILD_ID`
   - le **rôle Pro** (crée-le si besoin) → `DISCORD_PRO_ROLE_ID`
   - le **salon de logs** (optionnel) → `DISCORD_LOG_CHANNEL_ID`
   - **toi-même** (ton compte) → `ADMIN_DISCORD_IDS`
6. ⚠️ **Hiérarchie** : dans Serveur → Rôles, place le **rôle du bot AU-DESSUS** du
   rôle Pro. Sinon le bot ne pourra pas attribuer le rôle Pro.

## Étape 2 — Clé API Gemini

1. Va sur https://aistudio.google.com/app/apikey → **Create API key**.
2. Note la clé → `GEMINI_API_KEY`. (Modèle par défaut : `gemini-2.0-flash`.)

## Étape 3 — Héberger le serveur

Le serveur se lance avec **`npm start`** (= `node server.js`). Deux variables
critiques côté hébergeur :
- **`PUBLIC_URL`** = l'URL HTTPS publique que l'hébergeur t'attribue (ou ton domaine).
  Elle DOIT correspondre aux Redirects de l'étape 1.
- **`DATA_DIR`** = un **disque persistant** (ex. `/data`). Sans ça, la base SQLite
  (clés, comptes) est effacée à chaque redéploiement.

### 3a. Générer le secret de session
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
→ `SESSION_SECRET`.

### 3b. Déployer
- Connecte ton dépôt (racine = `server/`) **ou** uploade le dossier `server/`.
- **Start command** : `npm start`
- **Node** : 20+
- Crée un **volume persistant** et mets `DATA_DIR` dessus.
- Colle toutes les variables d'env (liste complète dans `server/.env.example`) :

```
DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_PRO_ROLE_ID, DISCORD_LOG_CHANNEL_ID
PUBLIC_URL, PORT (souvent fourni auto), DATA_DIR
SESSION_SECRET
LICENSE_PRIVATE_KEY   (← étape 4)
ADMIN_DISCORD_IDS
GEMINI_API_KEY, GEMINI_MODEL=gemini-2.0-flash
```

> Détails spécifiques aux hébergeurs de bots Node : `server/HOSTING.md`.
> Variante Docker : `server/Dockerfile`.

## Étape 4 — Clé de licence (Ed25519)

Les autorisations Pro sont signées cryptographiquement (vérifiables hors-ligne).
Génère la paire **une fois** :

```bash
cd server
npm install
npm run keygen
```

La commande affiche deux valeurs :
- **clé privée (hex)** → variable d'env serveur `LICENSE_PRIVATE_KEY` (étape 3, **ne jamais committer**).
- **clé publique (hex)** → à recopier dans l'app (étape 5, `VERIFY_KEY_HEX`).

Redémarre le serveur après avoir ajouté `LICENSE_PRIVATE_KEY`.

## Étape 5 — Configurer et builder l'app (sur Windows)

### 5a. Renseigner les placeholders (3 fichiers Rust)
- `src-tauri/src/license.rs`
  - `const SERVER` → ton `PUBLIC_URL` (ex. `https://TON-URL`)
  - `const DISCORD_CLIENT_ID` → ton Client ID
  - `const VERIFY_KEY_HEX` → la **clé publique** de l'étape 4
- `src-tauri/src/ai.rs` → `const SERVER` = même URL
- `src-tauri/src/telemetry.rs` → `const SERVER` = même URL
- (Avant release publique seulement) `src-tauri/tauri.conf.json` →
  `certificateThumbprint` = empreinte de ton certificat de signature de code.

### 5b. Pré-requis machine Windows
- **Rust** (https://rustup.rs), **Node 20+**, **WebView2** (déjà là sur Win10 21H2+/Win11).

### 5c. Lancer / builder
```bash
npm install
npm run tauri dev        # test en développement
npm run tauri build      # installeur NSIS -> src-tauri/target/release/bundle
```

L'app demande l'élévation admin (UAC) au lancement — normal, elle modifie des
réglages système (toujours avec point de restauration + journal).

## Étape 6 — Test de bout en bout

Serveur (vérifie d'abord qu'il tourne) :
1. Ouvre `https://TON-URL/` → doit rediriger vers `/admin/login`.
2. Connecte-toi avec ton compte admin → tu arrives sur **le panel** (`/panel`).
3. Onglet **Clés** → génère 1 clé (plan `monthly`), coche **« DM à »** avec ton ID
   Discord → tu dois recevoir la clé **en DM** : ça prouve que l'effecteur bot marche.

App desktop :
4. Lance l'app → onglet **Optimisations** → **Se connecter avec Discord** (le
   navigateur s'ouvre, autorise, l'app récupère la session).
5. Colle ta clé → **Activer** → le rôle **Pro** t'est attribué sur Discord, le panel
   logue l'activation.
6. Onglet **Accueil** → **Analyse IA** → tu obtiens un texte **généré par Gemini**
   (preuve que `GEMINI_API_KEY` marche). Si erreur 502 : vérifie la clé/quotas.
7. **Optimisation adaptative** : lance un jeu (FiveM/Valorant/CS2/Fortnite/Warzone/
   Apex) → la carte affiche « X détecté » + le profil. Clique **Optimiser pour X**
   (ou coche **Auto**). Vérifie dans **Sécurité** que les changements sont
   journalisés, puis **Tout annuler** pour valider le rollback.

✅ Si ces 7 points passent, **tout fonctionne**.

---

## Mode TEST rapide (http, sans domaine ni HTTPS)

⚠️ Le HTTP en clair est **pour tester uniquement** (clés/tokens passent en clair).
Dès que de vrais joueurs l'utilisent → **HTTPS obligatoire** (voir §3 / `HOSTING.md`).
Garde quand même `DATA_DIR` persistant pour ne pas reperdre tes clés à chaque test.

Rappel : seul **le serveur** se host. L'app desktop se build sur Windows et se teste
sur le même PC.

### Route A — Tout en local (100% fiable, recommandé pour tester)
Discord autorise `http://localhost` : aucune galère de certificat.
1. Serveur sur ton PC :
   ```bash
   cd server && npm install && npm run keygen   # note les 2 clés
   # crée server/.env avec au minimum :
   #   PUBLIC_URL=http://localhost:8787
   #   PORT=8787
   #   DATA_DIR=./data
   #   DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID,
   #   DISCORD_PRO_ROLE_ID, SESSION_SECRET, LICENSE_PRIVATE_KEY, ADMIN_DISCORD_IDS,
   #   GEMINI_API_KEY
   npm run start:local
   ```
2. Discord → OAuth2 → Redirects, ajoute :
   - `http://localhost:8787/auth/callback`
   - `http://localhost:8787/admin/callback`
3. App : dans `license.rs`, `ai.rs`, `telemetry.rs` mets `SERVER = "http://localhost:8787"`,
   et `VERIFY_KEY_HEX` = clé publique du keygen. Puis `npm run tauri dev`.
4. Teste : `http://localhost:8787/` → panel ; puis login + clé + IA + profil de jeu.

### Route B — Sur ton bot host en http://IP (si Discord l'accepte)
1. Serveur sur l'hébergeur, `PUBLIC_URL=http://TON_IP:PORT`, `DATA_DIR` persistant.
2. Discord → Redirects : `http://TON_IP:PORT/auth/callback` **et** `…/admin/callback`.
   - Si Discord **refuse d'enregistrer** ces URL en `http://` → tu DOIS passer en HTTPS
     (DuckDNS + Caddy, ou Cloudflare Tunnel : §3 / `HOSTING.md`). Il n'y a pas de
     contournement, c'est une règle de Discord.
3. App : `SERVER = "http://TON_IP:PORT"` dans les 3 fichiers Rust, puis build/dev.

> Ce que tu PEUX déjà tester sans OAuth, même en http://IP : le serveur démarre,
> `GET /` répond, et les appels app→serveur fonctionnent une fois la session obtenue.
> Mais la session vient du login Discord → si l'OAuth http distant est refusé, fais
> la Route A en local pour valider toute la chaîne, puis ajoute le HTTPS pour la mise
> en ligne.

## Dépannage rapide

| Symptôme | Cause probable | Fix |
|---|---|---|
| OAuth « invalid redirect » | Redirect Discord ≠ `PUBLIC_URL` | Recopie EXACTEMENT `…/auth/callback` et `…/admin/callback` |
| Panel « Accès refusé » | Ton ID absent de `ADMIN_DISCORD_IDS` | Ajoute ton ID Discord, redémarre |
| Pas de DM reçu | rôle bot trop bas / token invalide | rôle bot au-dessus du rôle Pro ; vérifie `DISCORD_BOT_TOKEN` |
| Rôle Pro non attribué | Manage Roles manquant / hiérarchie | Permission + hiérarchie du bot |
| Analyse IA 502 | `GEMINI_API_KEY` absente/quota | Vérifie la clé et le modèle `GEMINI_MODEL` |
| Clés/comptes perdus au redeploy | `DATA_DIR` non persistant | Pointe `DATA_DIR` sur un volume persistant |
| App ne contacte pas le serveur | `SERVER` non remplacé dans le Rust | license.rs / ai.rs / telemetry.rs |
| Jeu non détecté | jeu non lancé / nom d'exe différent | lance le jeu ; profils : FiveM/Valorant/CS2/Fortnite/Warzone/Apex |

## Ce qui reste optionnel (pas requis pour « ça marche »)
- **Paiement** (Stripe/PayPal) pour générer + DM la clé automatiquement (sinon tu
  génères les clés à la main dans le panel).
- **Signature de code EV/OV** : indispensable **avant diffusion publique** (TikTok),
  sinon SmartScreen bloque l'installeur. Renseigne `certificateThumbprint`.

## Fichiers de référence
- `server/HOSTING.md` — déploiement serveur détaillé.
- `server/.env.example` — toutes les variables d'environnement.
- `REDESIGN.md` — analyse marché + refonte UI.
- `PASSATION.md` — conception complète. `SECURITE.md` — sécurité/anti-crack.
