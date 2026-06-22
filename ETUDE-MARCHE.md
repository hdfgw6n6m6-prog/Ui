# PulseBoost — Étude de marché & revue produit

> Document de travail. Objectif : cadrer un produit **haut de gamme**, honnête et
> différenciant sur le marché saturé des « optimiseurs PC pour gamers ».
> Les chiffres de concurrents sont des ordres de grandeur publics ; une vraie
> validation demande un sondage Discord + des tests A/B sur la landing page.

---

## 1. Le marché en bref

Le marché « boost FPS / optimisation PC gaming » est **énorme en demande** (des
millions de recherches « how to get more fps », « fix stutter », « lower latency »)
mais **pourri par les arnaques**. C'est précisément l'opportunité de PulseBoost :
la **crédibilité** est rare, donc c'est elle qui devient le produit.

Trois familles d'acteurs :

| Famille | Exemples | Promesse | Réputation |
|---|---|---|---|
| Optimiseurs « 1 clic » | Razer Cortex, Wise Game Booster, Advanced SystemCare (IObit), Game Fire | « +X% FPS », nettoyage, boost | Mitigée → mauvaise (bloat, faux gains) |
| Nettoyeurs / repair | CCleaner, Outbyte PC Repair, Restoro/Reimage | Nettoyer, « réparer » Windows | Mauvaise (scareware, abonnements agressifs) |
| Outils « pros » / mesure | MSI Afterburner + RTSS, CapFrameX, Process Lasso, ISLC, FPS Monitor | Mesure réelle, contrôle fin | Bonne mais **réservée aux initiés** |
| Réseau / latence | ExitLag, WTFast, NoPing | Meilleur ping en jeu | Correcte mais payant/abonnement |

**Le trou dans le marché** : un outil **grand public ET honnête**, qui mesure
réellement (comme les outils pros) tout en restant simple (comme les outils 1 clic),
sans bloatware ni promesses mensongères. Personne n'occupe vraiment cette case.

---

## 2. Ce que les gens AIMENT (à renforcer)

- **Le « 1 clic »** qui marche sans réfléchir. (À garder absolument.)
- **Voir un avant/après chiffré et crédible** (FPS, 1% low, frametimes). C'est l'argument
  le plus partagé sur Reddit/YouTube quand il est honnête.
- **La légèreté** : un .exe < 50 Mo, pas de service qui tourne en fond, pas de pub.
- **La réversibilité / la confiance** : pouvoir tout annuler rassure énormément
  (c'est rare, et c'est notre différenciateur n°1).
- **Les profils par jeu** (FiveM, Valorant, CS2…) : les gens veulent du « fait pour MON jeu ».
- **L'optimisation réseau/latence** : très demandée par les joueurs compétitifs.
- **La transparence** : « qu'est-ce que ça a changé exactement ? » → journal lisible.

## 3. Ce que les gens DÉTESTENT (à éviter absolument)

- **Les faux FPS** : « +200 FPS garantis » → décrédibilise instantanément. ❌
- **Le bloatware / l'adware bundle** (la réputation de CCleaner/IObit en a souffert).
- **Le scareware** : « 4 821 problèmes détectés !! » pour faire peur et vendre. ❌
- **Les abonnements pièges** (difficiles à annuler, prix qui grimpe).
- **Casser Windows** sans retour arrière (registry tweaks irréversibles).
- **Les faux positifs antivirus** : un tweaker non signé = SmartScreen/Defender hurle.
- **Obliger un compte** sans raison claire (→ il FAUT justifier le login Discord).
- **Le « placebo »** : un bouton qui ne fait rien de mesurable.

## 4. Ce que les gens VEULENT (roadmap demande réelle)

1. **Mesure FPS réelle in-game** (overlay type RTSS/FPS Monitor) — le Graal.
2. **Benchmark avant/après** automatique et crédible. ✅ *(livré en v8, à fiabiliser)*
3. **Mode Low-End** : « j'ai un petit PC, aide-moi vraiment ». ✅ *(livré)*
4. **Profils par jeu** maintenus à jour. ✅ *(présent)*
5. **Réduction de latence** (réseau + input lag).
6. **Diagnostic honnête** : « ton vrai problème c'est la RAM/le HDD, pas un tweak ». ✅
7. **Nettoyage de caches** ciblé (shaders, FiveM…). ✅ *(livré v8)*
8. **Aucune surprise** : pas de redémarrage forcé, pas de risque caché.

