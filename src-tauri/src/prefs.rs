// prefs.rs — préférences locales + ton de l'app + badges.
//
// Stockées dans %LOCALAPPDATA%\PulseBoost\prefs.json. Tout est local, rien n'est
// envoyé (sauf le ton / roast_mode joints aux requêtes IA, côté ai.rs).

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

const SURVIVOR_BADGE: &str = "Survivant de 47 rollbacks";

#[derive(Serialize, Deserialize, Clone)]
pub struct Prefs {
    /// "casual" (par défaut, bienveillant) | "tryhard" (compétitif, cash).
    #[serde(default = "default_tone")]
    pub tone: String,
    #[serde(default = "yes")]
    pub sounds: bool,
    /// Animation exagérée "Fake Boost +847 FPS" (purement cosmétique, assumée).
    #[serde(default)]
    pub fake_boost: bool,
    /// Mode "Roast" : l'IA chambre (gentiment) l'utilisateur.
    #[serde(default)]
    pub roast_mode: bool,
    #[serde(default)]
    pub onboarding_done: bool,
    /// Overlay de monitoring en jeu (beta — drapeau/indice seulement).
    #[serde(default)]
    pub overlay_beta: bool,
    #[serde(default)]
    pub rollback_count: u32,
    #[serde(default)]
    pub badges: Vec<String>,
}

fn default_tone() -> String { "casual".into() }
fn yes() -> bool { true }

impl Default for Prefs {
    fn default() -> Self {
        Self {
            tone: default_tone(),
            sounds: true,
            fake_boost: false,
            roast_mode: false,
            onboarding_done: false,
            overlay_beta: false,
            rollback_count: 0,
            badges: vec![],
        }
    }
}

fn path() -> PathBuf {
    let d = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("PulseBoost");
    let _ = std::fs::create_dir_all(&d);
    d.join("prefs.json")
}

pub fn load() -> Prefs {
    std::fs::read_to_string(path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(p: &Prefs) -> Result<()> {
    std::fs::write(path(), serde_json::to_string_pretty(p)?)?;
    Ok(())
}

fn val(p: &Prefs) -> Value {
    serde_json::to_value(p).unwrap_or(Value::Null)
}

pub fn get() -> Value { val(&load()) }

/// Applique un patch partiel (tone/toggles uniquement — jamais badges/compteur).
fn apply_patch(p: &mut Prefs, patch: &Value) {
    if let Some(v) = patch.get("tone").and_then(|v| v.as_str()) {
        if v == "casual" || v == "tryhard" { p.tone = v.into(); }
    }
    if let Some(v) = patch.get("sounds").and_then(|v| v.as_bool()) { p.sounds = v; }
    if let Some(v) = patch.get("fake_boost").and_then(|v| v.as_bool()) { p.fake_boost = v; }
    if let Some(v) = patch.get("roast_mode").and_then(|v| v.as_bool()) { p.roast_mode = v; }
    if let Some(v) = patch.get("onboarding_done").and_then(|v| v.as_bool()) { p.onboarding_done = v; }
    if let Some(v) = patch.get("overlay_beta").and_then(|v| v.as_bool()) { p.overlay_beta = v; }
}

pub fn set(patch: Value) -> Value {
    let mut p = load();
    apply_patch(&mut p, &patch);
    let _ = save(&p);
    val(&p)
}

/// Incrémente le compteur de rollbacks et décerne le badge à 47 (clin d'œil).
pub fn record_rollback() -> Value {
    let mut p = load();
    p.rollback_count = p.rollback_count.saturating_add(1);
    if p.rollback_count >= 47 && !p.badges.iter().any(|b| b == SURVIVOR_BADGE) {
        p.badges.push(SURVIVOR_BADGE.into());
    }
    let _ = save(&p);
    val(&p)
}

/// Message adapté au ton (Casual / Try Hard) pour les retours d'action.
pub fn tone_message(kind: &str) -> String {
    let tryhard = load().tone == "tryhard";
    match (kind, tryhard) {
        ("optimize_ok", false) => "C'est fait — ton PC est optimisé. Tout reste réversible, zéro stress. 👍",
        ("optimize_ok", true) => "Optimisations appliquées. Restore point créé, full réversible. GG — va tryhard. 🔥",
        ("rollback_ok", false) => "Tout est revenu à l'état d'origine. Ni vu, ni connu. ✨",
        ("rollback_ok", true) => "Rollback complet. PC remis clean, zéro trace. EZ.",
        ("scan_done", false) => "Analyse terminée — voici l'état réel de ton PC.",
        ("scan_done", true) => "Scan fini. Les vrais chiffres, pas du marketing. 📊",
        _ => "",
    }
    .to_string()
}

/// Exporte la config (prefs + tweaks actuellement appliqués) pour partage/sauvegarde.
pub async fn export_config() -> Result<Value> {
    let p = load();
    let tweaks: Vec<Value> = crate::optimizations::list_all()
        .await
        .map(|list| {
            list.into_iter()
                .filter(|t| t.applied)
                .filter_map(|t| serde_json::to_value(&t.id).ok())
                .collect()
        })
        .unwrap_or_default();
    Ok(serde_json::json!({
        "version": 8,
        "app": "PulseBoost",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "prefs": val(&p),
        "tweaks": tweaks,
    }))
}

/// Importe une config : applique le ton/toggles immédiatement, renvoie les ids de
/// tweaks à appliquer (l'app les passe à `apply_tweaks` → point de restauration).
pub fn import_config(config: Value) -> Result<Value> {
    let mut p = load();
    if let Some(pr) = config.get("prefs") {
        apply_patch(&mut p, pr);
    }
    let _ = save(&p);
    let tweaks = config.get("tweaks").cloned().unwrap_or(serde_json::json!([]));
    Ok(serde_json::json!({ "prefs": val(&p), "tweaks": tweaks }))
}
