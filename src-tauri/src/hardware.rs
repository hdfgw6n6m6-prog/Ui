// hardware.rs — collecte des données système (lecture seule, aucun risque).
use anyhow::Result;
use serde_json::{json, Value};
use std::process::Command;
use sysinfo::System;

/// Exécute une commande PowerShell cachée et retourne stdout (Windows uniquement).
fn ps(script: &str) -> Result<String> {
    let out = Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output()?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

pub async fn full_scan() -> Result<Value> {
    let mut sys = System::new_all();
    sys.refresh_all();

    // --- CPU / RAM ---
    let cpu_name = sys.cpus().first().map(|c| c.brand().to_string()).unwrap_or_default();
    let ram_total_gb = sys.total_memory() as f64 / 1024.0 / 1024.0 / 1024.0;
    let ram_speed = ps("(Get-CimInstance Win32_PhysicalMemory | Select -First 1).Speed").unwrap_or_default();

    // --- GPU (WMI) ---
    let gpu = ps("(Get-CimInstance Win32_VideoController | Select -First 1).Name").unwrap_or_default();
    let gpu_driver_date = ps("(Get-CimInstance Win32_VideoController | Select -First 1).DriverDate").unwrap_or_default();

    // --- Stockage : HDD vs SSD vs NVMe ---
    let disks = ps(
        "Get-PhysicalDisk | Select-Object FriendlyName, MediaType, BusType, @{n='SizeGB';e={[math]::Round($_.Size/1GB)}} | ConvertTo-Json -Compress",
    ).unwrap_or_else(|_| "[]".into());
    let disks: Value = serde_json::from_str(&disks).unwrap_or(json!([]));

    // --- OS ---
    let os_version = ps("(Get-CimInstance Win32_OperatingSystem).Caption + ' ' + (Get-ItemPropertyValue 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' DisplayVersion)").unwrap_or_default();

    // --- Top processus par RAM/CPU ---
    let mut procs: Vec<_> = sys.processes().values().collect();
    procs.sort_by(|a, b| b.memory().cmp(&a.memory()));
    let top_processes: Vec<Value> = procs
        .iter()
        .take(8)
        .map(|p| {
            json!({
                "name": p.name(),
                "ram_mb": p.memory() / 1024 / 1024,
                "cpu_pct": p.cpu_usage()
            })
        })
        .collect();

    // --- Jeux installés (Steam / Epic / FiveM / Rockstar) ---
    let games = detect_games();

    // --- Jeu actuellement lancé (pour l'optimisation adaptative) ---
    let running_game = detect_running_game();

    // --- Détection des "problèmes" connus ---
    let issues = detect_issues(ram_total_gb, &disks);

    Ok(json!({
        "cpu": { "name": cpu_name, "cores": sys.cpus().len() },
        "ram": { "total_gb": (ram_total_gb * 10.0).round() / 10.0, "speed_mhz": ram_speed },
        "gpu": { "name": gpu, "driver_date": gpu_driver_date },
        "disks": disks,
        "os": os_version,
        "top_processes": top_processes,
        "games": games,
        "running_game": running_game,
        "issues": issues,
        "scanned_at": chrono::Utc::now().to_rfc3339(),
    }))
}

/// Détecte le jeu actuellement EN COURS d'exécution (par nom de process).
/// Sert à l'optimisation adaptative : on adapte le profil au jeu joué.
/// Renvoie le nom canonique du jeu ("FiveM", "Valorant"…) ou None.
pub fn detect_running_game() -> Option<&'static str> {
    // (jeu canonique, fragments de nom d'exécutable en minuscule)
    const TABLE: &[(&str, &[&str])] = &[
        ("FiveM", &["fivem"]),
        ("Fortnite", &["fortniteclient-win64-shipping"]),
        ("Valorant", &["valorant-win64-shipping", "valorant"]),
        ("CS2", &["cs2"]),
        ("Warzone", &["modernwarfare", "cod"]),
        ("Apex Legends", &["r5apex"]),
    ];
    let mut sys = System::new();
    sys.refresh_processes();
    let names: Vec<String> = sys
        .processes()
        .values()
        .map(|p| p.name().to_lowercase())
        .collect();
    for (game, keys) in TABLE {
        if names.iter().any(|n| keys.iter().any(|k| n.contains(k))) {
            return Some(game);
        }
    }
    None
}