---

## 5. Positionnement recommandé pour PulseBoost

> **« Le seul optimiseur PC qui te dit la vérité — et que tu peux annuler en 1 clic. »**

Trois piliers, à matraquer partout (app, landing, TikTok) :

1. **Honnête** — on mesure, on ne promet jamais de FPS magiques, on dit quand c'est le matériel.
2. **Réversible** — point de restauration + journal + rollback 1 clic. Zéro risque.
3. **Simple mais sérieux** — 1 clic pour les pressés, mode avancé + mesures pour les tryhards.

Le **ton** (Casual / Try Hard) et les **mesures réelles** sont nos armes face aux concurrents
qui sont soit infantilisants (1 clic placebo), soit élitistes (Afterburner).

---

## 6. Pricing (hypothèse à tester)

| Offre | Prix cible | Contenu | Rôle |
|---|---|---|---|
| **Gratuit** | 0 € | Scan, score, analyse gratuite, 1 clic (tweaks sûrs), benchmark, Low-End, monitoring | Acquisition + preuve d'honnêteté |
| **Pro mensuel** | 4,99–6,99 €/mois | Tweaks avancés (réseau, mémoire, HAGS), profils par jeu complets, analyse IA, chat IA, nettoyage Pro | Cœur du revenu |
| **Pro à vie** | 29–39 € one-shot | Tout le Pro, paiement unique | Convertit les anti-abonnement |

Notes :
- Le **gratuit doit être réellement utile** (sinon mauvaise réputation). Il sert de preuve.
- Éviter l'abonnement « piège » : annulation en 1 clic, rappel avant renouvellement.
- L'« à vie » casse l'objection n°1 des joueurs (« encore un abonnement »).

---

## 7. Revue de TOUTES les options actuelles (honnêteté assumée)

Légende impact : 🟢 réel / 🟡 variable / ⚪ ressenti ou hors-FPS (disque, confort).

### Optimisations (onglet Optimisations)
| Option | Ce que ça fait | Impact honnête | Risque | Accès |
|---|---|---|---|---|
| Power plan Haute perf | Empêche le throttling CPU | 🟡 (fort sur portable/vieux CPU) | nul (réversible) | Gratuit |
| Désactiver Game DVR | Stoppe l'enregistrement en fond | 🟢 moyen | nul | Gratuit |
| Mode Jeu Windows | Priorise le jeu au 1er plan | ⚪ faible | nul | Gratuit |
| Réactivité système (MMCSS) | Rend 20% CPU réservé au fond | 🟡 faible-moyen | nul | Gratuit |
| Priorité 1er plan | + de CPU au jeu actif | 🟡 faible-moyen | nul | Gratuit |
| Effets visuels → perf | Coupe animations Windows | ⚪ faible (PC modestes) | nul | Gratuit |
| Délai démarrage apps | Retire le délai au boot | ⚪ confort | nul | Gratuit |
| SysMain off (SSD) | Désactive Superfetch | ⚪ faible | nul | **Pro** |
| Nagle off (TcpNoDelay) | Envoie les petits paquets direct | 🟡 latence (FiveM/FPS) | faible | **Pro** |
| Compression mémoire off | Économise du CPU si RAM ≥ 16 Go | ⚪ faible | nul | **Pro** |
| HAGS (GPU scheduling) | GPU gère sa planif | 🟡 variable (reboot) | faible | **Pro** |
| DNS 1.1.1.1 | Résolution plus rapide | ⚪ pas de FPS (matchmaking) | nul | **Pro** |
| Network throttling off | Lève le bridage réseau | 🟡 multijoueur | faible | **Pro** |
| Priorité GPU/CPU jeux | MMCSS Games | 🟡 variable | faible | **Pro** |
| Power throttling off | Pas de bridage CPU | 🟡 (portables) | faible | **Pro** |
| DiagTrack off | Coupe la télémétrie Windows | ⚪ faible | faible | **Pro** |
| Accélération souris off | Visée 1:1 | ⚪ précision (pas de FPS) | nul | Gratuit |
| Nettoyer TEMP / Prefetch | Libère du disque | ⚪ disque, pas de FPS | faible (non réversible) | mixte |

