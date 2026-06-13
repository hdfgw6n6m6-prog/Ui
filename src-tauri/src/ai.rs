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
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("{SERVER}/v1/analyze"))
        .json(&json!({
            "session": session,
            "hwid": license::hwid(),
            "scan": scan,
            "locale": locale,
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
