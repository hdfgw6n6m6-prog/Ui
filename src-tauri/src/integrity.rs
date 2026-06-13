// integrity.rs — anti-falsification + blacklist locale (fonctionne hors-ligne).
//
// HONNETETE TECHNIQUE (a lire) :
//  - Le code de detection tourne sur le PC du cracker. Il peut donc, en theorie,
//    etre patche pour ne jamais declencher. AUCUNE protection locale n'est absolue.
//  - Ce module est un FILTRE tres efficace contre 99 % des gens (partage, patch
//    naif, debugueur) et un DETERRENT. La garantie dure, elle, reste cote serveur
//    (valeur premium calculee a distance + propagation de blacklist au retour en ligne).
//  - "Meme hors-ligne" : la blacklist est ecrite dans plusieurs emplacements
//    persistants lies au HWID. Une fois declenchee, l'app refuse de fonctionner au
//    prochain lancement sans reseau. Un cracker peut les retrouver et les effacer ;
//    c'est pour ca qu'on les disperse et qu'on re-verifie cote serveur des le retour online.

use anyhow::Result;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::process::Command;

#[derive(serde::Serialize)]
pub struct Verdict {
    pub state: String,   // "ok" | "blacklisted" | "tampered" | "debugger"
    pub reason: String,
}

fn hwid_hash() -> String {
    let mut h = Sha256::new();
    h.update(crate::license::hwid());
    h.update(b"|pb-bl-v1");
    format!("{:x}", h.finalize())
}

// --- Emplacements de la blacklist (disperses, noms discrets) ---
fn file_locations() -> Vec<PathBuf> {
    let mut v = vec![];
    if let Some(d) = dirs::data_dir() { v.push(d.join("PulseBoost").join(".state")); }
    if let Some(d) = dirs::config_dir() { v.push(d.join("Microsoft").join(".wbcache")); }
    v.push(PathBuf::from("C:\\ProgramData\\PulseBoost\\.integrity"));
    v
}

pub fn is_blacklisted() -> bool {
    let target = hwid_hash();
    // 1) fichiers
    for p in file_locations() {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if s.contains(&target) { return true; }
        }
    }
    // 2) registre (HKCU + HKLM)
    for hive in ["HKCU", "HKLM"] {
        let out = ps(&format!(
            "(Get-ItemProperty '{hive}:\\SOFTWARE\\PulseBoost' -Name s -ErrorAction SilentlyContinue).s"
        ));
        if out.contains(&target) { return true; }
    }
    false
}

/// Declenche la blacklist : ecrit le marqueur partout. Irreversible cote client.
pub fn trip_blacklist(reason: &str) {
    let marker = json!({ "h": hwid_hash(), "r": reason, "t": chrono::Utc::now().to_rfc3339() }).to_string();
    for p in file_locations() {
        if let Some(parent) = p.parent() { let _ = std::fs::create_dir_all(parent); }
        let _ = std::fs::write(&p, &marker);
    }
    for hive in ["HKCU", "HKLM"] {
        let _ = ps_run(&format!(
            "New-Item '{hive}:\\SOFTWARE\\PulseBoost' -Force | Out-Null; \
             Set-ItemProperty '{hive}:\\SOFTWARE\\PulseBoost' -Name s -Value '{marker}'"
        ));
    }
}

// --- Detections ---

/// Debugueur attache au process (IsDebuggerPresent). Fiable, peu de faux positifs.
pub fn debugger_present() -> bool {
    #[cfg(windows)]
    unsafe {
        windows::Win32::System::Diagnostics::Debug::IsDebuggerPresent().as_bool()
    }
    #[cfg(not(windows))]
    { false }
}

/// Signature Authenticode du binaire valide ? (anti-patch hors-ligne)
/// Necessite que tu signes le .exe (certificat EV/OV). Si non signe en dev -> on tolere.
pub fn signature_valid() -> bool {
    let exe = match std::env::current_exe() { Ok(p) => p, Err(_) => return true };
    let status = ps(&format!(
        "(Get-AuthenticodeSignature -FilePath '{}').Status",
        exe.display()
    ));
    // En prod (binaire signe) : exiger "Valid". En dev (NotSigned) : ne pas bloquer.
    status.trim() == "Valid" || status.trim() == "NotSigned"
}

/// Outils de crack notoires en cours d'execution (heuristique).
/// ATTENTION faux positifs : Cheat Engine sert aussi a d'autres jeux. A ponderer.
pub fn cracker_tools_running() -> Vec<String> {
    let names = ["x64dbg", "x32dbg", "ollydbg", "ida64", "ida", "cheatengine",
                 "scylla", "dnSpy", "HxD", "Reflector"];
    let mut found = vec![];
    let list = ps("(Get-Process | Select-Object -ExpandProperty ProcessName) -join ','").to_lowercase();
    for n in names {
        if list.contains(&n.to_lowercase()) { found.push(n.to_string()); }
    }
    found
}

/// Verdict global appele au lancement (avant de debloquer quoi que ce soit).
pub fn gate() -> Verdict {
    if is_blacklisted() {
        return Verdict { state: "blacklisted".into(),
            reason: "Ce poste a ete bloque suite a une tentative de falsification.".into() };
    }
    if debugger_present() {
        trip_blacklist("debugger");
        return Verdict { state: "debugger".into(),
            reason: "Debugueur detecte.".into() };
    }
    if !signature_valid() {
        trip_blacklist("signature_invalide");
        return Verdict { state: "tampered".into(),
            reason: "Signature du binaire invalide (fichier modifie).".into() };
    }
    Verdict { state: "ok".into(), reason: String::new() }
}

// --- helpers PowerShell ---
fn ps(script: &str) -> String {
    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output().ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default()
}
fn ps_run(script: &str) -> Result<()> {
    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output()?;
    Ok(())
}
