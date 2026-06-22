// PulseBoost — point d'entrée backend (Rust / Tauri v2)
// Toute modification système passe par safety::Journal (réversibilité garantie).

mod ai;
mod benchmark;
mod cleanup;
mod hardware;
mod integrity;
mod license;
mod optimizations;
mod prefs;
mod safety;
mod score;
mod telemetry;

use optimizations::{TweakId, TweakInfo};
use serde_json::Value;

/// Scan complet du PC (CPU, GPU, RAM, disques, OS, process gourmands, jeux installés).
#[tauri::command]
async fn scan_hardware() -> Result<Value, String> {
    let scan = hardware::full_scan().await.map_err(|e| e.to_string())?;
    // Snapshot opt-in pour l'analyse client côté panel (score + hardware résumé).
    let s = score::compute(&scan);
    let snap = serde_json::json!({
        "score": s["score"],
        "hw": { "cpu": scan["cpu"], "gpu": scan["gpu"], "ram": scan["ram"], "os": scan["os"] }
    });
    let _ = telemetry::send(vec![serde_json::json!({ "type": "scan", "detail": null })], Some(snap)).await;
    Ok(scan)
}

/// Consentement télémétrie (lecture).
#[tauri::command]
fn telemetry_consent() -> bool { telemetry::consent() }

/// Consentement télémétrie (écriture).
#[tauri::command]
fn set_telemetry_consent(on: bool) { telemetry::set_consent(on); }

/// Envoi du feedback de désabonnement (raison + commentaire).
#[tauri::command]
async fn submit_churn(reason: String, comment: String) -> Result<(), String> {
    telemetry::churn_feedback(&reason, &comment).await.map_err(|e| e.to_string())
}

/// Stats temps réel légères pour le dashboard (poll ~2 s).
#[tauri::command]
fn live_stats() -> Result<Value, String> {
    hardware::live_stats().map_err(|e| e.to_string())
}

/// Liste des tweaks disponibles + état actuel (appliqué / non appliqué / non pertinent).
#[tauri::command]
async fn list_tweaks() -> Result<Vec<TweakInfo>, String> {
    optimizations::list_all().await.map_err(|e| e.to_string())
}

/// Porte de sécurité : à appeler au lancement AVANT toute fonction Pro.
/// Vérifie blacklist locale, debugueur, signature — fonctionne hors-ligne.
#[tauri::command]
fn security_gate() -> Value {
    let v = integrity::gate();
    serde_json::json!({ "state": v.state, "reason": v.reason })
}

/// Login Discord (OAuth, scope identify). Ouvre le navigateur, récupère la session.
#[tauri::command]
async fn discord_login() -> Result<String, String> {
    license::discord_login().await.map_err(|e| e.to_string())
}

#[tauri::command]
fn logged_in() -> bool { license::is_logged_in() }

#[tauri::command]
fn logout() { license::logout(); }

/// Redeem : lie une clé au compte Discord connecté.
#[tauri::command]
async fn redeem_key(key: String) -> Result<Value, String> {
    license::redeem(&key).await.map_err(|e| e.to_string())
}

/// État Pro courant (vérifié cryptographiquement, marche hors-ligne).
#[tauri::command]
fn license_status() -> Value {
    match license::current_status() {
        Some(c) => serde_json::json!({ "pro": true, "plan": c.plan, "exp": c.exp }),
        None => serde_json::json!({ "pro": false }),
    }
}

/// Heartbeat : revérifie l'abonnement + récupère feature flags + commandes admin.
/// Réagit aussi à une blacklist décidée côté serveur (propagation).
#[tauri::command]
async fn license_heartbeat() -> Value {
    match license::entitlement().await {
        Ok(body) => {
            if body["blacklisted"].as_bool() == Some(true) {
                integrity::trip_blacklist("serveur");
            }
            body
        }
        Err(_) => serde_json::json!({ "pro": false }),
    }
}

/// Applique une sélection de tweaks. Crée un point de restauration AVANT,
/// journalise chaque valeur d'origine, puis applique.
/// Bloqué si blacklisté ; tweaks Pro exigent une licence valide.
#[tauri::command]
async fn apply_tweaks(ids: Vec<TweakId>) -> Result<Value, String> {
    if integrity::is_blacklisted() {
        return Err("Ce poste est bloqué.".into());
    }
    let pro_active = license::current_status().is_some();
    if !pro_active {
        let all = optimizations::list_all().await.map_err(|e| e.to_string())?;
        let wants_pro = ids.iter().any(|id| all.iter().any(|t| &t.id == id && t.pro_only));
        if wants_pro {
            return Err("Optimisation Pro : connecte-toi avec Discord et active ta clé.".into());
        }
    }
    let mut journal = safety::Journal::load().map_err(|e| e.to_string())?;
    safety::create_restore_point("PulseBoost — avant optimisations")
        .await
        .map_err(|e| format!("Point de restauration impossible, rien n'a été modifié : {e}"))?;
    let report = optimizations::apply(&ids, &mut journal)
        .await
        .map_err(|e| e.to_string())?;
    journal.save().map_err(|e| e.to_string())?;
    for id in &ids {
        let _ = telemetry::event("tweak_applied", Some(&format!("{id:?}"))).await;
    }
    Ok(report)
}

