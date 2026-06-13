# PulseBoost

Optimiseur PC pour gamers (FiveM, Fortnite, Valorant, CS2, Warzone) — Tauri 2 + Rust + React.
Positionnement : **le seul optimiseur dont chaque changement est journalisé et réversible en 1 clic.**

## Structure

```
src-tauri/          Backend Rust (scan, tweaks, sécurité, score, client IA)
  src/safety.rs     ⭐ Point de restauration + journal + rollback — le différenciateur
  src/optimizations Registre des tweaks, chacun avec son chemin de revert
src/                Frontend React (dashboard, jauge, journal public)
server/server.js    Serveur Node (licence + effecteur Discord) qui détient la clé API Gemini
server/HOSTING.md   Déploiement serveur + bot sur un seul hébergeur Node
```

## Build (sur une machine Windows)

```bash
npm install
npm run tauri dev        # développement
npm run tauri build      # produit l'installeur NSIS dans src-tauri/target/release/bundle
```

Prérequis : Rust (rustup), Node 20+, WebView2 (préinstallé sur Win 10 21H2+ / Win 11).
L'app demande l'élévation admin via le manifeste NSIS `perMachine` (UAC propre au lancement).

## ⚠️ Sécurité — à ne pas négliger

1. **Jamais de clé API dans le .exe.** Le binaire appelle `server/server.js` (déployé sur votre
   serveur), qui détient `GEMINI_API_KEY`, vérifie la licence Pro et rate-limite.
2. **Signature de code obligatoire** avant les pubs TikTok : certificat OV (~150 €/an) ou EV
   (réputation SmartScreen immédiate). Sans signature, Defender + SmartScreen bloqueront
   l'installeur et vos taux de conversion s'effondreront. Renseigner `certificateThumbprint`
   dans `tauri.conf.json`.
3. Soumettre chaque release à VirusTotal et publier le lien (le badge in-app doit pointer
   vers un vrai rapport, jamais une image statique).

## Honnêteté produit (lisez ceci avant le marketing)

Le marché des "optimiseurs" est saturé d'arnaques précisément parce qu'ils promettent des
gains inventés. Pour que le module Confiance soit crédible :

- **Ne promettez jamais de FPS chiffrés.** L'impact réel des tweaks varie énormément :
  power plan et Game DVR = gains réels mais modestes ; nettoyage de fichiers temp =
  zéro FPS (espace disque seulement, et l'app le dit) ; Nagle/TCP = latence parfois,
  débit jamais. Le système prompt du proxy interdit déjà à l'IA d'inventer des %.
- Le meilleur argument mesurable : la section **Avant/Après** avec de vrais benchmarks
  (à implémenter via PresentMon — voir roadmap).
- Si le goulot est matériel (8 GB RAM, HDD), l'app le dit franchement
  (`limite_materielle`). C'est ça qui construit la réputation Discord/TikTok.

## Ce qui est implémenté vs roadmap

| Fait dans ce repo | Roadmap |
|---|---|
| Scan CPU/GPU/RAM/disques/OS/process/jeux | Parsing libraryfolders.vdf Steam (jeux hors C:) |
| Score local déterministe + analyse IA via proxy | Cache d'analyse côté proxy |
| 8 tweaks journalisés avec rollback complet | HPET/BCDEDIT, timer resolution (NtSetTimerResolution), HAGS, DNS benchmark, MTU |
| Point de restauration avant toute application | Rollback sélectif par tweak |
| Game Boost (priorité CPU High, jamais Realtime) | Standby list purge (EmptyStandbyList via NtSetSystemInformation), kill overlays, restauration auto à la fermeture du jeu |
| Journal public + onglet Sécurité | Benchmarks Avant/Après (PresentMon), overlay FPS |
| UI dashboard complète FR | Licence Pro (serveur + machine_id), télémétrie opt-in |

Notes techniques sur la roadmap :
- **Timer resolution** : appeler `NtSetTimerResolution` (crate `windows`) — mais depuis
  Win10 2004+, Windows gère la résolution par processus ; l'effet global est réduit.
  Tester avant de le vendre comme feature.
- **HPET/BCDEDIT** : modifier le BCD nécessite un redémarrage et peut rendre un PC
  non bootable si mal fait — à garder derrière une confirmation explicite + restore point.
- **Standby list** : nécessite le privilège `SeProfileSingleProcessPrivilege`.

## Freemium

Gating actuel : `pro_only` sur chaque tweak + `isPro` côté UI (stub). Pour la prod, la
vérification doit être **côté backend Rust ET côté proxy** (un flag JS se contourne en
30 secondes). Prévoir : clé de licence → JWT signé → vérifié à chaque `apply_tweaks` Pro.
