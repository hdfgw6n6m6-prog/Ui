// score.rs — score de santé 0-100 calculé LOCALEMENT et de façon déterministe.
// L'IA n'invente pas le score : elle l'explique. Crédibilité > marketing.
use serde_json::{json, Value};

pub fn compute(scan: &Value) -> Value {
    let mut score: i32 = 100;
    let mut reasons = vec![];

    let issues = scan["issues"].as_array().cloned().unwrap_or_default();
    for issue in &issues {
        let penalty = match issue["severity"].as_str() {
            Some("critique") => 15,
            Some("important") => 8,
            _ => 3,
        };
        score -= penalty;
        reasons.push(json!({
            "label": issue["title"],
            "penalty": penalty,
            "severity": issue["severity"],
        }));
    }

    // RAM faible = pénalité structurelle (on ne peut pas l'« optimiser »)
    let ram = scan["ram"]["total_gb"].as_f64().unwrap_or(16.0);
    if ram < 8.0 {
        score -= 15;
        reasons.push(json!({ "label": "Moins de 8 GB de RAM", "penalty": 15, "severity": "matériel" }));
    }
    // Jeu installé sur HDD ?
    let disks = scan["disks"].to_string();
    if disks.contains("HDD") || disks.contains("Unspecified") {
        score -= 8;
        reasons.push(json!({ "label": "Disque mécanique détecté (temps de chargement longs)", "penalty": 8, "severity": "matériel" }));
    }

    let score = score.clamp(0, 100);
    json!({
        "score": score,
        "tier": if score >= 80 { "vert" } else if score >= 55 { "orange" } else { "rouge" },
        "reasons": reasons,
    })
}
