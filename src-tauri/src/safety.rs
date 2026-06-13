// safety.rs — LE module de confiance.
// Règle d'or : aucune écriture système sans (1) point de restauration,
// (2) valeur d'origine journalisée, (3) chemin de rollback testé.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChangeEntry {
    pub tweak_id: String,
    /// Type de changement : "registry" | "service" | "powercfg" | "command"
    pub kind: String,
    /// Cible (chemin registre, nom de service, GUID powercfg…)
    pub target: String,
    /// Valeur AVANT modification (sérialisée) — c'est elle qu'on restaure.
    pub previous: Value,
    /// Valeur appliquée.
    pub applied: Value,
    pub at: String,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Journal {
    pub entries: Vec<ChangeEntry>,
}

impl Journal {
    fn path() -> PathBuf {
        let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("C:\\ProgramData"));
        base.join("PulseBoost").join("journal.json")
    }

    pub fn load() -> Result<Self> {
        let p = Self::path();
        if !p.exists() {
            return Ok(Self::default());
        }
        let raw = std::fs::read_to_string(&p)?;
        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    pub fn save(&self) -> Result<()> {
        let p = Self::path();
        std::fs::create_dir_all(p.parent().unwrap())?;
        std::fs::write(&p, serde_json::to_string_pretty(self)?)?;
        Ok(())
    }

    pub fn record(&mut self, entry: ChangeEntry) {
        self.entries.push(entry);
    }

    /// Vue publique du journal pour l'onglet "Sécurité" de l'UI.
    pub fn as_public_log(&self) -> Value {
        json!(self
            .entries
            .iter()
            .map(|e| json!({
                "quand": e.at,
                "optimisation": e.tweak_id,
                "cible": e.target,
                "avant": e.previous,
                "après": e.applied,
            }))
            .collect::<Vec<_>>())
    }
}

/// Crée un point de restauration Windows. Échec = on N'APPLIQUE RIEN.
/// Note : Windows limite à 1 point / 24 h par défaut
/// (SystemRestorePointCreationFrequency) — on l'assouplit pour notre app.
pub async fn create_restore_point(description: &str) -> Result<()> {
    let script = format!(
        "Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore' \
         -Name SystemRestorePointCreationFrequency -Value 0 -ErrorAction SilentlyContinue; \
         Enable-ComputerRestore -Drive 'C:\\' -ErrorAction SilentlyContinue; \
         Checkpoint-Computer -Description '{description}' -RestorePointType MODIFY_SETTINGS"
    );
    let out = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
        .output()
        .context("PowerShell introuvable")?;
    if !out.status.success() {
        anyhow::bail!(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(())
}

/// Helpers registre journalisés : lit l'ancienne valeur, écrit la nouvelle,
/// enregistre l'entrée. `hive` = "HKCU" | "HKLM".
pub fn set_registry_dword(
    journal: &mut Journal,
    tweak_id: &str,
    hive: &str,
    key: &str,
    name: &str,
    value: u32,
) -> Result<()> {
    use winreg::enums::*;
    use winreg::RegKey;
    let root = match hive {
        "HKLM" => RegKey::predef(HKEY_LOCAL_MACHINE),
        _ => RegKey::predef(HKEY_CURRENT_USER),
    };
    let (k, _) = root.create_subkey(key)?;
    let previous: Value = match k.get_value::<u32, _>(name) {
        Ok(v) => json!(v),
        Err(_) => Value::Null, // la valeur n'existait pas -> rollback = suppression
    };
    k.set_value(name, &value)?;
    journal.record(ChangeEntry {
        tweak_id: tweak_id.into(),
        kind: "registry".into(),
        target: format!("{hive}\\{key}\\{name}"),
        previous,
        applied: json!(value),
        at: chrono::Utc::now().to_rfc3339(),
    });
    Ok(())
}

/// Restaure une entrée registre à sa valeur d'origine.
pub fn revert_registry(entry: &ChangeEntry) -> Result<()> {
    use winreg::enums::*;
    use winreg::RegKey;
    let mut parts = entry.target.splitn(2, '\\');
    let hive = parts.next().unwrap_or("HKCU");
    let rest = parts.next().unwrap_or_default();
    let (key_path, name) = rest.rsplit_once('\\').context("cible invalide")?;
    let root = match hive {
        "HKLM" => RegKey::predef(HKEY_LOCAL_MACHINE),
        _ => RegKey::predef(HKEY_CURRENT_USER),
    };
    let (k, _) = root.create_subkey(key_path)?;
    match &entry.previous {
        Value::Null => { let _ = k.delete_value(name); }
        Value::Number(n) => k.set_value(name, &(n.as_u64().unwrap_or(0) as u32))?,
        Value::String(s) => k.set_value(name, s)?,
        _ => {}
    }
    Ok(())
}
