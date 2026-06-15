# PulseBoost — Passation pour Claude Code

Ce document résume **toute la conception** du projet (issue d'une longue conversation)
pour qu'un assistant comme Claude Code reprenne le travail sans contexte manquant.
Il accompagne la dernière version du code dans ce dossier.

---

## 1. Le produit

**PulseBoost** : application Windows d'optimisation PC pour gamers (cible : FiveM,
Fortnite, Valorant, CS2, Warzone). Modèle **freemium** : version gratuite + Pro par
abonnement. Distribution prévue : pubs TikTok + landing page.

**Positionnement / différenciateur** : c'est le seul optimiseur où **chaque modification
est journalisée et réversible en 1 clic** (point de restauration Windows automatique avant
toute action). Le marché est plein d'arnaques ; la crédibilité est le produit.

### Stack technique
- **App desktop** : Tauri 2 + Rust (backend) + React/Vite (frontend). Cible < 50 Mo, démarrage < 3 s, admin via manifeste NSIS.
- **Serveur** : Node.js (Express + better-sqlite3) — licence, OAuth Discord, analytics, IA, effecteur Discord. Aucune lib `discord.js` (REST pur).
- **Panel admin** : page web unique servie par le serveur (vanilla JS, zéro dépendance).
- **Base** : SQLite (`server/pulseboost.db`, créée au 1er lancement).

---

## 2. Historique des décisions (pourquoi l'archi est comme ça)

La conception a évolué en plusieurs pivots. Les décisions importantes :

1. **Clé API Gemini jamais dans le .exe** → toute l'IA passe par le serveur.
2. **Pas de promesses de FPS chiffrées** → impact annoncé « faible / moyen / variable ».
   Le score est calculé **localement et déterministiquement** ; l'IA l'explique, ne l'invente pas.
3. **Login = OAuth Discord** (scope `identify email` — email consenti, affiché par
   Discord, stocké et conservé), pas une saisie de clé au login.
4. **La clé se "redeem" après login → liée au compte Discord** (et plus seulement au PC).
   Conséquence : le partage de clé est neutralisé (entitlement par compte).
5. **Plus de bot à commandes Discord.** Le « bot » est un **effecteur REST** piloté
   uniquement par le panel web : il envoie des DM, attribue le rôle Pro, poste des logs.
   Il **ne se connecte pas au gateway**, n'a **aucune slash command**, **ne lit aucun
   message** → impossible de lui donner un ordre depuis Discord.
6. **Anti-crack honnête** : aucun .exe n'est incrackable (le code de détection est sur la
   machine du client, donc patchable). On rend le crack **inutile** : valeur côté serveur,
   clé liée au compte, blacklist clé+PC immédiate (même hors-ligne) et propagée au retour
   en ligne, kill-switch.
7. **Télémétrie opt-in** (désactivée par défaut) → alimente analytics + analyse churn.

> Ces garde-fous (honnêteté marketing, télémétrie opt-in, signature de code) ne sont pas
> des détails : c'est ce qui empêche les threads « ce logiciel arnaque/espionne » qui
> tueraient la conversion en pub TikTok. À garder.

---

## 3. Carte des fichiers

```
pulseboost/
├─ package.json, vite.config.js, index.html      Frontend (Vite + React)
├─ src/
│  ├─ main.jsx                                    Entrée React
│  ├─ App.jsx                                     UI complète (3 onglets + login + churn)
│  ├─ components/ScoreGauge.jsx                   Jauge "compte-tours" du score santé
│  └─ styles.css                                  Thème dark/violet glassmorphism
├─ src-tauri/
│  ├─ Cargo.toml, build.rs, tauri.conf.json
│  └─ src/
│     ├─ main.rs            Déclare toutes les commandes Tauri
│     ├─ hardware.rs        Scan CPU/GPU/RAM/disques/OS/process/jeux + détection problèmes
│     ├─ score.rs           Score santé 0-100 LOCAL et déterministe
│     ├─ optimizations/mod.rs  Registre des tweaks (apply/list/rollback/game_boost)
│     ├─ safety.rs          Point de restauration + journal réversible + helpers registre
│     ├─ license.rs         Login Discord (loopback) + redeem + entitlement + token Ed25519
│     ├─ integrity.rs       Anti-crack + blacklist locale (offline)
│     ├─ telemetry.rs       Télémétrie opt-in + feedback churn
│     └─ ai.rs              Client de l'analyse IA (via serveur)
├─ server/
│  ├─ server.js             Serveur licence + OAuth + analytics + IA + API admin
│  ├─ discord.js            Effecteur Discord REST (DM, rôles, logs)
│  ├─ keygen.js             Génère la paire Ed25519 (à lancer une fois)
│  ├─ package.json
│  └─ public/panel.html     Panel admin web complet
├─ SECURITE.md              Détail sécurité / abonnement / anti-crack / analytics
├─ README.md
└─ PASSATION.md             (ce fichier)
```

