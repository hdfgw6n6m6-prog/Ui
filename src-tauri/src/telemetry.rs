// telemetry.rs — telemetrie OPT-IN (desactivee par defaut).
// Aucune donnee envoyee sans consentement explicite de l'utilisateur.
// On envoie : des evenements d'usage (anonymises au niveau hardware) + un
// snapshot {score, hw} pour permettre l'analyse cote panel ("qu'est-ce qui
// ne va pas chez ce client"). Jamais de fichiers, jamais de donnees perso.

use serde_json::{json, Value};

const SERVER: &str = "https://api.tondomaine.com";

fn dir() -> std::path::PathBuf {
    let d = dirs::data_dir().unwrap_or_default().join("PulseBoost");
    let _ = std::fs::create_dir_all(&d); d
}
pub fn consent() -> bool {
    std::fs::read_to_string(dir().join("telemetry")).map(|v| v.trim() == "on").unwrap_or(false)
}
pub fn set_consent(on: bool) {
    let _ = std::fs::write(dir().join("telemetry"), if on { "on" } else { "off" });
}
fn session() -> Option<String> {
    std::fs::read_to_string(dir().join("session")).ok()
}

/// Envoi best-effort d'evenements + snapshot optionnel. Silencieux si pas de consentement.
pub async fn send(events: Vec<Value>, snapshot: Option<Value>) {
    if !consent() { return; }
    let Some(session) = session() else { return; };
    let body = json!({
        "session": session,
        "hwid": crate::license::hwid(),
        "events": events,
        "snapshot": snapshot,
    });
    let client = reqwest::Client::new();
    let _ = client.post(format!("{SERVER}/v1/telemetry"))
        .json(&body)
        .timeout(std::time::Duration::from_secs(10))
        .send().await;
}

/// Raccourci : un seul evenement.
pub async fn event(kind: &str, detail: Option<&str>) {
    send(vec![json!({ "type": kind, "detail": detail })], None).await;
}

/// Envoi du feedback de desabonnement (churn).
pub async fn churn_feedback(reason: &str, comment: &str) -> anyhow::Result<()> {
    let Some(session) = session() else { return Ok(()); };
    let client = reqwest::Client::new();
    client.post(format!("{SERVER}/v1/churn_feedback"))
        .json(&json!({ "session": session, "reason": reason, "comment": comment }))
        .timeout(std::time::Duration::from_secs(10))
        .send().await?;
    Ok(())
}
