// license.rs — cote client : login Discord (OAuth loopback) + redeem + entitlement.
//
// Modele : l'utilisateur se connecte avec Discord (pas de saisie de cle au login).
// La SESSION (signee HMAC par le serveur) identifie le compte. Ensuite il "redeem"
// une cle -> le serveur la lie a son ID Discord. L'entitlement est verifie par
// compte Discord. Un token Ed25519 signe permet la verification hors-ligne et
// tamper-proof cote app.

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;

const SERVER: &str = "https://zeubi.xyz"; // <-- ton serveur
const DISCORD_CLIENT_ID: &str = "1515481136145629214";   // <-- application Discord
// Cle PUBLIQUE Ed25519 (hex, 32 octets) depuis `node keygen.js`. Publique = OK dans le binaire.
const VERIFY_KEY_HEX: &str = "86b59b5300b57456addc2a1c0eabc7268bdffb76b32b4e79d609df2666d13836";

#[derive(Serialize, Deserialize, Clone)]
pub struct Claims {
    pub id: String,   // discord id
    pub hwid: String,
    pub pro: bool,
    pub plan: String,
    pub exp: i64,
    pub iat: i64,
}

/// Empreinte materielle stable (carte mere + CPU + disque) -> SHA-256.
pub fn hwid() -> String {
    let q = |s: &str| {
        Command::new("powershell")
            .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", s])
            .output().ok()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default()
    };
    let board = q("(Get-CimInstance Win32_BaseBoard).SerialNumber");
    let cpu = q("(Get-CimInstance Win32_Processor).ProcessorId");
    let disk = q("(Get-CimInstance Win32_DiskDrive | Select -First 1).SerialNumber");
    let mut h = Sha256::new();
    h.update(format!("{board}|{cpu}|{disk}|pulseboost-salt-v1"));
    format!("{:x}", h.finalize())
}

/// LOGIN DISCORD : ouvre le navigateur, recupere la session via un listener loopback.
/// Renvoie le nom d'utilisateur Discord.
pub async fn discord_login() -> Result<String> {
    // 1) listener local sur un port libre
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let nonce: u32 = rand_u32();
    let state = base64_url(&serde_json::to_vec(&serde_json::json!({ "port": port, "nonce": nonce }))?);

    // 2) ouvrir Discord OAuth (redirige vers SERVER/auth/callback)
    //    scope `identify email` : Discord affiche « accéder à ton e-mail » sur l'écran de consentement.
    let auth = format!(
        "https://discord.com/oauth2/authorize?client_id={DISCORD_CLIENT_ID}\
         &response_type=code&scope=identify%20email&redirect_uri={}&state={state}",
        urlencode(&format!("{SERVER}/auth/callback"))
    );
    open_browser(&auth);

    // 3) attendre le retour du navigateur sur 127.0.0.1:port.
    //    L'accept() est BLOQUANT : on le déporte dans spawn_blocking pour ne PAS
    //    geler l'exécuteur async Tokio (c'était LE bug du login), avec un timeout
    //    global pour ne pas rester coincé si l'utilisateur ferme l'onglet.
    listener.set_nonblocking(false)?;
    let accept = tokio::task::spawn_blocking(move || -> std::io::Result<(String, String)> {
        let (mut stream, _) = listener.accept()?;
        let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(120)));
        let mut buf = [0u8; 4096];
        let n = stream.read(&mut buf)?;
        let req = String::from_utf8_lossy(&buf[..n]).to_string();
        let line = req.lines().next().unwrap_or("").to_string();
        // GET /?session=...&name=... HTTP/1.1
        let query = line.split_whitespace().nth(1).unwrap_or("").to_string();
        let mut session = String::new();
        let mut name = String::new();
        if let Some(qpos) = query.find('?') {
            for kv in query[qpos + 1..].split('&') {
                let mut it = kv.splitn(2, '=');
                match (it.next(), it.next()) {
                    (Some("session"), Some(v)) => session = urldecode(v),
                    (Some("name"), Some(v)) => name = urldecode(v),
                    _ => {}
                }
            }
        }
        let html = "<!doctype html><html><head><meta charset='utf-8'><title>PulseBoost</title></head>\
                    <body style=\"margin:0;font-family:-apple-system,Segoe UI,sans-serif;background:#f5f5f7;color:#1d1d1f;display:flex;align-items:center;justify-content:center;height:100vh\">\
                    <div style=\"text-align:center;background:#fff;padding:48px 56px;border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.12)\">\
                    <div style=\"font-size:42px\">✅</div>\
                    <h2 style=\"margin:14px 0 6px\">Connexion réussie</h2>\
                    <p style=\"color:#6e6e73;margin:0\">Tu peux fermer cet onglet et revenir dans PulseBoost.</p>\
                    </div></body></html>";
        let _ = stream.write_all(
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type:text/html;charset=utf-8\r\nContent-Length:{}\r\nConnection:close\r\n\r\n{}",
                html.len(), html
            )
            .as_bytes(),
        );
        let _ = stream.flush();
        Ok((session, name))
    });

    // Timeout global : 3 min pour finir l'OAuth dans le navigateur, sinon on rend la main.
    let (session, name) = match tokio::time::timeout(std::time::Duration::from_secs(180), accept).await {
        Ok(join) => join.map_err(|e| anyhow::anyhow!("thread de connexion: {e}"))??,
        Err(_) => bail!("connexion Discord expirée (aucune réponse). Réessaie."),
    };

    if session.is_empty() { bail!("connexion Discord annulee"); }
    store("session", &session)?;
    Ok(name)
}