---

## 4. Modules de l'app — état

### Scan & score (FAIT)
`hardware.rs` détecte CPU, GPU (WMI), RAM (+ fréquence), disques (HDD/SSD/NVMe), OS,
top process, jeux installés, et des **problèmes réels** (power plan équilibré, Game DVR,
SysMain sur SSD, compression mémoire ≥16 Go, trop de programmes au démarrage).
`score.rs` produit un score 0-100 déterministe + raisons. `ai.rs` envoie le scan au
serveur pour l'explication en langage naturel (feature Pro).

### Optimisations (FAIT, réversibles + journalisées)
Tweaks implémentés dans `optimizations/mod.rs` :
Power plan haute perf · Xbox Game DVR off · Mode Jeu · nettoyage temp · SysMain off (SSD) ·
Nagle/TCP off · compression mémoire off (≥16 Go) · rapport démarrage · **HAGS** ·
**DNS Cloudflare** (réversible, DNS précédents journalisés) · **effets visuels → perf** ·
**nettoyage Prefetch** · **suppression délai de démarrage**. `game_boost` met la priorité
CPU du jeu à *High* (jamais Realtime). Chaque écriture passe par `safety.rs` (valeur
d'origine journalisée → rollback complet possible).

### Sécurité / confiance (FAIT)
Point de restauration avant toute application ; journal public (onglet Sécurité) ; rollback
complet 1 clic ; aucune écriture destructive.

### Licence (FAIT)
`license.rs` : login Discord via listener loopback `127.0.0.1` (le serveur renvoie une
session signée) ; `redeem` lie la clé au compte ; `entitlement` (heartbeat) revérifie +
récupère feature flags + commande admin ; token **Ed25519** vérifié hors-ligne (validité 7 j).

### Anti-crack (FAIT, avec limites documentées)
`integrity.rs` : `gate()` au lancement vérifie blacklist locale (fichiers + registre),
debugueur (`IsDebuggerPresent`), signature Authenticode (PowerShell `Get-AuthenticodeSignature`).
Si falsification → `trip_blacklist()` écrit un marqueur lié au hash HWID dans plusieurs
emplacements → app verrouillée même hors-ligne. Au retour en ligne, l'app signale au
serveur (`tampered:true`) → blacklist HWID serveur + révocation des clés du compte.
Détection d'outils de crack présente mais **à activer avec prudence** (faux positifs,
ex. Cheat Engine).

### Télémétrie / churn (FAIT, opt-in)
`telemetry.rs` : consentement local (off par défaut), envoi best-effort d'évènements +
snapshot {score, hardware}. Sondage de churn affiché quand l'abonnement a expiré.

---

## 5. Serveur & panel — endpoints

**Client (app)** : `/auth/callback` (OAuth), `/v1/redeem`, `/v1/entitlement`,
`/v1/analyze` (IA, gated session+abo+flag), `/v1/telemetry` (opt-in), `/v1/churn_feedback`.

**Admin (cookie admin Discord)** : `/admin/login`, `/admin/callback`, `/panel`,
`/admin/api/{stats,keys,revoke,unbind,users,ban,logs,alerts,alerts/stream(SSE),
alerts/resolve,command,flags,blacklist,unblacklist,dm,role,analytics,user,churn}`.