/// ROLLBACK COMPLET : restaure chaque valeur d'origine journalisée, en 1 clic.
#[tauri::command]
async fn rollback_all() -> Result<Value, String> {
    let mut journal = safety::Journal::load().map_err(|e| e.to_string())?;
    let report = optimizations::rollback(&mut journal)
        .await
        .map_err(|e| e.to_string())?;
    journal.save().map_err(|e| e.to_string())?;
    // Compteur de rollbacks (clin d'œil "Survivant de 47 rollbacks").
    let _ = prefs::record_rollback();
    Ok(report)
}

/// Score de santé local (déterministe, calculé sans IA — l'IA ne fait que l'expliquer).
#[tauri::command]
async fn health_score() -> Result<Value, String> {
    let scan = hardware::full_scan().await.map_err(|e| e.to_string())?;
    Ok(score::compute(&scan))
}

/// ANALYSE GRATUITE (sans login, sans Pro, sans serveur) : estime un gain FPS
/// potentiel en fourchette honnête à partir du scan local. Pas de chiffre garanti.
#[tauri::command]
async fn free_analysis() -> Result<Value, String> {
    let scan = hardware::full_scan().await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "estimate": score::estimate_gain(&scan),
        "health": score::compute(&scan),
        "running_game": scan["running_game"],
    }))
}

/// Analyse IA : envoie le scan au proxy (qui détient la clé API) et retourne
/// recommandations + explications en langage naturel.
#[tauri::command]
async fn ai_analysis(scan: Value, locale: String) -> Result<Value, String> {
    ai::analyze(scan, &locale).await.map_err(|e| e.to_string())
}

/// Ouvre une URL (ex. lien de mise à jour) dans le navigateur.
#[tauri::command]
fn open_url(url: String) { license::open_url(&url); }

/// Annonce + dernière version publiées par le serveur (bandeau in-app).
#[tauri::command]
async fn announcement() -> Result<Value, String> {
    ai::announcement().await.map_err(|e| e.to_string())
}

/// CHAT IA (support PC + app) : relaie l'historique + le contexte au serveur
/// (qui détient la clé Gemini) et renvoie { reply, action }. L'action proposée
/// est exécutée par l'app UNIQUEMENT après confirmation de l'utilisateur.
#[tauri::command]
async fn ai_chat(messages: Value, context: Value) -> Result<Value, String> {
    ai::chat(messages, context).await.map_err(|e| e.to_string())
}

/// RÉINITIALISER LE PROFIL : annule d'abord toutes les optimisations (PC remis à
/// l'état d'origine), vide le journal, déconnecte le compte et coupe la télémétrie.
/// Action destructive — l'UI exige une confirmation explicite avant de l'appeler.
#[tauri::command]
async fn reset_profile() -> Result<Value, String> {
    let mut journal = safety::Journal::load().map_err(|e| e.to_string())?;
    let report = optimizations::rollback(&mut journal)
        .await
        .map_err(|e| e.to_string())?;
    // Vide complètement le journal local, déconnecte, coupe la télémétrie.
    let _ = safety::Journal::default().save();
    license::logout();
    telemetry::set_consent(false);
    Ok(serde_json::json!({ "ok": true, "reverted": report["reverted"] }))
}

/// GAME BOOST : applique le profil du jeu choisi (priorité CPU, overlays, standby list…).
#[tauri::command]
async fn game_boost(game: String) -> Result<Value, String> {
    let mut journal = safety::Journal::load().map_err(|e| e.to_string())?;
    let report = optimizations::game_boost(&game, &mut journal)
        .await
        .map_err(|e| e.to_string())?;
    journal.save().map_err(|e| e.to_string())?;
    Ok(report)
}

/// OPTIMISATION ADAPTATIVE — jeu actuellement lancé (ou None).
#[tauri::command]
fn active_game() -> Option<&'static str> {
    hardware::detect_running_game()
}

/// Détail du profil recommandé pour un jeu (tweaks + priorité + explication),
/// sans rien appliquer : sert à montrer ce qui sera fait avant validation.
#[tauri::command]
fn game_profile(game: String) -> Result<Value, String> {
    optimizations::profile_for(&game)
        .and_then(|p| serde_json::to_value(p).ok())
        .ok_or_else(|| "profil de jeu inconnu".to_string())
}

