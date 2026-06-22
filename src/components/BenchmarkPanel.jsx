// BenchmarkPanel.jsx — mesure HONNÊTE avant/après.
// Les FPS ne s'affichent que s'ils ont été réellement mesurés (PresentMon + jeu).
// L'animation "Fake Boost +847 FPS" est purement cosmétique et ASSUMÉE comme telle.
import React, { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconChart, IconBolt } from "./Icons.jsx";

const DUR = 10; // secondes de mesure

function Col({ title, r }) {
  if (!r) return (
    <div className="bench-col empty-col">
      <div className="bench-col-h">{title}</div>
      <p className="muted tiny">Pas encore mesuré.</p>
    </div>
  );
  const rows = [
    r.fps_avg != null && ["FPS moyen", r.fps_avg],
    r.fps_1pct_low != null && ["1% low", r.fps_1pct_low],
    ["CPU moy.", `${r.cpu_avg}%`],
    ["RAM moy.", `${r.ram_avg}%`],
    ["RAM libre", `${r.free_ram_avg_gb} Go`],
    r.cpu_temp_avg_c != null && ["Temp", `${Math.round(r.cpu_temp_avg_c)}°`],
  ].filter(Boolean);
  return (
    <div className="bench-col">
      <div className="bench-col-h">{title}</div>
      <ul className="bench-rows">
        {rows.map(([k, v]) => (
          <li key={k}><span>{k}</span><b>{v}</b></li>
        ))}
      </ul>
    </div>
  );
}

function Delta({ label, value, unit = "", goodWhenNegative = false }) {
  if (value == null) return null;
  const good = goodWhenNegative ? value < 0 : value > 0;
  const flat = Math.abs(value) < 0.05;
  const cls = flat ? "flat" : good ? "up" : "down";
  const sign = value > 0 ? "+" : "";
  return (
    <div className="bench-delta">
      <span>{label}</span>
      <b className={"delta " + cls}>{sign}{value}{unit}</b>
    </div>
  );
}

export default function BenchmarkPanel({ fakeBoost, notify }) {
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [cmp, setCmp] = useState(null);
  const [busy, setBusy] = useState("");
  const [fake, setFake] = useState(false);

  const run = async (which) => {
    setBusy(which);
    try {
      const r = await invoke("run_benchmark", { seconds: DUR });
      if (which === "before") {
        setBefore(r); setAfter(null); setCmp(null);
      } else {
        setAfter(r);
        if (before) {
          const c = await invoke("compare_benchmark", { before, after: r });
          setCmp(c);
          if (fakeBoost) { setFake(true); setTimeout(() => setFake(false), 2800); }
        }
      }
    } catch (e) { notify?.(String(e)); }
    finally { setBusy(""); }
  };

  const note = after?.note || before?.note;

  return (
    <div className="card bench">
      <div className="card-head">
        <div>
          <h2><IconChart width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--data)" }} />Benchmark avant / après</h2>
          <p className="lead">Mesure réelle CPU/RAM/température sur {DUR}s. FPS mesurés via PresentMon si un jeu tourne — jamais inventés.</p>
        </div>
      </div>

      <div className="bench-actions">
        <button className="btn" disabled={!!busy} onClick={() => run("before")}>
          {busy === "before" ? <span className="spin" /> : <IconBolt />} Mesurer (avant)
        </button>
        <span className="bench-arrow">→</span>
        <button className="btn" disabled={!!busy || !before} onClick={() => run("after")}>
          {busy === "after" ? <span className="spin" /> : <IconBolt />} Mesurer (après)
        </button>
      </div>

      {(before || after) && (
        <div className="bench-grid">
          <Col title="Avant" r={before} />
          <Col title="Après" r={after} />
        </div>
      )}

      {cmp && (
        <div className="bench-compare">
          <p className="bench-summary">{cmp.summary}</p>
          <div className="bench-deltas">
            <Delta label="FPS" value={cmp.fps_delta} />
            <Delta label="CPU" value={cmp.cpu_delta} unit="%" goodWhenNegative />
            <Delta label="RAM" value={cmp.ram_delta} unit="%" goodWhenNegative />
            <Delta label="RAM libre" value={cmp.free_ram_delta_gb} unit=" Go" />
            <Delta label="Temp" value={cmp.temp_delta_c} unit="°" goodWhenNegative />
          </div>
          <p className="muted tiny">{cmp.fps_note}</p>
          <p className="muted tiny">{cmp.disclaimer}</p>
        </div>
      )}

      {note && !cmp && <p className="honest" style={{ marginTop: 12 }}><IconBolt width={15} height={15} /> {note}</p>}
      {!before && <p className="muted tiny bench-hint">Astuce : lance ton jeu, mesure « avant », optimise, puis mesure « après » pour comparer honnêtement.</p>}

      {fake && (
        <div className="fake-boost" role="presentation">
          <b>+847</b><span>FPS</span>
          <small>Fake Boost™ (pour de faux 😄) — les vrais chiffres sont au-dessus.</small>
        </div>
      )}
    </div>
  );
}