**Panel (onglets)** : Tableau de bord (alertes SSE temps réel) · Analytics (DAU/WAU,
conversion, score moyen, churn 30j, courbes 14 j, top tweaks, mix plans) · Churn (raisons,
expirations < 7 j, churned, retours) · Clés (générer/filtrer/révoquer/délier, DM à) ·
Utilisateurs (analyse détaillée par client, stop/ban, déconnecter, alerte app, DM, rôle
Pro +/−) · Logs · Blacklist · Features (flags on/off + portée gratuit/Pro).

---

## 6. Variables d'environnement (serveur)

```
DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET     # application OAuth Discord
PUBLIC_URL=https://api.tondomaine.com         # URL publique du serveur (HTTPS)
SESSION_SECRET=<32+ octets aléatoires>        # HMAC des sessions
LICENSE_PRIVATE_KEY=<hex, depuis keygen.js>   # Ed25519, NE JAMAIS COMMIT
ADMIN_DISCORD_IDS=123,456                      # IDs Discord autorisés sur le panel
DISCORD_BOT_TOKEN=...                           # effecteur (DM, rôles, logs)
DISCORD_GUILD_ID=..., DISCORD_PRO_ROLE_ID=..., DISCORD_LOG_CHANNEL_ID=...
GEMINI_API_KEY=...                              # analyse IA (Google Gemini)
GEMINI_MODEL=gemini-2.0-flash                   # modèle Gemini (optionnel)
DATA_DIR=./data                                 # disque persistant pour la base SQLite
PORT=8787
```

> Déploiement serveur + effecteur Discord sur **un seul process Node** : voir
> `server/HOSTING.md` (hébergeur de bots Node, `npm start`, env, disque persistant).

Portail Discord → OAuth2 Redirects : `PUBLIC_URL/auth/callback` **et**
`PUBLIC_URL/admin/callback`. Le bot a besoin de *Manage Roles*, son rôle **au-dessus** du
rôle Pro.

---

## 7. Placeholders à remplacer AVANT build

- `src-tauri/src/license.rs` : `SERVER`, `DISCORD_CLIENT_ID`, `VERIFY_KEY_HEX` (clé publique de `keygen.js`).
- `src-tauri/src/ai.rs` : `SERVER` (même valeur).
- `src-tauri/src/telemetry.rs` : `SERVER`.
- `src-tauri/tauri.conf.json` : `certificateThumbprint` (certificat de signature).

---

## 8. Build & déploiement

```bash
# Serveur (Railway / Fly.io / VPS)
cd server && npm install && node keygen.js   # une fois → copier la clé publique dans license.rs
node server.js

# App (sur une machine Windows ; Rust + Node 20 + WebView2)
npm install
npm run tauri dev        # dev
npm run tauri build      # installeur NSIS dans src-tauri/target/release/bundle
```

---

## 9. Roadmap — ce qui RESTE à faire

> Ajouts récents v5 (FAIT) : **Collecte email** (scope OAuth `email`, export CSV,
> RGPD `/forget`). **Réglages** : annonce in-app + dernière version + URL de maj
> (`/v1/announcement`, bandeaux app) ; **broadcast** à tous (in-app/DM).
> **Cadeau Pro** (`/admin/api/grant` : crée+lie+active une clé). App : bandeaux
> annonce/màj (`open_url`, `announcement`). Bot : `/grant /forget /announce`.
> Tests : `npm test` (≈41 assertions). (Pas de boutique/paiement : distribution
> des clés via panel/bot.)


