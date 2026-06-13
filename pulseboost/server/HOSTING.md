# Héberger PulseBoost sur un hébergeur de bots Node (un seul VPS/instance)

Le **serveur de licence** et **l'effecteur Discord** (DM, rôle Pro, logs) tournent
dans **un seul process Node** (`server.js` importe `discord.js`). Tu n'as donc
qu'**une seule chose à héberger** : ce dossier `server/`.

> L'effecteur Discord est en **REST pur** : pas de gateway, pas de slash command,
> il n'écoute aucun message. Il ne fait qu'exécuter ce que le panel admin ordonne.

---

## 1. Pré-requis Discord (portail développeur)

1. **Application** → note `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET`.
2. **OAuth2 → Redirects**, ajoute exactement :
   - `PUBLIC_URL/auth/callback`
   - `PUBLIC_URL/admin/callback`
3. **Bot** → crée le bot, note `DISCORD_BOT_TOKEN`. Permission **Manage Roles**.
   Place le rôle du bot **au-dessus** du rôle Pro dans la hiérarchie du serveur.
4. Récupère `DISCORD_GUILD_ID`, `DISCORD_PRO_ROLE_ID`, `DISCORD_LOG_CHANNEL_ID`
   (clic droit → Copier l'identifiant, mode développeur activé).
5. `ADMIN_DISCORD_IDS` = ton (tes) ID Discord, séparés par des virgules.

## 2. Déploiement sur l'hébergeur de bots

La plupart des hébergeurs Node (type "bot hosting") fonctionnent ainsi :

1. **Uploade** le dossier `server/` (ou connecte le dépôt Git, racine = `server/`).
2. **Start command** : `npm start`  (équivaut à `node server.js`).
3. **Version Node** : 20 ou plus (champ `engines` déjà fixé).
4. **Variables d'environnement** : recopie celles de `.env.example` dans le
   dashboard de l'hébergeur (voir §3). Ne pas uploader de `.env` en clair.
5. **Disque persistant** : crée un volume persistant et pointe `DATA_DIR` dessus
   (ex. `/data`). ⚠️ Sans ça, la base SQLite (clés, comptes) est **remise à zéro**
   à chaque redéploiement sur les hébergeurs au filesystem éphémère.
6. **Port** : l'hébergeur fournit en général `PORT` automatiquement ; le serveur
   le lit (`process.env.PORT`). Sinon mets `PORT=8787`.
7. **URL publique / HTTPS** : utilise l'URL HTTPS fournie par l'hébergeur comme
   `PUBLIC_URL` (ou branche ton domaine). OAuth Discord **exige** du HTTPS.

## 3. Générer la clé de licence (Ed25519) — une fois

Les tokens d'entitlement sont signés Ed25519. Génère la paire :

```bash
cd server
npm install
npm run keygen      # affiche LICENSE_PRIVATE_KEY (hex) + la clé PUBLIQUE
```

- Mets `LICENSE_PRIVATE_KEY` (hex) dans les variables d'environnement de l'hébergeur.
- Copie la **clé publique** affichée dans `src-tauri/src/license.rs` → `VERIFY_KEY_HEX`.

## 4. Variables d'environnement (rappel)

Voir `.env.example`. Les indispensables : `DISCORD_CLIENT_ID/SECRET`,
`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PRO_ROLE_ID`, `PUBLIC_URL`,
`SESSION_SECRET`, `LICENSE_PRIVATE_KEY`, `ADMIN_DISCORD_IDS`, `GEMINI_API_KEY`,
et `DATA_DIR` (disque persistant).

## 5. Vérifier que tout marche

- `GET PUBLIC_URL/` → redirige vers `/admin/login`.
- Connecte-toi en admin → tu arrives sur **le panel** (`/panel`).
- Génère une clé dans l'onglet *Clés*, coche "DM à" pour la recevoir → vérifie que
  l'effecteur Discord t'envoie bien le DM (preuve que le bot fonctionne).
- Dans l'app desktop : login Discord → redeem clé → "Analyse IA" (teste Gemini).

## Option Docker (si l'hébergeur le supporte)

Un `Dockerfile` est fourni. Build/run :

```bash
docker build -t pulseboost-server ./server
docker run -p 8787:8787 --env-file server/.env -v pb_data:/data \
  -e DATA_DIR=/data pulseboost-server
```

## Mettre à jour

Redeploy / `git pull` + redémarrage du process. Tant que `DATA_DIR` pointe sur un
disque persistant, la base (clés, comptes, blacklist) est conservée.