/// Stats légères pour le graphe temps réel.
pub fn live_stats() -> Result<Value> {
    let mut sys = System::new();
    sys.refresh_cpu();
    sys.refresh_memory();
    std::thread::sleep(std::time::Duration::from_millis(200));
    sys.refresh_cpu();
    let cpu = sys.global_cpu_info().cpu_usage();
    let ram_pct = sys.used_memory() as f64 / sys.total_memory() as f64 * 100.0;
    // Températures : nécessite LibreHardwareMonitorLib (DLL embarquée) ou WMI vendor.
    // MSAcpi_ThermalZoneTemperature ne couvre pas tous les PC -> renvoyer null si absent.
    let cpu_temp = ps("(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select -First 1).CurrentTemperature")
        .ok()
        .and_then(|v| v.parse::<f64>().ok())
        .map(|deciK| (deciK / 10.0) - 273.15);
    Ok(json!({ "cpu_pct": cpu, "ram_pct": ram_pct, "cpu_temp_c": cpu_temp }))
}

fn detect_games() -> Vec<Value> {
    let mut found = vec![];
    let candidates = [
        ("FiveM", "%LOCALAPPDATA%\\FiveM\\FiveM.exe"),
        ("Fortnite", "C:\\Program Files\\Epic Games\\Fortnite"),
        ("Valorant", "C:\\Riot Games\\VALORANT"),
        ("CS2", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive"),
        ("Warzone", "C:\\Program Files (x86)\\Call of Duty"),
        ("Apex Legends", "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Apex Legends"),
    ];
    for (name, path) in candidates {
        let expanded = path.replace(
            "%LOCALAPPDATA%",
            &std::env::var("LOCALAPPDATA").unwrap_or_default(),
        );
        if std::path::Path::new(&expanded).exists() {
            found.push(json!({ "name": name, "path": expanded }));
        }
    }
    // TODO: parser aussi les libraryfolders.vdf de Steam pour les installs hors C:.
    found
}

/// Détecte les réglages sous-optimaux RÉELS (pas d'alarmisme inventé).
fn detect_issues(ram_gb: f64, disks: &Value) -> Vec<Value> {
    let mut issues = vec![];

    // Power plan actif ?
    if let Ok(plan) = ps("powercfg /getactivescheme") {
        if plan.to_lowercase().contains("balanced") || plan.contains("quilibr") {
            issues.push(json!({
                "id": "power_plan",
                "severity": "important",
                "title": "Power plan en mode Équilibré",
                "detail": "Le mode Haute performance évite les baisses de fréquence CPU en jeu. Gain variable selon le CPU — réel surtout sur portables et vieux CPU."
            }));
        }
    }
    // Xbox Game Bar / DVR
    if let Ok(v) = ps("Get-ItemPropertyValue 'HKCU:\\System\\GameConfigStore' GameDVR_Enabled -ErrorAction SilentlyContinue") {
        if v.trim() == "1" {
            issues.push(json!({
                "id": "game_dvr",
                "severity": "important",
                "title": "Game DVR actif",
                "detail": "L'enregistrement en arrière-plan consomme CPU/GPU pendant le jeu."
            }));
        }
    }
    // SysMain sur SSD
    let has_ssd = disks.to_string().contains("SSD") || disks.to_string().contains("NVMe");
    if has_ssd {
        if let Ok(s) = ps("(Get-Service SysMain -ErrorAction SilentlyContinue).Status") {
            if s == "Running" {
                issues.push(json!({
                    "id": "sysmain",
                    "severity": "optionnel",
                    "title": "SysMain (Superfetch) actif sur SSD",
                    "detail": "Peu utile avec un SSD ; le désactiver libère un peu de RAM/IO."
                }));
            }
        }
    }
    // Compression mémoire avec beaucoup de RAM
    if ram_gb >= 16.0 {
        if let Ok(mc) = ps("(Get-MMAgent).MemoryCompression") {
            if mc == "True" {
                issues.push(json!({
                    "id": "mem_compression",
                    "severity": "optionnel",
                    "title": "Compression mémoire active avec ≥ 16 GB de RAM",
                    "detail": "Avec assez de RAM, la compression coûte du CPU pour un bénéfice marginal."
                }));
            }
        }
    }
    // Programmes au démarrage
    if let Ok(n) = ps("(Get-CimInstance Win32_StartupCommand).Count") {
        if n.parse::<u32>().unwrap_or(0) > 8 {
            issues.push(json!({
                "id": "startup",
                "severity": "important",
                "title": format!("{n} programmes au démarrage"),
                "detail": "Chaque programme au boot consomme RAM et ralentit le démarrage."
            }));
        }
    }
    issues
}
