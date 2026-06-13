# PulseBoost — Analyse marché & refonte design/UX

Document de travail qui motive la refonte de l'interface et de l'ergonomie.
Objectif fixé : **la plus performante possible** (à l'usage) et **la plus simple
possible**, en s'appuyant sur ce que les joueurs aiment / détestent / réclament
chez les optimiseurs concurrents.

---

## 1. Ce que font les concurrents (panorama)

| Outil | Modèle | Forces perçues | Reproches récurrents |
|---|---|---|---|
| **Razer Cortex** | Gratuit (data/ads) | 1-clic, ferme les process, nettoyage | « snakeoil/bloatware », pubs, inutile sur PC sain, casse parfois des jeux |
| **Hone.gg / Hypertune** | Abonnement | Beaucoup de tweaks, marketing FPS | paywall agressif (10 tweaks puis payer), « subscription annoyante » |
| **Process Lasso** | Free + Pro | ProBalance (affinité/priorité CPU), réduit le stutter, **respecté** | austère, technique, pas grand public |
| **MSI Afterburner** | Gratuit | **Overlay temps réel** (FPS, temp, usage/cœur), référence | overclock = intimidant pour un débutant |
| **Smart Game Booster** | Free + Pro | Informatif, monitoring | manque defrag/driver updater, upsells |
| **Outils « +40 FPS garantis »** | Payant | promesses | **arnaques**, registry agressif, irréversible |

Sources : esports.gg (Best PC Optimizers 2025), tweaklibrary, Razer Insider/Steam
forums, XDA (« programs I never install »), SlashGear (underrated tools), Hone
Trustpilot, hone.gg, hypertune.gg.

---

## 2. Ce que les joueurs AIMENT (à amplifier)

1. **1-clic, zéro connaissance technique** requise.
2. **Réversibilité + point de restauration** avant toute action — cité comme
   critère de confiance n°1 (et c'est *déjà* le moat de PulseBoost).
3. **Mesure avant/après** honnête (ressources libérées, marge CPU/RAM) plutôt
   que des FPS inventés.
4. **Monitoring temps réel** lisible (CPU/GPU/RAM/temp), façon Afterburner.
5. **Gestion priorité/affinité CPU par jeu** (l'ingrédient « secret » de Process
   Lasso qui réduit réellement le stutter).
6. **Transparence** : voir exactement ce que chaque action modifie.

## 3. Ce que les joueurs DÉTESTENT (à bannir)

1. **Promesses chiffrées bidon** (« +40 FPS »). → on annonce faible/moyen/variable.
2. **Bloatware, pubs, upsells** qui interrompent. → zéro pub, Pro non intrusif.
3. **Registry agressif irréversible** qui casse le PC. → tout journalisé/réversible.
4. **Paywall brutal** (Hone : 10 tweaks puis mur). → le gratuit reste utile et
   honnête ; le Pro ajoute, ne rançonne pas.
5. **Outils inutiles sur PC sain** qui « trouvent » de faux problèmes. → si le PC
   est propre, on le DIT au lieu d'inventer.

## 4. Ce qu'ils RÉCLAMENT (à ajouter)

- Benchmark **Avant/Après** visible.
- **Overlay/monitoring** temps réel.
- **Profils par jeu** (priorité CPU, fermeture overlays, restauration auto).
- Contrôles clairs + explication de chaque tweak.

---

## 5. Principes de la refonte UX

1. **Une action évidente.** L'écran d'accueil propose UN bouton maître
   « Optimiser en 1 clic » (applique le jeu de tweaks recommandés, sûrs et
   réversibles, après point de restauration). Le détail reste accessible pour les
   avancés, mais n'est jamais un prérequis.
2. **La confiance est visible en permanence** : bandeau « Point de restauration ·
   100 % réversible · Tout journalisé » sous l'action principale.
3. **Mesurer, pas promettre.** Carte « Mesure » : échantillonne les stats réelles
   (marge CPU, RAM libre, temp) avant/après et affiche le delta — honnête, sans
   FPS inventés.
4. **Monitoring temps réel** intégré (sparklines CPU/RAM/temp) au lieu de 3 chiffres
   figés.
5. **Hiérarchie Recommandé / Avancé** dans les optimisations : les sûrs sont
   pré-cochés, les sensibles (réseau, HAGS, mémoire) sont regroupés et expliqués.
6. **Pro non intrusif** : le gratuit reste pleinement fonctionnel ; le Pro est une
   carte d'invitation claire, jamais un mur ni une pub.
7. **Accessibilité** : focus visibles, `prefers-reduced-motion`, contrastes AA,
   navigation clavier.

## 6. Traduction concrète dans le code (cette itération — frontend)

- `styles.css` : nouveau design system (échelle typo, top bar, segments, bandeau
  confiance, sparklines, états).
- `App.jsx` : accueil recentré sur l'action 1-clic + bandeau confiance + mesure
  avant/après + monitoring live ; optimisations en Recommandé/Avancé ; Pro
  recadré ; sécurité inchangée sur le fond (journal + rollback), réhabillée.
- `components/LiveMonitor.jsx` : monitoring temps réel à sparklines (réutilise la
  commande `live_stats`, aucun nouveau backend requis).
- `components/QuickMeasure.jsx` : mesure avant/après basée sur `live_stats` réel.
- `components/ScoreGauge.jsx` : conservé (signature « compte-tours »), réglages fins.

Aucune commande Tauri nouvelle n'est requise : la refonte s'appuie sur l'API Rust
existante (`scan_hardware`, `health_score`, `list_tweaks`, `apply_tweaks`,
`rollback_all`, `live_stats`, `game_boost`, `ai_analysis`, licence…), donc elle
reste buildable telle quelle.

## 7. Suite (backend, déjà dans la roadmap PASSATION)

Benchmark FPS réel (PresentMon), overlay en jeu, affinité CPU par jeu (Process
Lasso-like), fermeture/restauration des overlays Steam/Discord — à câbler côté
Rust pour transformer la « Mesure » honnête en vrai Avant/Après FPS.