> Ajouts récents v6 (FAIT) : **bot 100% REST (zéro commande Discord)** — le bot
> gateway/slash a été retiré ; le bot reste un **effecteur** piloté UNIQUEMENT par
> le panel (DM, rôle, logs, **liste des membres** `discord.listMembers`). **Panel
> admin entièrement redesigné** (nav groupée, KPI, recherche globale, actions
> rapides) + onglet **Membres Discord** (`/admin/api/members` : tout le serveur,
> croisé avec les comptes app, filtres tous/inscrits/pro/hors-app). Conforme à la
> décision §2 (« pas de gateway, aucune commande »).
>
> Ajouts récents v3 (FAIT) : **Assistant IA agentique** (chat Gemini, feature Pro,
> flag `ai_chat`) — endpoint serveur `/v1/chat`, client `ai::chat`, commande
> `ai_chat`. Il voit un **contexte profil/app** (licence, score, problèmes, tweaks
> appliqués, jeu en cours) et **propose** des actions whitelistées
> (`free_analysis`, `apply_recommended`, `apply_game_profile`, `rollback_all`,
> `reset_profile`, `open_tab`) que l'app n'exécute **qu'après confirmation**
> explicite de l'utilisateur. Nouvelle commande `reset_profile` (rollback + vidage
> journal + déconnexion + télémétrie off). Onglet « Assistant » côté UI.
>
> Ajouts récents v2 (FAIT) : **analyse GRATUITE locale** (`free_analysis` →
> estimation d'un gain FPS en FOURCHETTE honnête « +X à +Y % », jamais garantie ;
> carte dédiée côté UI) ; **7 optimisations gaming avancées réversibles**
> (réactivité MMCSS, priorité 1er plan, MMCSS Games, bridage réseau levé,
> accélération souris off, Power Throttling off, DiagTrack off) intégrées aux
> profils par jeu et au 1-clic. Helpers `safety::set_registry_string` / `read_dword`.
>
> Ajouts récents (FAIT) : **analyse IA migrée vers Google Gemini** (`/v1/analyze`,
> `GEMINI_API_KEY`) ; **optimisation adaptative par jeu** (`active_game` /
> `game_profile` / `apply_game_profile` côté Rust, carte dédiée + case "Auto"
> côté UI — profil = priorité CPU + tweaks réseau/latence adaptés au jeu joué) ;
> **packaging serveur+effecteur pour un hébergeur Node** (`server/HOSTING.md`,
> `Dockerfile`, `.env.example`, `DATA_DIR` persistant). Refonte UI : `REDESIGN.md`.

Priorité haute :
- **Paiement** (Stripe/PayPal) → webhook qui appelle `/admin/api/keys` et DM la clé
  automatiquement. **Non implémenté** — c'est la dernière brique pour tout automatiser.
- **Signature de code EV/OV** : obligatoire avant pubs TikTok (sinon SmartScreen bloque).
  Active aussi la vérif Authenticode de `integrity.rs`.
- **Vérification licence dispersée** dans le Rust (pas un seul `if pro`).

Optimisations à fiabiliser (présentes dans le brief initial, pas encore codées) :
- Timer resolution 0.5 ms (`NtSetTimerResolution` — effet réduit depuis Win10 2004, à tester).
- HPET / BCDEDIT (Hyper-V) : nécessite reboot, **risque PC non bootable** → derrière double confirmation + restore point.
- Standby list purge (`NtSetSystemInformation`, privilège `SeProfileSingleProcessPrivilege`).
- Kill overlays Steam/Discord/Xbox pendant le jeu + restauration auto à la fermeture.
- Parsing `libraryfolders.vdf` Steam (jeux hors C:).
- Benchmarks **Avant/Après** via PresentMon + overlay FPS (meilleur argument mesurable et honnête).

Technique :
- Remplacer le check signature PowerShell par `WinVerifyTrust` natif (crate `windows`).
- Stockage local chiffré (DPAPI) pour session/token/blacklist au lieu de fichiers en clair.
- Cache d'analyse IA côté serveur (même hardware = même réponse).
- Vérification licence Pro **aussi** au niveau de chaque commande Rust sensible.

---

## 10. Limites honnêtes à rappeler au client final

- « Incrackable » n'existe pas pour un .exe. La protection durable = valeur côté serveur +
  blacklist propagée. L'anti-crack offline filtre 99 % des gens, ce n'est pas un mur infini.
- Pas de FPS garantis. Les vrais gains sont modestes et variables ; le matériel (8 Go RAM,
  HDD) reste le vrai goulot, et l'app doit le dire.
- Télémétrie opt-in stricte ; ne jamais l'activer en douce.
