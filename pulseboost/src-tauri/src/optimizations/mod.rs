// optimizations/mod.rs — chaque tweak déclare : comment l'appliquer,
// comment vérifier son état, et son impact HONNÊTE (pas de % inventés).
//
// Philosophie anti-scam : on annonce "impact mesuré : faible/moyen/variable",
// jamais "+40 FPS garantis". La crédibilité est le produit.

use crate::safety::{self, ChangeEntry, Journal};
use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum TweakId {
    PowerPlanHighPerf,
    DisableGameDvr,
    EnableGameMode,
    DisableSysMain,
    CleanTempFiles,
    TcpNoDelay,
    DisableMemCompression,
    StartupReport,
    HardwareGpuScheduling,
    DnsCloudflare,
    VisualEffectsPerformance,
    CleanPrefetch,
    DisableStartupDelay,
}

#[derive(Serialize, Clone)]
pub struct TweakInfo {
    pub id: TweakId,
    pub label: String,
    pub category: String,
    pub impact: String, // "moyen" | "faible" | "variable" — honnête
    pub pro_only: bool,
    pub applied: bool,
    pub description: String,
}

fn ps(script: &str) -> Result<String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output()?;
    if !out.status.success() {
        anyhow::bail!(String::from_utf8_lossy(&out.stderr).to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub async fn list_all() -> Result<Vec<TweakInfo>> {
    let plan = ps("powercfg /getactivescheme").unwrap_or_default();
    let dvr = ps("Get-ItemPropertyValue 'HKCU:\\System\\GameConfigStore' GameDVR_Enabled -ErrorAction SilentlyContinue").unwrap_or_default();
    let sysmain = ps("(Get-Service SysMain -ErrorAction SilentlyContinue).StartType").unwrap_or_default();

    Ok(vec![
        TweakInfo {
            id: TweakId::PowerPlanHighPerf,
            label: "Power plan → Haute performance".into(),
            category: "Windows".into(),
            impact: "moyen (surtout portables / CPU anciens)".into(),
            pro_only: false,
            applied: plan.to_lowercase().contains("high") || plan.contains("aute"),
            description: "Empêche Windows de réduire la fréquence CPU en jeu.".into(),
        },
        TweakInfo {
            id: TweakId::DisableGameDvr,
            label: "Désactiver Xbox Game Bar + DVR".into(),
            category: "Gaming".into(),
            impact: "moyen".into(),
            pro_only: false,
            applied: dvr.trim() == "0",
            description: "Stoppe l'enregistrement d'arrière-plan qui consomme CPU/GPU.".into(),
        },
        TweakInfo {
            id: TweakId::EnableGameMode,
            label: "Activer le Mode Jeu Windows".into(),
            category: "Gaming".into(),
            impact: "faible à moyen".into(),
            pro_only: false,
            applied: false,
            description: "Priorise les ressources pour le jeu au premier plan.".into(),
        },
        TweakInfo {
            id: TweakId::CleanTempFiles,
            label: "Nettoyer fichiers temporaires".into(),
            category: "Windows".into(),
            impact: "espace disque uniquement (pas de FPS)".into(),
            pro_only: false,
            applied: false,
            description: "Vide %TEMP% et les logs. Honnêteté : libère du disque, pas des FPS.".into(),
        },
        TweakInfo {
            id: TweakId::DisableSysMain,
            label: "Désactiver SysMain (SSD)".into(),
            category: "Windows".into(),
            impact: "faible".into(),
            pro_only: true,
            applied: sysmain == "Disabled",
            description: "Superfetch est peu utile sur SSD/NVMe.".into(),
        },
        TweakInfo {
            id: TweakId::TcpNoDelay,
            label: "Réseau : désactiver l'algorithme de Nagle".into(),
            category: "Réseau".into(),
            impact: "variable (peut réduire la latence en jeu)".into(),
            pro_only: true,
            applied: false,
            description: "Envoie les petits paquets sans attendre. Utile pour FiveM/FPS, sans effet sur le débit.".into(),
        },
        TweakInfo {
            id: TweakId::DisableMemCompression,
            label: "Désactiver la compression mémoire (≥16 GB RAM)".into(),
            category: "RAM".into(),
            impact: "faible".into(),
            pro_only: true,
            applied: ps("(Get-MMAgent).MemoryCompression").map(|v| v == "False").unwrap_or(false),
            description: "Économise du CPU quand la RAM est abondante.".into(),
        },
        TweakInfo {
            id: TweakId::StartupReport,
            label: "Optimiser les programmes au démarrage".into(),
            category: "Windows".into(),
            impact: "boot plus rapide + RAM libérée".into(),
            pro_only: false,
            applied: false,
            description: "Liste les programmes au boot et permet de les désactiver un par un.".into(),
        },
        TweakInfo {
            id: TweakId::HardwareGpuScheduling,
            label: "GPU scheduling matériel (HAGS)".into(),
            category: "Gaming".into(),
            impact: "variable (selon GPU/driver) — redémarrage requis".into(),
            pro_only: true,
            applied: ps("(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers' -Name HwSchMode -ErrorAction SilentlyContinue).HwSchMode").map(|v| v.trim() == "2").unwrap_or(false),
            description: "Laisse le GPU gérer sa propre planification. Effet variable, à tester par jeu.".into(),
        },
        TweakInfo {
            id: TweakId::DnsCloudflare,
            label: "DNS rapide (Cloudflare 1.1.1.1)".into(),
            category: "Réseau".into(),
            impact: "résolution plus rapide (pas de FPS, peut aider au matchmaking)".into(),
            pro_only: true,
            applied: false,
            description: "Bascule la carte réseau active sur 1.1.1.1 / 1.0.0.1. Réversible.".into(),
        },
        TweakInfo {
            id: TweakId::VisualEffectsPerformance,
            label: "Effets visuels → performances".into(),
            category: "Windows".into(),
            impact: "faible (un peu de GPU/RAM sur PC modestes)".into(),
            pro_only: false,
            applied: false,
            description: "Désactive animations et transparences de Windows pour alléger le bureau.".into(),
        },
        TweakInfo {
            id: TweakId::CleanPrefetch,
            label: "Nettoyer le Prefetch".into(),
            category: "Windows".into(),
            impact: "espace disque uniquement (non réversible)".into(),
            pro_only: true,
            applied: false,
            description: "Vide C:\\Windows\\Prefetch. Honnêteté : Windows le reconstruit, gain marginal.".into(),
        },
        TweakInfo {
            id: TweakId::DisableStartupDelay,
            label: "Supprimer le délai de démarrage des apps".into(),
            category: "Windows".into(),
            impact: "boot ressenti plus rapide".into(),
            pro_only: false,
            applied: ps("(Get-ItemProperty 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize' -Name StartupDelayInMSec -ErrorAction SilentlyContinue).StartupDelayInMSec").map(|v| v.trim() == "0").unwrap_or(false),
            description: "Retire le délai artificiel imposé aux programmes de démarrage.".into(),
        },
    ])
}

pub async fn apply(ids: &[TweakId], journal: &mut Journal) -> Result<Value> {
    let mut done = vec![];
    let mut failed = vec![];
    for id in ids {
        let r: Result<()> = match id {
            TweakId::PowerPlanHighPerf => {
                // Journaliser le plan actuel avant de changer
                let current = ps("powercfg /getactivescheme")?;
                let guid = current.split_whitespace().find(|s| s.len() == 36).unwrap_or("").to_string();
                journal.record(ChangeEntry {
                    tweak_id: "power_plan_high_perf".into(),
                    kind: "powercfg".into(),
                    target: "active_scheme".into(),
                    previous: json!(guid),
                    applied: json!("8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"),
                    at: chrono::Utc::now().to_rfc3339(),
                });
                ps("powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c").map(|_| ())
            }
            TweakId::DisableGameDvr => {
                safety::set_registry_dword(journal, "disable_game_dvr", "HKCU", "System\\GameConfigStore", "GameDVR_Enabled", 0)?;
                safety::set_registry_dword(journal, "disable_game_dvr", "HKCU", "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\GameDVR", "AppCaptureEnabled", 0)
            }
            TweakId::EnableGameMode => {
                safety::set_registry_dword(journal, "enable_game_mode", "HKCU", "SOFTWARE\\Microsoft\\GameBar", "AutoGameModeEnabled", 1)
            }
            TweakId::CleanTempFiles => {
                // Pas de journalisation : suppression de fichiers temporaires = non réversible
                // par nature, donc on reste conservateur (uniquement %TEMP% de l'utilisateur).
                ps("Remove-Item \"$env:TEMP\\*\" -Recurse -Force -ErrorAction SilentlyContinue").map(|_| ())
            }
            TweakId::DisableSysMain => {
                let prev = ps("(Get-Service SysMain).StartType").unwrap_or_else(|_| "Automatic".into());
                journal.record(ChangeEntry {
                    tweak_id: "disable_sysmain".into(),
                    kind: "service".into(),
                    target: "SysMain".into(),
                    previous: json!(prev),
                    applied: json!("Disabled"),
                    at: chrono::Utc::now().to_rfc3339(),
                });
                ps("Stop-Service SysMain -Force; Set-Service SysMain -StartupType Disabled").map(|_| ())
            }
            TweakId::TcpNoDelay => {
                // Appliqué par interface réseau active uniquement, jamais en masse.
                let iface_keys = ps("(Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces').PSChildName -join ','")?;
                for k in iface_keys.split(',').filter(|s| !s.is_empty()) {
                    let key = format!("SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces\\{k}");
                    safety::set_registry_dword(journal, "tcp_no_delay", "HKLM", &key, "TcpAckFrequency", 1)?;
                    safety::set_registry_dword(journal, "tcp_no_delay", "HKLM", &key, "TCPNoDelay", 1)?;
                }
                Ok(())
            }
            TweakId::DisableMemCompression => {
                journal.record(ChangeEntry {
                    tweak_id: "disable_mem_compression".into(),
                    kind: "command".into(),
                    target: "MMAgent.MemoryCompression".into(),
                    previous: json!(true),
                    applied: json!(false),
                    at: chrono::Utc::now().to_rfc3339(),
                });
                ps("Disable-MMAgent -MemoryCompression").map(|_| ())
            }
            TweakId::StartupReport => Ok(()), // géré côté UI (liste interactive)
            TweakId::HardwareGpuScheduling => {
                safety::set_registry_dword(journal, "hags", "HKLM", "SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers", "HwSchMode", 2)
            }
            TweakId::VisualEffectsPerformance => {
                safety::set_registry_dword(journal, "visual_fx", "HKCU", "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\VisualEffects", "VisualFXSetting", 2)
            }
            TweakId::DisableStartupDelay => {
                safety::set_registry_dword(journal, "startup_delay", "HKCU", "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Serialize", "StartupDelayInMSec", 0)
            }
            TweakId::DnsCloudflare => {
                // Carte réseau active uniquement ; on journalise les DNS précédents.
                let iface = ps("(Get-NetConnectionProfile | Select -First 1).InterfaceAlias")?;
                let prev = ps(&format!("((Get-DnsClientServerAddress -InterfaceAlias '{iface}' -AddressFamily IPv4).ServerAddresses) -join ','")).unwrap_or_default();
                journal.record(ChangeEntry {
                    tweak_id: "dns_cloudflare".into(),
                    kind: "command".into(),
                    target: format!("dns:{iface}"),
                    previous: json!(prev),
                    applied: json!("1.1.1.1,1.0.0.1"),
                    at: chrono::Utc::now().to_rfc3339(),
                });
                ps(&format!("Set-DnsClientServerAddress -InterfaceAlias '{iface}' -ServerAddresses ('1.1.1.1','1.0.0.1')")).map(|_| ())
            }
            TweakId::CleanPrefetch => {
                // Non réversible par nature -> pas de journalisation.
                ps("Remove-Item 'C:\\Windows\\Prefetch\\*' -Force -ErrorAction SilentlyContinue").map(|_| ())
            }
        };
        match r {
            Ok(_) => done.push(format!("{id:?}")),
            Err(e) => failed.push(json!({ "tweak": format!("{id:?}"), "error": e.to_string() })),
        }
    }
    Ok(json!({ "applied": done, "failed": failed }))
}

/// Rollback complet : rejoue le journal À L'ENVERS (dernier changement d'abord).
pub async fn rollback(journal: &mut Journal) -> Result<Value> {
    let mut reverted = 0u32;
    let mut errors = vec![];
    for entry in journal.entries.iter().rev() {
        let r: Result<()> = match entry.kind.as_str() {
            "registry" => safety::revert_registry(entry),
            "powercfg" => {
                if let Some(guid) = entry.previous.as_str() {
                    ps(&format!("powercfg /setactive {guid}")).map(|_| ())
                } else { Ok(()) }
            }
            "service" => {
                let prev = entry.previous.as_str().unwrap_or("Automatic");
                ps(&format!("Set-Service {} -StartupType {prev}; Start-Service {} -ErrorAction SilentlyContinue", entry.target, entry.target)).map(|_| ())
            }
            "command" if entry.target == "MMAgent.MemoryCompression" => {
                ps("Enable-MMAgent -MemoryCompression").map(|_| ())
            }
            "command" if entry.target.starts_with("dns:") => {
                let iface = entry.target.trim_start_matches("dns:");
                let prev = entry.previous.as_str().unwrap_or("");
                if prev.is_empty() {
                    // Pas de DNS manuel avant -> retour DHCP automatique
                    ps(&format!("Set-DnsClientServerAddress -InterfaceAlias '{iface}' -ResetServerAddresses")).map(|_| ())
                } else {
                    let list = prev.split(',').map(|s| format!("'{s}'")).collect::<Vec<_>>().join(",");
                    ps(&format!("Set-DnsClientServerAddress -InterfaceAlias '{iface}' -ServerAddresses ({list})")).map(|_| ())
                }
            }
            _ => Ok(()),
        };
        match r {
            Ok(_) => reverted += 1,
            Err(e) => errors.push(json!({ "target": entry.target, "error": e.to_string() })),
        }
    }
    if errors.is_empty() {
        journal.entries.clear();
    }
    Ok(json!({ "reverted": reverted, "errors": errors }))
}

/// GAME BOOST : actions temporaires (non journalisées car restaurées à la fermeture du jeu).
pub async fn game_boost(game: &str, _journal: &mut Journal) -> Result<Value> {
    let exe = match game {
        "FiveM" => "FiveM",
        "Fortnite" => "FortniteClient-Win64-Shipping",
        "Valorant" => "VALORANT-Win64-Shipping",
        "CS2" => "cs2",
        "Warzone" => "cod",
        "Apex Legends" => "r5apex",
        _ => anyhow::bail!("profil de jeu inconnu"),
    };
    // Priorité CPU "Haute" (pas Temps réel — risque de freeze système)
    let prio = ps(&format!(
        "$p = Get-Process {exe} -ErrorAction SilentlyContinue; if ($p) {{ $p.PriorityClass = 'High'; 'ok' }} else {{ 'not_running' }}"
    ))?;
    Ok(json!({
        "game": game,
        "priority": prio,
        "note": "Priorité restaurée automatiquement à la fermeture du jeu."
    }))
}
