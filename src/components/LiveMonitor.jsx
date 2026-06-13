// LiveMonitor.jsx — monitoring temps réel façon Afterburner, mais lisible.
// Réutilise le flux `live_stats` (déjà polled dans App) : aucune commande backend
// nouvelle. Affiche CPU / RAM / Température avec une sparkline d'historique.
import React from "react";

function Sparkline({ data, color, max = 100 }) {
  const W = 100, H = 38, n = data.length;
  if (n < 2) return <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" />;
  const pts = data.map((v, i) => {
    const x = (i / (n - 1)) * W;
    const y = H - Math.min(Math.max(v, 0), max) / max * (H - 3) - 1.5;
    return [x, y];
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const gid = `g-${color.replace(/[^a-z]/gi, "")}`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const colorFor = (pct) =>
  pct >= 90 ? "var(--bad)" : pct >= 70 ? "var(--warn)" : "var(--data)";

export default function LiveMonitor({ cpuHist, ramHist, tempHist, live }) {
  const temp = live?.cpu_temp_c;
  const metrics = [
    { lbl: "Processeur", val: live?.cpu_pct ?? 0, unit: "%", hist: cpuHist, max: 100 },
    { lbl: "Mémoire", val: live?.ram_pct ?? 0, unit: "%", hist: ramHist, max: 100 },
    temp != null
      ? { lbl: "Température", val: temp, unit: "°C", hist: tempHist, max: 100, isTemp: true }
      : { lbl: "Température", val: null, unit: "", hist: [], max: 100 },
  ];
  return (
    <div className="monitor">
      {metrics.map((m) => (
        <div className="metric" key={m.lbl}>
          <div className="metric-top">
            <span className="lbl">{m.lbl}</span>
            <span className="val" style={{ color: m.val == null ? "var(--muted-2)" : colorFor(m.isTemp ? m.val : m.val) }}>
              {m.val == null ? "—" : Math.round(m.val)}<span className="unit">{m.unit}</span>
            </span>
          </div>
          <Sparkline data={m.hist} color={colorFor(m.val ?? 0)} max={m.max} />
        </div>
      ))}
    </div>
  );
}
