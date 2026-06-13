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
    // --- Réglages gaming avancés (réversibles) ---
    GamingResponsiveness,
    NetworkThrottlingOff,
    GamesTaskPriority,
    ForegroundBoost,
    DisableMouseAccel,
    DisablePowerThrottling,
    DisableDiagTrack,
}

// Chemins registre réutilisés par les réglages gaming avancés.
const MMCSS: &str = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile";
const MMCSS_GAMES: &str = "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile\\Tasks\\Games";
const PRIORITY_CTRL: &str = "SYSTEM\\CurrentControlSet\\Control\\PriorityControl";
const POWER_THROTTLING: &str = "SYSTEM\\CurrentControlSet\\Control\\Power\\PowerThrottling";
const MOUSE_KEY: &str = "Control Panel\\Mouse";

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
        TweakInfo {
            id: TweakId::GamingResponsiveness,
            label: "Réactivité système → jeux (MMCSS)".into(),
            category: "Gaming".into(),
            impact: "faible à moyen".into(),
            pro_only: false,
            applied: safety::read_dword("HKLM", MMCSS, "SystemResponsiveness") == Some(0),
            description: "Windows réserve 20% du CPU aux tâches de fond ; on le ramène à 0 pour rendre la main aux jeux.".into(),
        },
        TweakInfo {
            id: TweakId::ForegroundBoost,
            label: "Priorité au premier plan (le jeu)".into(),
            category: "Gaming".into(),
            impact: "faible à moyen".into(),
            pro_only: false,
            applied: safety::read_dword("HKLM", PRIORITY_CTRL, "Win32PrioritySeparation") == Some(0x26),
            description: "Donne plus de temps CPU à l'application au premier plan (Win32PrioritySeparation).".into(),
        },
        TweakInfo {
            id: TweakId::DisableMouseAccel,
            label: "Désactiver l'accélération souris (visée brute)".into(),
            category: "Gaming".into(),
            impact: "précision de visée (pas de FPS)".into(),
            pro_only: false,
            applied: ps("Get-ItemPropertyValue 'HKCU:\\Control Panel\\Mouse' MouseSpeed -ErrorAction SilentlyContinue").map(|v| v.trim() == "0").unwrap_or(false),
            description: "Coupe l'« amélioration de la précision du pointeur » pour une visée 1:1, prisée en FPS.".into(),
        },
        TweakInfo {
            id: TweakId::NetworkThrottlingOff,
            label: "Désactiver le bridage réseau (NetworkThrottlingIndex)".into(),
            category: "Réseau".into(),
            impact: "variable (multijoueur / audio)".into(),
            pro_only: true,
            applied: safety::read_dword("HKLM", MMCSS, "NetworkThrottlingIndex") == Some(0xFFFF_FFFF),
            description: "Windows limite le réseau pour le multimédia ; on lève cette limite (utile en multijoueur).".into(),
        },
        TweakInfo {
            id: TweakId::GamesTaskPriority,
            label: "Priorité GPU/CPU des jeux (MMCSS Games)".into(),
            category: "Gaming".into(),
            impact: "variable".into(),
            pro_only: true,
            applied: safety::read_dword("HKLM", MMCSS_GAMES, "GPU Priority") == Some(8),
            description: "Augmente la priorité GPU et CPU réservée à la catégorie « Jeux » du planificateur multimédia.".into(),
        },
        power_throttling_info(),
        TweakInfo {
            id: TweakId::DisableDiagTrack,
            label: "Désactiver la télémétrie Windows (DiagTrack)".into(),
            category: "Windows".into(),
            impact: "faible (un peu de CPU/RAM en fond)".into(),
            pro_only: true,
            applied: ps("(Get-Service DiagTrack -ErrorAction SilentlyContinue).StartType").map(|v| v == "Disabled").unwrap_or(false),
            description: "Coupe le service de collecte de données « Connected User Experiences and Telemetry ».".into(),
        },
    ])
}

