// ai.rs — analyse IA via TON serveur (la cle API Gemini n'est JAMAIS dans le .exe).
//
// Modele : l'app envoie la SESSION Discord + le HWID + le scan. Le serveur verifie
// que le compte a un abonnement actif (et le feature flag ai_analysis) avant
// d'appeler Google Gemini. L'analyse est donc une feature 100% serveur : un binaire
// craque ne peut pas la produire.

use crate::license;
use anyhow::Result;
use serde_json::{json, Value};

const SERVER: &str = "https://api.tondomaine.com"; // <-- meme valeur que dans license.rs

pub async fn analyze(scan: Value, locale: &str) -> Result<Value> {
    let session = license::session_token().unwrap_or_default();
    let prefs = crate::prefs::load();
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{SERVER}/v1/analyze"))
        .json(&json!({
            "session": session,
            "hwid": license::hwid(),
            "scan": scan,
            "locale": locale,
            // Ton + mode Roast : le serveur ajuste le prompt Gemini en conséquence.
            "roast_mode": prefs.roast_mode,
            "tone": prefs.tone,
            "app_version": env!("CARGO_PKG_VERSION")
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;
    if !resp.status().is_success() {
        anyhow::bail!("Analyse IA indisponible ({}) — reservee aux abonnes Pro actifs.", resp.status());
    }
    Ok(resp.json().await?)
}

/// CHAT IA (support PC + app). Envoie l'historique + un contexte (profil/etat de
/// l'app) au serveur, qui interroge Gemini et renvoie { reply, action }.
/// L'action est seulement PROPOSEE : l'app la confirme et l'execute localement.
pub async fn chat(messages: Value, context: Value) -> Result<Value> {
    let session = license::session_token().unwrap_or_default();
    let prefs = crate::prefs::load();
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{SERVER}/v1/chat"))
        .json(&json!({
            "session": session,
            "hwid": license::hwid(),
            "messages": messages,
            "context": context,
            "locale": "fr",
            "roast_mode": prefs.roast_mode,
            "tone": prefs.tone,
            "app_version": env!("CARGO_PKG_VERSION")
        }))
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await?;
    if !resp.status().is_success() {
        anyhow::bail!("Assistant IA indisponible ({}) — reserve aux abonnes Pro actifs.", resp.status());
    }
    Ok(resp.json().await?)
}

/// Annonce + derniere version publiees par le serveur (public, pas d'auth).
pub async fn announcement() -> Result<Value> {
    let client = reqwest::Client::new();
    let resp = client
        .get(format!("{SERVER}/v1/announcement"))
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await?;
    Ok(resp.json().await?)
}
