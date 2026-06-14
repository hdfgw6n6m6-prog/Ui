# Héberger PulseBoost sur un hébergeur de bots Node (un seul VPS/instance)

Le **serveur de licence**, **l'effecteur Discord** (DM, rôle Pro, logs) et le **bot
Discord** (commandes admin) tournent dans **un seul process Node** (`server.js`).
Tu n'as donc qu'**une seule chose à héberger** : ce dossier `server/`.

> Configuration : tout se règle dans **`config.js`** (pas de `.env`). Les variables
> d'environnement, si tu en définis, restent prioritaires sur `config.js`.
>
> Le bot Discord se connecte au gateway avec `intents:0` (il **ne lit aucun
> message**) et n'exécute que des **slash commands réservées aux admins**.

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
4. **Configuration** : édite **`config.js`** (valeurs Discord, Gemini, secrets…).
   Sur un dépôt PUBLIC, laisse les secrets vides dans `config.js` et mets-les
   plutôt dans les variables d'environnement de l'hébergeur (elles sont prioritaires).
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

## 4. Configuration (rappel)

Tout est dans **`config.js`**. Les indispensables : `DISCORD_CLIENT_ID/SECRET`,
`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PRO_ROLE_ID`, `PUBLIC_URL`,
`SESSION_SECRET`, `LICENSE_PRIVATE_KEY`, `ADMIN_DISCORD_IDS`, `GEMINI_API_KEY`,
et `DATA_DIR` (disque persistant).

> Pour les **commandes admin du bot** : invite le bot avec le scope
> `applications.commands` (en plus de `bot`), sinon les slash commands
> n'apparaissent pas. Tape `/help` dans ton serveur pour vérifier.

## 4 bis. Paiement Stripe (boutique automatisée)

1. Crée un compte **Stripe** → note la **clé secrète** (`sk_...`) → `STRIPE_SECRET_KEY`.
2. Dashboard Stripe → **Developers → Webhooks → Add endpoint** :
   - URL : `PUBLIC_URL/webhook/stripe`
   - Évènement : `checkout.session.completed`
   - Note le **signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.
3. Dans `config.js`, fixe les **prix EN CENTIMES** : `PRICE_MONTHLY`, `PRICE_LIFETIME`,
   etc. (un plan vide = masqué de la boutique). `CURRENCY=eur`.
4. La boutique est servie sur **`PUBLIC_URL/buy`** : l'utilisateur se connecte avec
   Discord, paie, et sa **clé Pro est générée + liée + activée automatiquement** (et
   envoyée en DM). Les ventes apparaissent dans le panel (onglet **Ventes**).

> Dans l'app, le bouton « Passer Pro » ouvre `PUBLIC_URL/buy`. Vérifie que `SERVER`
> (côté Rust) pointe sur le même `PUBLIC_URL`.

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
docker run -p 8787:8787 -v pb_data:/data -e DATA_DIR=/data pulseboost-server
# (édite config.js avant le build, ou passe les secrets en -e VAR=valeur)
```

## Mettre à jour

Redeploy / `git pull` + redémarrage du process. Tant que `DATA_DIR` pointe sur un
disque persistant, la base (clés, comptes, blacklist) est conservée.