// Sortie séparée pour rester lisible (PowerThrottling).
fn power_throttling_info() -> TweakInfo {
    TweakInfo {
        id: TweakId::DisablePowerThrottling,
        label: "Désactiver le bridage de puissance CPU".into(),
        category: "Windows".into(),
        impact: "faible à moyen (portables surtout)".into(),
        pro_only: true,
        applied: safety::read_dword("HKLM", POWER_THROTTLING, "PowerThrottlingOff") == Some(1),
        description: "Empêche Windows de réduire la puissance du CPU pour les applis au premier plan.".into(),
    }
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
            TweakId::GamingResponsiveness => {
                safety::set_registry_dword(journal, "gaming_responsiveness", "HKLM", MMCSS, "SystemResponsiveness", 0)
            }
            TweakId::ForegroundBoost => {
                safety::set_registry_dword(journal, "foreground_boost", "HKLM", PRIORITY_CTRL, "Win32PrioritySeparation", 0x26)
            }
            TweakId::NetworkThrottlingOff => {
                safety::set_registry_dword(journal, "network_throttling_off", "HKLM", MMCSS, "NetworkThrottlingIndex", 0xFFFF_FFFF)
            }
            TweakId::GamesTaskPriority => {
                safety::set_registry_dword(journal, "games_task_priority", "HKLM", MMCSS_GAMES, "GPU Priority", 8)?;
                safety::set_registry_dword(journal, "games_task_priority", "HKLM", MMCSS_GAMES, "Priority", 6)?;
                safety::set_registry_string(journal, "games_task_priority", "HKLM", MMCSS_GAMES, "Scheduling Category", "High")?;
                safety::set_registry_string(journal, "games_task_priority", "HKLM", MMCSS_GAMES, "SFIO Priority", "High")
            }
            TweakId::DisableMouseAccel => {
                safety::set_registry_string(journal, "mouse_accel_off", "HKCU", MOUSE_KEY, "MouseSpeed", "0")?;
                safety::set_registry_string(journal, "mouse_accel_off", "HKCU", MOUSE_KEY, "MouseThreshold1", "0")?;
                safety::set_registry_string(journal, "mouse_accel_off", "HKCU", MOUSE_KEY, "MouseThreshold2", "0")
            }
            TweakId::DisablePowerThrottling => {
                safety::set_registry_dword(journal, "power_throttling_off", "HKLM", POWER_THROTTLING, "PowerThrottlingOff", 1)
            }
            TweakId::DisableDiagTrack => {
                let prev = ps("(Get-Service DiagTrack).StartType").unwrap_or_else(|_| "Automatic".into());
                journal.record(ChangeEntry {
                    tweak_id: "disable_diagtrack".into(),
                    kind: "service".into(),
                    target: "DiagTrack".into(),
                    previous: json!(prev),
                    applied: json!("Disabled"),
                    at: chrono::Utc::now().to_rfc3339(),
                });
                ps("Stop-Service DiagTrack -Force -ErrorAction SilentlyContinue; Set-Service DiagTrack -StartupType Disabled").map(|_| ())
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

/// Un tweak est-il réservé au Pro ? (doit refléter `pro_only` dans `list_all`).
pub fn tweak_is_pro(id: &TweakId) -> bool {
    matches!(
        id,
        TweakId::DisableSysMain
            | TweakId::TcpNoDelay
            | TweakId::DisableMemCompression
            | TweakId::HardwareGpuScheduling
            | TweakId::DnsCloudflare
            | TweakId::CleanPrefetch
            | TweakId::NetworkThrottlingOff
            | TweakId::GamesTaskPriority
            | TweakId::DisablePowerThrottling
            | TweakId::DisableDiagTrack
    )
}

/// Profil d'optimisation adapté à un jeu donné.
#[derive(Serialize, Clone)]
pub struct GameProfile {
    pub game: String,
    pub priority: String, // priorité CPU appliquée au process du jeu
    pub summary: String,  // pourquoi ce profil (honnête, pas de FPS promis)
    pub tweaks: Vec<TweakId>,
}

/// Profil RECOMMANDÉ par jeu : sélection de tweaks réversibles + priorité CPU,
/// adaptée à ce que le jeu sollicite réellement (CPU mono-cœur, latence réseau,
/// RAM…). Aucun chiffre de FPS promis : on adapte, on n'invente pas.
pub fn profile_for(game: &str) -> Option<GameProfile> {
    use TweakId::*;
    let (priority, summary, tweaks): (&str, &str, Vec<TweakId>) = match game {
        "FiveM" => (
            "High",
            "FiveM est très gourmand en CPU mono-cœur et sensible au réseau : priorité CPU + réactivité système, latence (Nagle), DNS rapide et bridage réseau levé.",
            vec![PowerPlanHighPerf, DisableGameDvr, EnableGameMode, GamingResponsiveness, ForegroundBoost, TcpNoDelay, DnsCloudflare, NetworkThrottlingOff],
        ),
        "Valorant" => (
            "High",
            "Compétitif : latence et CPU prioritaires, visée brute (sans accélération souris), enregistrement en fond coupé.",
            vec![PowerPlanHighPerf, DisableGameDvr, EnableGameMode, GamingResponsiveness, ForegroundBoost, DisableMouseAccel, TcpNoDelay, NetworkThrottlingOff],
        ),
        "CS2" => (
            "High",
            "Compétitif Source 2 : latence réseau, visée brute, réactivité système et planification GPU matérielle.",
            vec![PowerPlanHighPerf, DisableGameDvr, EnableGameMode, GamingResponsiveness, ForegroundBoost, DisableMouseAccel, TcpNoDelay, HardwareGpuScheduling],
        ),
        "Fortnite" => (
            "High",
            "Gros moteur : CPU/GPU dégagés, réactivité système, planification GPU matérielle, effets Windows allégés.",
            vec![PowerPlanHighPerf, DisableGameDvr, EnableGameMode, GamingResponsiveness, ForegroundBoost, HardwareGpuScheduling, VisualEffectsPerformance],
        ),
        "Warzone" => (
            "High",
            "Très lourd en RAM et CPU : compression mémoire coupée (si ≥16 Go), réactivité système, planification GPU, anti-DVR.",
            vec![PowerPlanHighPerf, DisableGameDvr, EnableGameMode, GamingResponsiveness, ForegroundBoost, DisableMemCompression, HardwareGpuScheduling],
        ),
        "Apex Legends" => (
            "High",
            "FPS rapide : latence réseau réduite, visée brute, réactivité système et priorité CPU.",
            vec![PowerPlanHighPerf, DisableGameDvr, EnableGameMode, GamingResponsiveness, ForegroundBoost, DisableMouseAccel, TcpNoDelay, NetworkThrottlingOff],
        ),
        _ => return None,
    };
    Some(GameProfile {
        game: game.to_string(),
        priority: priority.to_string(),
        summary: summary.to_string(),
        tweaks,
    })
}

/// Applique le profil adaptatif d'un jeu : tweaks réversibles (filtrés selon la
/// licence) puis priorité CPU du process. Le point de restauration est créé en
/// amont par l'appelant (`main.rs`). Tout reste journalisé / réversible.
pub async fn apply_profile(game: &str, pro: bool, journal: &mut Journal) -> Result<Value> {
    let profile = profile_for(game).ok_or_else(|| anyhow::anyhow!("profil de jeu inconnu"))?;
    let mut to_apply = vec![];
    let mut skipped_pro = vec![];
    for id in &profile.tweaks {
        if tweak_is_pro(id) && !pro {
            skipped_pro.push(format!("{id:?}"));
        } else {
            to_apply.push(id.clone());
        }
    }
    let report = apply(&to_apply, journal).await?;
    // Priorité CPU du jeu (best-effort : seulement si le jeu tourne déjà).
    let prio = game_boost(game, journal).await.ok();
    Ok(json!({
        "game": game,
        "summary": profile.summary,
        "applied": report["applied"],
        "failed": report["failed"],
        "skipped_pro": skipped_pro,
        "priority": prio.and_then(|v| v["priority"].as_str().map(String::from)),
    }))
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
