// ScanMiniGame.jsx — mini-jeu idle pendant les scans/chargements.
// Des orbes apparaissent : clique-les en attendant. Purement fun, non bloquant.
import React, { useEffect, useRef, useState } from "react";

export default function ScanMiniGame({ active, label = "En attendant…" }) {
  const [score, setScore] = useState(0);
  const [orbs, setOrbs] = useState([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!active) { setOrbs([]); return; }
    const iv = setInterval(() => {
      setOrbs((o) => [
        ...o.slice(-4),
        { id: ++idRef.current, x: 10 + Math.random() * 78, y: 14 + Math.random() * 64 },
      ]);
    }, 720);
    return () => clearInterval(iv);
  }, [active]);

  if (!active) return null;

  const pop = (id) => {
    setScore((s) => s + 1);
    setOrbs((o) => o.filter((x) => x.id !== id));
  };

  return (
    <div className="minigame" role="presentation">
      <div className="mg-head">{label} <span className="mg-score">⚡ {score}</span></div>
      <div className="mg-field">
        {orbs.map((o) => (
          <button key={o.id} className="mg-orb" style={{ left: `${o.x}%`, top: `${o.y}%` }} onClick={() => pop(o.id)} aria-label="orbe" />
        ))}
      </div>
    </div>
  );
}