### Nouveautés v8
| Option | Ce que ça fait | Impact honnête | Accès |
|---|---|---|---|
| Benchmark avant/après | Mesure CPU/RAM/temp + FPS (PresentMon) | 🟢 **preuve mesurée** | Gratuit |
| Mode Low-End | Diagnostic matériel + conseils honnêtes | 🟢 valeur de conseil | Gratuit |
| Nettoyage de caches | FiveM/RAGE/DX/Prefetch/TEMP | ⚪ disque | mixte (DX/Prefetch = Pro) |
| Profils par jeu | Set de tweaks adapté au jeu | 🟡 selon jeu | mixte |
| Analyse / Chat IA | Explication Gemini | valeur pédagogique | **Pro** |

**Conclusion de la revue** : aucun tweak ne « crée » des FPS magiques, et le produit
le dit. Les vrais gains viennent surtout de **Game DVR off**, **profils par jeu**,
**réseau/latence** et de la **mesure honnête** qui prouve l'effet. Le reste est du
confort ou du marginal — à présenter comme tel (c'est notre crédibilité).

---

## 8. Priorisation (quoi construire ensuite)

| Idée | Valeur user | Effort | Priorité |
|---|---|---|---|
| Overlay FPS in-game réel (RTSS-like) | ⭐⭐⭐⭐⭐ | élevé | **P0** (le plus demandé) |
| Bundle PresentMon + activer FPS auto | ⭐⭐⭐⭐ | moyen | **P0** |
| Réduction input lag / latence réseau mesurée | ⭐⭐⭐⭐ | moyen | **P1** |
| Paiement (Stripe) + clé auto par DM | ⭐⭐⭐ | moyen | **P1** (monétisation) |
| Signature de code (EV) anti-SmartScreen | ⭐⭐⭐ | admin | **P1** (sinon AV bloque) |
| Profils par jeu enrichis + auto-update | ⭐⭐⭐ | moyen | **P2** |
| UI panel admin pour audit/impersonation | ⭐⭐ | faible | **P2** |
| Partage de config entre potes | ⭐⭐ | faible | **P3** ✅ (base livrée) |

---

## 9. Recommandations design (vers le « haut de gamme »)

Direction visuelle proposée pour rendre l'app premium et cohérente :

- **Identité unique** : choisir UNE direction et s'y tenir partout (app + panel + landing).
  Aujourd'hui l'app est sombre/violet « gaming » et le panel est clair « Apple ». Incohérent.
- **Hiérarchie** : une action principale par écran, le reste en second plan. Moins, mais mieux.
- **Données crédibles** : mettre la **mesure** au centre (gros chiffres, courbes propres),
  pas les promesses. La preuve EST le marketing.
- **Micro-interactions sobres** : transitions douces, pas de clinquant. Le « haut de gamme »
  = calme et précision, pas surcharge d'effets.
- **Accessibilité** : contrastes AA, `prefers-reduced-motion`, tailles lisibles.
- **Onboarding** qui pose le contrat de confiance dès la 1re seconde. ✅ (livré v8)

> ⚠️ Décision à trancher : **garder le thème sombre gaming (raffiné premium)** ou
> **basculer l'app sur le thème clair façon Apple** (comme le panel) pour une identité
> unifiée. Les deux sont défendables ; ça conditionne tout le travail de redesign.

---

## 10. Garde-fous à ne jamais franchir

- Pas de FPS garantis chiffrés. Jamais.
- Pas de scareware, pas de bundle, pas de pub.
- Tout reste réversible et journalisé.
- Le gratuit reste réellement utile.
- Télémétrie strictement opt-in.

*La crédibilité est l'actif n°1. Une seule promesse mensongère et le bouche-à-oreille se retourne.*
