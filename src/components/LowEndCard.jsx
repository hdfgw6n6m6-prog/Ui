// LowEndCard.jsx — diagnostic matériel honnête (mode Low-End).
// Dit la vérité : sur une config modeste, un upgrade ciblé bat tous les tweaks.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconChip, IconWarn, IconCheck } from "./Icons.jsx";

export default function LowEndCard({ notify }) {
  const [rep, setRep] = useState(null);
  const [busy, setBusy] = useState(true);

  const load = async () => {
    setBusy(true);
    try { setRep(await invoke("low_end_report")); }
    catch (e) { notify?.(String(e)); }
    finally { setBusy(false); }
  };
  useEffect(() => { load(); }, []);

  const score = rep?.hardware_score ?? 0;
  const color = score >= 75 ? "var(--ok)" : score >= 50 ? "var(--warn)" : "var(--bad)";

  return (
    <div className="card lowend">
      <div className="card-head">
        <div>
          <h2><IconChip width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--data)" }} />Mode Low-End — diagnostic matériel</h2>
          <p className="lead">{rep?.summary ?? "Analyse de ton matériel en cours…"}</p>
        </div>
        {rep && (
          <div className="lowend-score" style={{ borderColor: color }}>
            <b style={{ color }}>{score}</b>
            <span>/ 100</span>
            <small style={{ color }}>{rep.tier}</small>
          </div>
        )}
      </div>

      {busy && <div className="skeleton" style={{ height: 60, marginTop: 12 }} />}

      {rep && !busy && (
        <>
          {rep.bottlenecks?.length > 0 ? (
            <ul className="lowend-bn">
              {rep.bottlenecks.map((b, i) => (
                <li key={i}>
                  <span className={"bn-sev " + b.severity}>{b.label}</span>
                  <small>{b.detail}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="clean-note" style={{ marginTop: 12 }}><IconCheck width={16} height={16} /> Aucun goulot matériel majeur — les réglages logiciels valent le coup.</p>
          )}

          {rep.advice?.length > 0 && (
            <div className="lowend-advice">
              <div className="la-head"><IconWarn width={15} height={15} /> Conseils honnêtes</div>
              <ul>{rep.advice.map((a, i) => <li key={i}>{a}</li>)}</ul>
            </div>
          )}

          {rep.low_end_hero_eligible && (
            <p className="muted tiny" style={{ marginTop: 10 }}>
              💪 Config modeste = vrai défi. PulseBoost optimise tout ce qui est gratuit avant de te conseiller la moindre dépense.
            </p>
          )}
          <p className="muted tiny" style={{ marginTop: 6 }}>{rep.disclaimer}</p>
        </>
      )}
    </div>
  );
}
