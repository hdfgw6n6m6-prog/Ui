// benchmark.rs — mesure HONNÊTE avant/après.
//
// Principe anti-scam : on ne fabrique JAMAIS de FPS. On échantillonne des
// métriques réelles (CPU %, RAM %, RAM libre, température) pendant 5 à 60 s.
// Les FPS ne sont mesurés QUE si (1) un jeu tourne ET (2) PresentMon (Intel,
// open-source) est disponible. Sinon on l'explique clairement dans `note`.
// `compare` calcule des deltas réels et ne déduit rien qui ne soit mesuré.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::{Command, Stdio};
use std::time::Duration;
use sysinfo::System;

/// Résultat d'un benchmark. (Serialize pour l'UI, Deserialize pour `compare`.)
#[derive(Serialize, Deserialize, Clone, Default)]
pub struct BenchResult {
    pub seconds: u64,
    pub samples: usize,
    pub cpu_avg: f64,
    pub cpu_max: f64,
    pub ram_avg: f64,
    pub ram_max: f64,
    pub free_ram_avg_gb: f64,
    pub cpu_temp_avg_c: Option<f64>,
    pub game: Option<String>,
    pub fps_avg: Option<f64>,
    pub fps_1pct_low: Option<f64>,
    pub presentmon: bool,
    pub note: String,
    pub at: String,
}

/// PowerShell caché → stdout (température, comme dans hardware.rs).
fn ps(script: &str) -> Option<String> {
    Command::new("powershell")
        .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
        .output()
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
}

fn read_temp() -> Option<f64> {
    ps("(Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction SilentlyContinue | Select -First 1).CurrentTemperature")
        .and_then(|v| v.parse::<f64>().ok())
        .map(|deci_k| (deci_k / 10.0) - 273.15)
}

fn avg(v: &[f64]) -> f64 {
    if v.is_empty() { 0.0 } else { v.iter().sum::<f64>() / v.len() as f64 }
}
fn round1(x: f64) -> f64 { (x * 10.0).round() / 10.0 }

/// Lance le benchmark (échantillonnage déporté hors de l'exécuteur async).
pub async fn run_benchmark(seconds: u64) -> Result<Value> {
    let secs = seconds.clamp(5, 60);
    let res = tokio::task::spawn_blocking(move || sample_blocking(secs)).await??;
    Ok(serde_json::to_value(res)?)
}