/// REDEEM : lie une cle au compte Discord connecte.
pub async fn redeem(key: &str) -> Result<Value> {
    let session = load("session")?;
    let client = reqwest::Client::new();
    let resp = client.post(format!("{SERVER}/v1/redeem"))
        .json(&serde_json::json!({ "session": session, "key": key.trim().to_uppercase(), "hwid": hwid() }))
        .timeout(std::time::Duration::from_secs(15)).send().await?;
    if !resp.status().is_success() {
        let e: Value = resp.json().await.unwrap_or_default();
        bail!(e["error"].as_str().unwrap_or("redeem refuse").to_string());
    }
    Ok(resp.json().await?)
}

/// ENTITLEMENT (heartbeat) : verifie l'abonnement du compte, renouvelle le token,
/// recupere les feature flags et une eventuelle commande/alerte admin.
/// Signale aussi au serveur si une falsification locale a ete detectee
/// (-> blacklist serveur propagee a tout le compte).
pub async fn entitlement() -> Result<Value> {
    let session = load("session")?;
    let client = reqwest::Client::new();
    let tampered = crate::integrity::is_blacklisted();
    let resp = client.post(format!("{SERVER}/v1/entitlement"))
        .json(&serde_json::json!({ "session": session, "hwid": hwid(), "tampered": tampered }))
        .timeout(std::time::Duration::from_secs(15)).send().await?;
    if !resp.status().is_success() {
        clear("token"); // banni / session invalide -> retombe en gratuit
        bail!("entitlement refuse");
    }
    let body: Value = resp.json().await?;
    if let Some(tok) = body["token"].as_str() {
        verify_token(tok)?;          // verif crypto avant de faire confiance
        store("token", tok)?;
    }
    Ok(body)
}

/// Verifie la signature Ed25519 d'un token "<payload>.<sig>".
pub fn verify_token(token: &str) -> Result<Claims> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
    use ed25519_dalek::{Signature, Verifier, VerifyingKey};
    let (b, s) = token.split_once('.').ok_or_else(|| anyhow::anyhow!("token malforme"))?;
    let body = B64.decode(b)?;
    let sig = B64.decode(s)?;
    let key: [u8; 32] = hex::decode(VERIFY_KEY_HEX)?.try_into().map_err(|_| anyhow::anyhow!("cle publique invalide"))?;
    VerifyingKey::from_bytes(&key)?.verify(&body, &Signature::from_slice(&sig)?)?;
    let c: Claims = serde_json::from_slice(&body)?;
    if c.exp < chrono::Utc::now().timestamp_millis() { bail!("token expire"); }
    if c.hwid != hwid() { bail!("token emis pour un autre PC"); }
    Ok(c)
}

/// Etat Pro local verifie cryptographiquement (offline-friendly pour l'UI).
pub fn current_status() -> Option<Claims> {
    load("token").ok().and_then(|t| verify_token(&t).ok()).filter(|c| c.pro)
}

pub fn is_logged_in() -> bool { load("session").is_ok() }
pub fn session_token() -> Option<String> { load("session").ok() }
pub fn logout() { clear("session"); clear("token"); }

// ---- utilitaires ----
fn dir() -> std::path::PathBuf {
    let d = dirs::data_dir().unwrap_or_default().join("PulseBoost");
    let _ = std::fs::create_dir_all(&d); d
}
fn store(name: &str, v: &str) -> Result<()> { Ok(std::fs::write(dir().join(name), v)?) }
fn load(name: &str) -> Result<String> { Ok(std::fs::read_to_string(dir().join(name))?) }
fn clear(name: &str) { let _ = std::fs::remove_file(dir().join(name)); }

fn open_browser(url: &str) {
    let _ = Command::new("cmd").args(["/C", "start", "", url]).spawn();
}
/// Ouvre une URL arbitraire (ex. lien de mise à jour) dans le navigateur.
pub fn open_url(url: &str) { open_browser(url); }
fn rand_u32() -> u32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos()
}
fn base64_url(b: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64, Engine};
    B64.encode(b)
}
fn urlencode(s: &str) -> String {
    s.bytes().map(|b| match b {
        b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
        _ => format!("%{:02X}", b),
    }).collect()
}
fn urldecode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => {
                if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) { out.push(v); i += 3; continue; }
                out.push(b[i]); i += 1;
            }
            b'+' => { out.push(b' '); i += 1; }
            c => { out.push(c); i += 1; }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}
