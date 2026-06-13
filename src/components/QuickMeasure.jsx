// QuickMeasure.jsx — mesure AVANT/APRÈS honnête.
// Principe anti-scam : on ne promet pas de FPS. On échantillonne les ressources
// RÉELLES (via `live_stats`) sur quelques secondes et on montre la marge
// disponible (CPU libre, RAM libre, température). L'utilisateur mesure, optimise,
// puis remesure : le delta affiché est réel, pas inventé.
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconGauge } from "./Icons.jsx";

const KEY = "pb_measure_last";
const SAMPLES = 6, INTERVAL = 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadPrev() {
  try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
}

export default function QuickMeasure() {
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [result, setResult] = useState(loadPrev());
  const [prev, setPrev] = useState(null);

  const run = async () => {
    setBusy(true); setProg(0);
    let cpu = 0, ram = 0, temp = 0, tempN = 0, n = 0;
    for (let i = 0; i < SAMPLES; i++) {
      try {
        const s = await invoke("live_stats");
        cpu += s.cpu_pct ?? 0; ram += s.ram_pct ?? 0; n++;
        if (s.cpu_temp_c != null) { temp += s.cpu_temp_c; tempN++; }
      } catch {}
      setProg(Math.round(((i + 1) / SAMPLES) * 100));
      if (i < SAMPLES - 1) await sleep(INTERVAL);
    }
    if (!n) { setBusy(false); return; }
    const cur = {
      cpuFree: Math.round(100 - cpu / n),
      ramFree: Math.round(100 - ram / n),
      temp: tempN ? Math.round(temp / tempN) : null,
      at: Date.now(),
    };
    setPrev(result || loadPrev());     // l'ancienne mesure devient la référence
    setResult(cur);
    localStorage.setItem(KEY, JSON.stringify(cur));
    setBusy(false);
  };

  const cells = [
    { k: "Marge CPU", v: result?.cpuFree, unit: "%", prev: prev?.cpuFree, better: "up" },
    { k: "RAM libre", v: result?.ramFree, unit: "%", prev: prev?.ramFree, better: "up" },
    { k: "Température", v: result?.temp, unit: "°C", prev: prev?.temp, better: "down" },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2>Mesure avant / après</h2>
          <p className="lead">Ressources réelles disponibles, sur ~6 s. Aucun FPS inventé : mesure, optimise, puis remesure pour voir le gain réel.</p>
        </div>
        <button className="btn" onClick={run} disabled={busy}>
          {busy ? <span className="spin" /> : <IconGauge />}
          {busy ? `Mesure… ${prog}%` : "Mesurer"}
        </button>
      </div>

      {busy && <div className="progress" aria-hidden><i style={{ width: `${prog}%` }} /></div>}

      {result && !busy && (
        <div className="measure-row">
          <div className="measure-cols">
            {cells.map((c) => {
              let delta = null, dir = "flat";
              if (c.v != null && c.prev != null) {
                const d = c.v - c.prev;
                delta = d;
                if (d !== 0) {
                  const improved = c.better === "up" ? d > 0 : d < 0;
                  dir = improved ? "up" : "down";
                }
              }
              return (
                <div className="measure-cell" key={c.k}>
                  <div className="k">{c.k}</div>
                  <div className="v">{c.v == null ? "—" : c.v}<span className="unit" style={{ fontSize: 13 }}>{c.unit}</span></div>
                  {delta != null
                    ? <div className={"delta " + dir}>{delta > 0 ? "+" : ""}{delta}{c.unit} vs avant</div>
                    : <div className="delta flat">référence</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!result && !busy && <p className="muted" style={{ marginTop: 10 }}>Lance une première mesure pour fixer la référence.</p>}
    </div>
  );
}