fn sample_blocking(secs: u64) -> Result<BenchResult> {
    let game = crate::hardware::detect_running_game().map(|g| g.to_string());
    let pm = presentmon_path();
    let exe = game.as_deref().and_then(game_exe);
    let presentmon = pm.is_some();

    // PresentMon tourne EN PARALLÈLE de l'échantillonnage (même fenêtre de temps).
    let mut pm_child = None;
    let mut pm_csv = None;
    if let (Some(pmp), Some(ex)) = (pm.as_ref(), exe) {
        let tmp = std::env::temp_dir().join(format!("pb_pm_{}.csv", rand_tag()));
        let _ = std::fs::remove_file(&tmp);
        if let Ok(child) = Command::new(pmp)
            .args([
                "-process_name", ex,
                "-timed", &secs.to_string(),
                "-output_file", &tmp.to_string_lossy(),
                "-no_top", "-terminate_after_timed", "-stop_existing_session",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            pm_child = Some(child);
            pm_csv = Some(tmp);
        }
    }

    let mut sys = System::new();
    sys.refresh_cpu();
    sys.refresh_memory();
    std::thread::sleep(Duration::from_millis(300));
    let total = sys.total_memory() as f64;

    let mut cpu = vec![];
    let mut ram = vec![];
    let mut freeg = vec![];
    let mut temps = vec![];
    for i in 0..secs {
        sys.refresh_cpu();
        sys.refresh_memory();
        let c = sys.global_cpu_info().cpu_usage() as f64;
        let used = sys.used_memory() as f64;
        cpu.push(c);
        ram.push(used / total * 100.0);
        freeg.push((total - used) / 1_073_741_824.0); // octets -> Gio
        if i % 3 == 0 {
            if let Some(t) = read_temp() { temps.push(t); }
        }
        std::thread::sleep(Duration::from_secs(1));
    }

    let mut fps_avg = None;
    let mut fps_1pct_low = None;
    if let Some(mut child) = pm_child {
        let _ = child.wait();
        if let Some(csv) = pm_csv {
            if let Ok(data) = std::fs::read_to_string(&csv) {
                if let Some((a, l)) = parse_fps_csv(&data) {
                    fps_avg = Some(a);
                    fps_1pct_low = Some(l);
                }
            }
            let _ = std::fs::remove_file(&csv);
        }
    }

    let note = match (&game, presentmon, fps_avg.is_some()) {
        (Some(g), true, true) => format!("FPS mesurés via PresentMon pendant {secs}s sur {g}."),
        (Some(g), true, false) => format!("{g} détecté, PresentMon présent mais aucune frame capturée (lance une scène en jeu). CPU/RAM/température mesurés."),
        (Some(g), false, _) => format!("{g} détecté mais PresentMon introuvable : FPS non mesurables. CPU/RAM/température mesurés honnêtement."),
        (None, _, _) => "Aucun jeu en cours : on mesure CPU/RAM/température. Lance ton jeu (PresentMon requis) pour mesurer aussi les FPS.".to_string(),
    };

    Ok(BenchResult {
        seconds: secs,
        samples: cpu.len(),
        cpu_avg: round1(avg(&cpu)),
        cpu_max: round1(cpu.iter().cloned().fold(0.0, f64::max)),
        ram_avg: round1(avg(&ram)),
        ram_max: round1(ram.iter().cloned().fold(0.0, f64::max)),
        free_ram_avg_gb: round1(avg(&freeg)),
        cpu_temp_avg_c: if temps.is_empty() { None } else { Some(round1(avg(&temps))) },
        game,
        fps_avg,
        fps_1pct_low,
        presentmon,
        note,
        at: chrono::Utc::now().to_rfc3339(),
    })
}

/// Compare deux mesures. Deltas RÉELS uniquement ; aucun FPS inventé.
pub fn compare(before: Value, after: Value) -> Result<Value> {
    let b: BenchResult = serde_json::from_value(before)?;
    let a: BenchResult = serde_json::from_value(after)?;

    let cpu_delta = round1(a.cpu_avg - b.cpu_avg);
    let ram_delta = round1(a.ram_avg - b.ram_avg);
    let free_delta = round1(a.free_ram_avg_gb - b.free_ram_avg_gb);
    let temp_delta = match (b.cpu_temp_avg_c, a.cpu_temp_avg_c) {
        (Some(x), Some(y)) => Some(round1(y - x)),
        _ => None,
    };

    let (fps_delta, fps_note) = match (b.fps_avg, a.fps_avg) {
        (Some(x), Some(y)) => (
            Some(round1(y - x)),
            format!(
                "FPS moyens {:.0} → {:.0} ({}{:.0}). Mesuré via PresentMon, jamais inventé.",
                x, y, if y >= x { "+" } else { "" }, round1(y - x)
            ),
        ),
        _ => (
            None,
            "Pas de FPS mesurés (jeu + PresentMon requis des deux côtés) — comparaison sur CPU/RAM/température.".to_string(),
        ),
    };

    // Verdict prudent : de petites variations peuvent être du bruit de mesure.
    let summary = if let Some(fd) = fps_delta {
        if fd >= 3.0 { "Gain de FPS réel mesuré après optimisation. 👍" }
        else if fd <= -3.0 { "Les FPS ont baissé — un rollback est possible en 1 clic." }
        else { "Différence de FPS dans la marge de bruit : pas de gain net mesurable." }
    } else if cpu_delta <= -3.0 {
        "CPU moins sollicité après optimisation (à charge comparable)."
    } else if free_delta >= 0.3 {
        "Un peu plus de RAM libre après optimisation."
    } else {
        "Pas de différence nette mesurée — c'est honnête : ton PC était déjà bien réglé."
    };

    Ok(json!({
        "cpu_delta": cpu_delta,
        "ram_delta": ram_delta,
        "free_ram_delta_gb": free_delta,
        "temp_delta_c": temp_delta,
        "fps_delta": fps_delta,
        "fps_note": fps_note,
        "summary": summary,
        "before": serde_json::to_value(&b)?,
        "after": serde_json::to_value(&a)?,
        "disclaimer": "Mesures réelles, variables selon la scène. Un benchmark n'est pas une garantie de FPS.",
    }))
}

/// Détecte PresentMon : d'abord à côté de l'exe (bundle), puis sur le PATH.
fn presentmon_path() -> Option<String> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for cand in ["PresentMon.exe", "presentmon.exe"] {
                let p = dir.join(cand);
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }
    let out = Command::new("where").arg("PresentMon.exe").output().ok()?;
    if out.status.success() {
        let s = String::from_utf8_lossy(&out.stdout);
        if let Some(line) = s.lines().next() {
            let t = line.trim();
            if !t.is_empty() {
                return Some(t.to_string());
            }
        }
    }
    None
}

/// Nom d'exécutable du jeu (pour cibler PresentMon).
fn game_exe(game: &str) -> Option<&'static str> {
    Some(match game {
        "FiveM" => "FiveM.exe",
        "Fortnite" => "FortniteClient-Win64-Shipping.exe",
        "Valorant" => "VALORANT-Win64-Shipping.exe",
        "CS2" => "cs2.exe",
        "Warzone" => "cod.exe",
        "Apex Legends" => "r5apex.exe",
        _ => return None,
    })
}

/// Parse un CSV PresentMon : moyenne FPS + 1% low à partir des temps de frame.
fn parse_fps_csv(data: &str) -> Option<(f64, f64)> {
    let mut lines = data.lines();
    let header = lines.next()?;
    let cols: Vec<String> = header.split(',').map(|s| s.trim().to_lowercase()).collect();
    let idx = cols.iter().position(|c| {
        c == "msbetweenpresents" || c.contains("msbetweenpresents") || c == "frametime" || c.contains("ms between presents")
    })?;
    let mut fps: Vec<f64> = vec![];
    for line in lines {
        let parts: Vec<&str> = line.split(',').collect();
        if let Some(cell) = parts.get(idx) {
            if let Ok(ft) = cell.trim().parse::<f64>() {
                if ft > 0.0 {
                    fps.push(1000.0 / ft);
                }
            }
        }
    }
    if fps.len() < 10 {
        return None;
    }
    let mean = fps.iter().sum::<f64>() / fps.len() as f64;
    let mut sorted = fps.clone();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let i1 = (((sorted.len() as f64) * 0.01).floor() as usize).min(sorted.len() - 1);
    Some((round1(mean), round1(sorted[i1])))
}

fn rand_tag() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0)
}
