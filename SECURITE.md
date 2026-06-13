# Sécurité, abonnement & anti-crack — PulseBoost

Architecture finale : **login Discord (OAuth)** → **redeem d'une clé liée au compte Discord**
→ **panel web** d'administration (logs, stop, commandes, features, blacklist) →
**anti-crack** avec blacklist clé + PC qui agit **même hors-ligne**.

## D'abord, la vérité (je ne te vendrai pas de promesse fausse)

Tu veux que l'app soit incrackable et qu'un crackeur soit bloqué même PC hors-ligne.
Voici ce qui est vrai, parce que ta réputation dépend de ne pas raconter n'importe quoi
à tes clients :

- **Aucun logiciel installé n'est incrackable.** Le code de détection tourne sur la
  machine du crackeur ; il peut être patché pour ne jamais se déclencher. C'est vrai pour
  PulseBoost comme pour Windows, Denuvo ou n'importe quel AAA. Quiconque te vend
  « 100 % incrackable » te ment.
- **Ce qui est réellement protégé = ce qui ne tourne pas chez le client.** D'où le
  principe directeur : **mets ta valeur côté serveur** (analyse IA, profils, presets).
  Un .exe craqué qui n'a accès à rien de premium n'a aucune valeur à pirater.

Ce qui suit est la version la plus solide *raisonnable* : ça arrête 99 % des gens
(partage de clé, patch naïf, debugueur) et ça blackliste le reste. C'est un mur très
haut, pas un mur infini.

## 1. Login Discord (l'« application Discord » que tu autorises)

C'est une **application OAuth2 Discord**, scope `identify` uniquement (lit l'ID + pseudo,
rien d'autre ; ce n'est pas un bot qui rejoint des serveurs). Flux desktop :

1. L'app ouvre le navigateur sur l'autorisation Discord (redirect vers ton serveur).
2. Discord renvoie vers `TON_SERVEUR/auth/callback`, qui échange le code et crée une
   **session signée (HMAC)**.
3. Le serveur renvoie la session à l'app via un **listener loopback** `127.0.0.1` (la
   session ne transite jamais en clair sur le réseau public).

À configurer dans le portail développeur Discord : l'`OAuth2 Redirect` =
`https://TON_SERVEUR/auth/callback` **et** `https://TON_SERVEUR/admin/callback`.

## 2. Redeem : la clé est liée au compte Discord

Après login, l'utilisateur colle sa clé → `redeem` → le serveur écrit
`keys.discord_id = <son ID Discord>`. Conséquences :