/// Applique le profil adaptatif d'un jeu : point de restauration AVANT, tweaks
/// réversibles (filtrés selon la licence) + priorité CPU. Tout est journalisé.
#[tauri::command]
async fn apply_game_profile(game: String) -> Result<Value, String> {
    if integrity::is_blacklisted() {
        return Err("Ce poste est bloqué.".into());
    }
    let pro = license::current_status().is_some();
    let mut journal = safety::Journal::load().map_err(|e| e.to_string())?;
    safety::create_restore_point("PulseBoost — profil de jeu")
        .await
        .map_err(|e| format!("Point de restauration impossible, rien n'a été modifié : {e}"))?;
    let report = optimizations::apply_profile(&game, pro, &mut journal)
        .await
        .map_err(|e| e.to_string())?;
    journal.save().map_err(|e| e.to_string())?;
    let _ = telemetry::event("game_profile_applied", Some(&game)).await;
    Ok(report)
}

/// Journal lisible de TOUT ce qui a été modifié (transparence totale).
#[tauri::command]
fn change_log() -> Result<Value, String> {
    safety::Journal::load()
        .map(|j| j.as_public_log())
        .map_err(|e| e.to_string())
}

// ----------------------------------------------------------------------------
// v8 — Benchmark honnête (CPU/RAM/temp + FPS via PresentMon si dispo)
// ----------------------------------------------------------------------------

/// Lance un benchmark de `seconds` secondes (borné 5–60). Mesures réelles.
#[tauri::command]
async fn run_benchmark(seconds: u64) -> Result<Value, String> {
    benchmark::run_benchmark(seconds).await.map_err(|e| e.to_string())
}

/// Compare deux mesures (avant/après). Deltas réels, aucun FPS inventé.
#[tauri::command]
fn compare_benchmark(before: Value, after: Value) -> Result<Value, String> {
    benchmark::compare(before, after).map_err(|e| e.to_string())
}

// ----------------------------------------------------------------------------
// v8 — Nettoyage de caches (mesuré, tracé, point de restauration préalable)
// ----------------------------------------------------------------------------

/// Scanne les caches nettoyables et estime l'espace récupérable.
#[tauri::command]
async fn scan_caches() -> Result<Value, String> {
    let pro = license::current_status().is_some();
    cleanup::scan_caches(pro).map_err(|e| e.to_string())
}

/// Nettoie les caches sélectionnés. Point de restauration AVANT, chaque dossier journalisé.
#[tauri::command]
async fn clean_caches(ids: Vec<String>) -> Result<Value, String> {
    if integrity::is_blacklisted() {
        return Err("Ce poste est bloqué.".into());
    }
    let pro = license::current_status().is_some();
    let mut journal = safety::Journal::load().map_err(|e| e.to_string())?;
    safety::create_restore_point("PulseBoost — nettoyage des caches")
        .await
        .map_err(|e| format!("Point de restauration impossible, rien n'a été supprimé : {e}"))?;
    let report = cleanup::clean_caches(&ids, pro, &mut journal)
        .await
        .map_err(|e| e.to_string())?;
    journal.save().map_err(|e| e.to_string())?;
    Ok(report)
}

// ----------------------------------------------------------------------------
// v8 — Mode Low-End (diagnostic matériel honnête)
// ----------------------------------------------------------------------------

/// Rapport "Low-End" : goulots matériels + conseils honnêtes (RAM/SSD/CPU/GPU).
#[tauri::command]
async fn low_end_report() -> Result<Value, String> {
    let scan = hardware::full_scan().await.map_err(|e| e.to_string())?;
    Ok(score::low_end_report(&scan))
}

// ----------------------------------------------------------------------------
// v8 — Préférences, ton, badges, import/export de config
// ----------------------------------------------------------------------------

#[tauri::command]
fn get_prefs() -> Value { prefs::get() }

#[tauri::command]
fn set_prefs(prefs: Value) -> Value { crate::prefs::set(prefs) }

#[tauri::command]
fn tone_message(kind: String) -> String { prefs::tone_message(&kind) }

#[tauri::command]
fn record_rollback() -> Value { prefs::record_rollback() }

#[tauri::command]
async fn export_config() -> Result<Value, String> {
    prefs::export_config().await.map_err(|e| e.to_string())
}

#[tauri::command]
fn import_config(config: Value) -> Result<Value, String> {
    prefs::import_config(config).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scan_hardware,
            live_stats,
            list_tweaks,
            apply_tweaks,
            rollback_all,
            health_score,
            free_analysis,
            ai_analysis,
            ai_chat,
            open_url,
            announcement,
            reset_profile,
            game_boost,
            active_game,
            game_profile,
            apply_game_profile,
            change_log,
            security_gate,
            discord_login,
            logged_in,
            logout,
            redeem_key,
            license_status,
            license_heartbeat,
            telemetry_consent,
            set_telemetry_consent,
            submit_churn,
            run_benchmark,
            compare_benchmark,
            scan_caches,
            clean_caches,
            low_end_report,
            get_prefs,
            set_prefs,
            tone_message,
            record_rollback,
            export_config,
            import_config
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de PulseBoost");
}
