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

/// ANALYSE GRATUITE : estimation LOCALE et déterministe d'un gain FPS potentiel,
/// exprimé en FOURCHETTE (%) — jamais une garantie chiffrée. Chaque problème
/// réparable contribue une plage honnête ; le matériel (RAM/HDD) plafonne et
/// est signalé. Pas d'IA, pas de serveur, pas de Pro requis.
pub fn estimate_gain(scan: &Value) -> Value {
    let mut min = 0.0f64;
    let mut max = 0.0f64;
    let mut items: Vec<Value> = vec![];
    let push = |items: &mut Vec<Value>, min: &mut f64, max: &mut f64, label: &str, lo: f64, hi: f64| {
        *min += lo;
        *max += hi;
        items.push(json!({ "label": label, "gain": format!("≈ +{:.0} à +{:.0} %", lo, hi) }));
    };

    // Plages par problème détecté (honnêtes, basées sur l'impact réel typique).
    let issues = scan["issues"].as_array().cloned().unwrap_or_default();
    for issue in &issues {
        match issue["id"].as_str() {
            Some("power_plan") => push(&mut items, &mut min, &mut max, "Plan d'alimentation Haute performance", 3.0, 8.0),
            Some("game_dvr") => push(&mut items, &mut min, &mut max, "Xbox Game DVR désactivé", 2.0, 6.0),
            Some("mem_compression") => push(&mut items, &mut min, &mut max, "Compression mémoire coupée (RAM abondante)", 1.0, 3.0),
            Some("sysmain") => push(&mut items, &mut min, &mut max, "SysMain désactivé (SSD)", 0.0, 2.0),
            Some("startup") => push(&mut items, &mut min, &mut max, "Programmes au démarrage réduits", 1.0, 3.0),
            _ => {}
        }
    }
    // Base : les réglages gaming Windows (réactivité MMCSS, priorité 1er plan,
    // souris brute) ne sont jamais optimisés par défaut.
    push(&mut items, &mut min, &mut max, "Réglages gaming Windows (réactivité, priorité jeu)", 2.0, 6.0);

    // Plafond matériel + message honnête (le vrai goulot ne s'« optimise » pas).
    let ram = scan["ram"]["total_gb"].as_f64().unwrap_or(16.0);
    let disks = scan["disks"].to_string();
    let mut hardware_note: Option<String> = None;
    if ram < 8.0 {
        max = max.min(8.0);
        hardware_note = Some("Avec moins de 8 Go de RAM, le vrai gain viendra d'un upgrade mémoire, pas d'un réglage logiciel.".into());
    } else if disks.contains("HDD") || disks.contains("Unspecified") {
        hardware_note = Some("Disque mécanique détecté : surtout des temps de chargement plus longs ; un SSD changerait davantage que des tweaks.".into());
    }

    let tier = if max < 5.0 { "faible" } else if max < 12.0 { "moyen" } else { "notable" };
    let summary = match tier {
        "faible" => "Ton PC est déjà bien réglé : le gain potentiel est faible mais réel.",
        "moyen" => "Plusieurs réglages non optimaux : un gain modéré est atteignable, sans risque (tout est réversible).",
        _ => "Beaucoup de marge : des réglages gaming manquent. Gain potentiel notable, et 100 % réversible.",
    };

    json!({
        "fps_gain_min": min.round() as i64,
        "fps_gain_max": max.round() as i64,
        "tier": tier,
        "summary": summary,
        "items": items,
        "hardware_note": hardware_note,
        "disclaimer": "Estimation locale, variable selon le jeu et la scène. Ce n'est pas une garantie de FPS.",
    })
}