- **Le partage de clé est mort** : la clé appartient à un compte. La redonner à un ami ne
  sert à rien (l'entitlement se vérifie par compte, pas par clé tapée).
- L'entitlement (`/v1/entitlement`) répond : Pro ou non, plan, expiration, **feature
  flags**, et une éventuelle **commande admin** (déconnexion forcée, message d'alerte).

## 3. Anti-crack + blacklist (clé ET PC), y compris hors-ligne

Module `integrity.rs`, exécuté **au lancement avant de débloquer quoi que ce soit** :

| Détection | Hors-ligne ? | Note |
|---|---|---|
| **Blacklist locale** (HWID) dans 3 fichiers + registre HKCU/HKLM | ✅ | Une fois déclenchée, l'app refuse de démarrer sans réseau |
| **Debugueur** attaché (`IsDebuggerPresent`) | ✅ | Fiable, peu de faux positifs → trip blacklist |
| **Signature Authenticode** invalide (binaire modifié) | ✅ | Nécessite que tu signes le .exe ; sinon désactivé en dev |
| Outils de crack en cours (x64dbg, IDA…) | ✅ | Heuristique — **risque de faux positifs**, à activer avec prudence |

Quand une falsification est détectée → `trip_blacklist()` écrit un marqueur lié au **hash
du HWID** dans plusieurs emplacements. Au prochain lancement, **même sans Internet**,
`security_gate()` voit le marqueur et affiche l'écran « Accès bloqué ».

**Propagation serveur** : dès que la machine retouche Internet, l'app signale la
falsification (`tampered:true`). Le serveur blackliste le HWID **et révoque les clés du
compte** (`UPDATE keys SET revoked=1`). Ainsi le crackeur est grillé sur *tous* ses PC, et
sa clé devient morte partout. Tu peux aussi blacklister un HWID **à la main** depuis le
panel.

### La limite honnête du « hors-ligne »

Le marqueur local est removable et la détection est patchable par quelqu'un de très
motivé. C'est pour ça que le vrai filet, c'est : (a) la propagation serveur au retour
online, (b) la valeur premium côté serveur. L'offline-blacklist arrête les script-kiddies
et ralentit les autres ; ne le présente jamais à tes clients comme une garantie absolue.

## 4. Vérification hors-ligne légitime (pour les vrais clients)

Le serveur signe un **token Ed25519** (clé privée serveur uniquement) que l'app vérifie
**sans réseau** avec la clé publique embarquée. Validité **7 jours** → un client honnête
peut jouer hors-ligne une semaine ; au-delà il doit se reconnecter. Forger ce token est
cryptographiquement infaisable. Compromis à connaître : une révocation met jusqu'à 7 jours
à s'appliquer si la machine reste hors-ligne (la blacklist anti-crack, elle, est immédiate).

## 4 bis. Le bot Discord = exécuteur, piloté UNIQUEMENT par le panel

Tu voulais : le panel exécute les actions « grâce au bot », et **personne ne peut lancer
de commande depuis Discord**. C'est exactement l'architecture en place :

```
   Panel web  ──(cookie admin)──►  Serveur  ──(token bot, REST)──►  Discord
   (seul point de contrôle)        (autorise)   (server/discord.js)   (DM, rôle, logs)
```

Le fichier `server/discord.js` n'utilise **que l'API REST** de Discord. Il **ne se
connecte pas au gateway**, n'enregistre **aucune commande slash** et **n'écoute aucun
message**. Donc c'est techniquement impossible de lui donner un ordre depuis Discord —
il ne fait qu'exécuter ce que le serveur lui dit, et le serveur n'agit que sur ordre du
panel (cookie admin signé requis). Ce qu'il sait faire :

- **DM** une clé à un acheteur (au moment du `/genkey` avec « DM à »).
- **Attribuer le rôle Pro** automatiquement au redeem, le **retirer** au revoke/ban.
- **Poster les logs** (redeem, révocation, ban) dans un salon Discord dédié.
- Sur ordre du panel : **DM libre** + **ajout/retrait de rôle** (boutons onglet Utilisateurs).

Env du bot : `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_PRO_ROLE_ID`,
`DISCORD_LOG_CHANNEL_ID`. Le bot doit avoir la permission *Manage Roles* et son rôle
doit être **au-dessus** du rôle Pro dans la hiérarchie du serveur.

## 5. Panel web — full logs / stop / commandes / features / blacklist

`https://TON_SERVEUR/panel` (login admin = Discord, restreint à `ADMIN_DISCORD_IDS`) :

- **Tableau de bord** : stats + **alertes temps réel (SSE)** — redeem, partage de compte
  suspecté (>3 appareils), falsifications, révocations.

`https://TON_SERVEUR/panel` (login admin = Discord, restreint à `ADMIN_DISCORD_IDS`) :

- **Tableau de bord** : stats + **alertes temps réel (SSE)** — redeem, partage de compte
  suspecté (>3 appareils), falsifications, révocations.
- **Clés** : générer (lot jusqu'à 100), filtrer, révoquer, délier.
- **Utilisateurs** : voir plan + nb d'appareils ; **stop/bannir** (révoque toutes ses clés
  + retire le rôle Pro + DM de notification), **déconnecter** à distance, **alerte dans
  l'app**, **DM Discord** (via le bot), **rôle Pro +/−**.
- **Logs** : journal complet (login, redeem, commandes, blacklist hits, IP).
- **Blacklist** : liste des HWID bloqués, ajout/retrait manuel.
- **Features** : activer/désactiver chaque module à distance et changer sa portée
  (gratuit / Pro), appliqué au prochain heartbeat.

## Déploiement

```
server/   npm i && node keygen.js (une fois) && node server.js
```
Env serveur : `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `PUBLIC_URL`,
`SESSION_SECRET` (aléatoire 32+ octets), `LICENSE_PRIVATE_KEY` (keygen),
`ADMIN_DISCORD_IDS` (ton ID Discord).

Dans `src-tauri/src/license.rs` : `SERVER`, `DISCORD_CLIENT_ID`, `VERIFY_KEY_HEX`
(clé publique du keygen). Puis sur Windows : `npm run tauri build`.

## Durcissement — par ordre d'impact réel

1. **Signer le .exe (EV/OV)** : active la vérif Authenticode + confiance SmartScreen.
2. **Valeur maximale côté serveur** (le seul levier durable).
3. Vérifs de licence **dispersées** dans le code Rust (pas un seul `if pro`).
4. Token offline court (7 j) — ajuste selon ton public.
5. À éviter : packers Themida/VMProtect → faux positifs antivirus, mortels en pub TikTok.

## En une phrase

On ne rend pas le .exe incrackable (impossible) — on rend le **crack inutile** :
valeur côté serveur, clé liée au compte Discord, blacklist clé + PC immédiate (offline)
et propagée à tous les appareils dès le retour en ligne, le tout pilotable depuis le panel.

## 6. Analytics, télémétrie & churn (comprendre ce qui se passe)

Tout est dans le panel, alimenté par des données consenties :

- **Télémétrie opt-in** (désactivée par défaut, togglée dans l'app, onglet Sécurité) :
  l'app envoie un *snapshot* {score PC, résumé hardware} + des évènements d'usage
  (scan, optimisation appliquée). Aucune donnée perso, aucun fichier. Endpoint
  `/v1/telemetry`. C'est ce qui remplit l'analyse par client.
- **Onglet Analytics** : actifs 24h/7j, nouveaux, taux de conversion Pro, score PC moyen,
  churn 30j, courbes d'activité et d'activations (14 j), top des optimisations appliquées,
  répartition des plans. Graphes maison, zéro dépendance.
- **Onglet Churn** : raisons de désabonnement (sondage in-app quand l'abonnement expire,
  `/v1/churn_feedback`), liste « expire dans < 7 j » (à relancer en DM via le bot),
  liste des churn, retours récents. C'est là que tu vois *pourquoi* ils partent.
- **Analyse par client** (bouton « analyse » dans Utilisateurs) : hardware, score,
  appareils, clés, timeline d'activité, feedback de churn — pour diagnostiquer un cas précis.

Rappel confiance/RGPD : la télémétrie reste **opt-in explicite**. Ne l'active jamais en
douce — c'est exactement ce qui détruit la confiance que tu cherches à bâtir.

## Nouvelles optimisations ajoutées

HAGS (GPU scheduling), DNS rapide Cloudflare (réversible, DNS précédents journalisés),
effets visuels → performances, nettoyage Prefetch, suppression du délai de démarrage —
toutes avec impact annoncé honnêtement et, quand c'est réversible, intégrées au rollback.
