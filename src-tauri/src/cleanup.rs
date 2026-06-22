// cleanup.rs — nettoyage de caches, mesuré et tracé.
//
// On n'efface QUE des caches connus et reconstruits automatiquement (FiveM,
// RAGE/GTA V, shaders DirectX, Prefetch, %TEMP%). Chaque nettoyage est :
//   1) précédé d'un point de restauration (créé par main.rs) ;
//   2) journalisé via safety::journal_dir_cleanup (type "cleanup", transparence).
// Honnêteté : un nettoyage libère du DISQUE, pas des FPS.

use crate::safety::{self, Journal};
use anyhow::Result;
use serde_json::{json, Value};
use std::path::Path;

struct Cache {
    id: &'static str,
    label: &'static str,
    path: String,
    pro_only: bool,
    note: &'static str,
}

fn expand(p: &str) -> String {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let temp = std::env::var("TEMP").unwrap_or_default();
    let win = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    p.replace("%LOCALAPPDATA%", &local)
        .replace("%TEMP%", &temp)
        .replace("%SystemRoot%", &win)
}

fn catalog() -> Vec<Cache> {
    vec![
        Cache {
            id: "temp",
            label: "Fichiers temporaires (%TEMP%)",
            path: expand("%TEMP%"),
            pro_only: false,
            note: "Fichiers temporaires Windows. Sans risque, libère du disque.",
        },
        Cache {
            id: "fivem",
            label: "Cache FiveM",
            path: expand("%LOCALAPPDATA%\\FiveM\\FiveM.app\\cache"),
            pro_only: false,
            note: "Cache de ressources FiveM ; reconstruit au prochain lancement.",
        },
        Cache {
            id: "gta_rage",
            label: "Cache GTA V / RAGE (shaders)",
            path: expand("%LOCALAPPDATA%\\Rockstar Games\\GTA V\\shadercache"),
            pro_only: false,
            note: "Cache de shaders RAGE ; reconstruit en jeu.",
        },
        Cache {
            id: "dx_shader",
            label: "Cache de shaders DirectX",
            path: expand("%LOCALAPPDATA%\\D3DSCache"),
            pro_only: true,
            note: "Cache de shaders DirectX ; reconstruit automatiquement.",
        },
        Cache {
            id: "prefetch",
            label: "Windows Prefetch",
            path: expand("%SystemRoot%\\Prefetch"),
            pro_only: true,
            note: "Windows reconstruit le Prefetch ; gain surtout en espace disque.",
        },
    ]
}

/// Taille récursive d'un dossier (octets). Ignore ce qui n'est pas lisible.
fn dir_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let p = e.path();
            match e.metadata() {
                Ok(md) if md.is_dir() => total += dir_size(&p),
                Ok(md) => total += md.len(),
                Err(_) => {}
            }
        }
    }
    total
}

/// Vide le CONTENU d'un dossier (garde le dossier). Renvoie (octets libérés, erreurs).
fn clear_dir_contents(path: &Path) -> (u64, u64) {
    let mut freed = 0u64;
    let mut errs = 0u64;
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let p = e.path();
            let is_dir = p.is_dir();
            let sz = if is_dir { dir_size(&p) } else { e.metadata().map(|m| m.len()).unwrap_or(0) };
            let r = if is_dir { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
            match r {
                Ok(_) => freed += sz,
                Err(_) => errs += 1,
            }
        }
    }
    (freed, errs)
}

const MB: u64 = 1_048_576;

/// Scanne les caches nettoyables et estime l'espace récupérable (Mo).
pub fn scan_caches(pro: bool) -> Result<Value> {
    let items: Vec<Value> = catalog()
        .into_iter()
        .map(|c| {
            let exists = Path::new(&c.path).exists();
            let bytes = if exists { dir_size(Path::new(&c.path)) } else { 0 };
            json!({
                "id": c.id,
                "label": c.label,
                "path": c.path,
                "size_mb": bytes / MB,
                "pro_only": c.pro_only,
                "exists": exists,
                "locked": c.pro_only && !pro,
                "note": c.note,
            })
        })
        .collect();
    let total_mb: u64 = items
        .iter()
        .filter(|i| i["exists"].as_bool() == Some(true) && i["locked"].as_bool() != Some(true))
        .map(|i| i["size_mb"].as_u64().unwrap_or(0))
        .sum();
    Ok(json!({ "items": items, "total_mb": total_mb }))
}

/// Nettoie les caches choisis. Le point de restauration est créé en amont (main.rs).
pub async fn clean_caches(ids: &[String], pro: bool, journal: &mut Journal) -> Result<Value> {
    let mut cleaned = vec![];
    let mut skipped = vec![];
    let mut freed_total = 0u64;
    for c in catalog() {
        if !ids.iter().any(|x| x == c.id) {
            continue;
        }
        if c.pro_only && !pro {
            skipped.push(json!({ "id": c.id, "label": c.label, "reason": "Réservé au Pro" }));
            continue;
        }
        let p = Path::new(&c.path);
        if !p.exists() {
            skipped.push(json!({ "id": c.id, "label": c.label, "reason": "Introuvable (rien à nettoyer)" }));
            continue;
        }
        let (freed, errs) = clear_dir_contents(p);
        let freed_mb = freed / MB;
        safety::journal_dir_cleanup(journal, c.label, &c.path, freed_mb);
        freed_total += freed;
        cleaned.push(json!({ "id": c.id, "label": c.label, "freed_mb": freed_mb, "errors": errs }));
    }
    Ok(json!({
        "cleaned": cleaned,
        "skipped": skipped,
        "freed_mb": freed_total / MB,
        "note": "Espace disque libéré. Les caches se reconstruisent tout seuls — aucun FPS perdu ni gagné.",
    }))
}
