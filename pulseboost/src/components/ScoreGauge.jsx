// ScoreGauge.jsx — élément signature : compte-tours façon RPM, pas un simple cercle.
// 40 segments sur un arc de 240°, aiguille animée par spring CSS.
import React, { useEffect, useState } from "react";

export default function ScoreGauge({ value = 0, color = "var(--ok)" }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setShown(value), 150); // anim au montage
    return () => clearTimeout(t);
  }, [value]);

  const SEGMENTS = 40;
  const START = -210, SWEEP = 240; // arc de -210° à +30°
  const cx = 110, cy = 110, rOut = 96, rIn = 78;
  const lit = Math.round((shown / 100) * SEGMENTS);
  const needleAngle = START + (shown / 100) * SWEEP;

  const seg = (i) => {
    const a = START + (i / (SEGMENTS - 1)) * SWEEP;
    const rad = (a * Math.PI) / 180;
    const x1 = cx + rIn * Math.cos(rad), y1 = cy + rIn * Math.sin(rad);
    const x2 = cx + rOut * Math.cos(rad), y2 = cy + rOut * Math.sin(rad);
    return { x1, y1, x2, y2 };
  };

  return (
    <div className="gauge" role="img" aria-label={`Score de santé : ${value} sur 100`}>
      <svg viewBox="0 0 220 200" width="260">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const { x1, y1, x2, y2 } = seg(i);
          const on = i < lit;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={on ? color : "rgba(255,255,255,0.08)"}
              strokeWidth={i % 5 === 0 ? 4 : 2.5}
              strokeLinecap="round"
              style={{ transition: `stroke .4s ${i * 12}ms` }} />
          );
        })}
        <g style={{
          transform: `rotate(${needleAngle + 90}deg)`,
          transformOrigin: "110px 110px",
          transition: "transform 1.1s cubic-bezier(.34,1.4,.4,1)",
        }}>
          <line x1="110" y1="110" x2="110" y2="42" stroke={color} strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="110" cy="110" r="6" fill={color} />
      </svg>
      <div className="gauge-value">
        <span className="num" style={{ color }}>{shown}</span>
        <span className="of">/ 100</span>
      </div>
    </div>
  );
}
