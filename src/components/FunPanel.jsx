// FunPanel.jsx — réglages "fun" + badges + import/export de config.
// Personnalité de l'app : ton, sons, animations, mode Roast IA. Le tout en local.
import React, { useRef } from "react";
import { IconCog, IconTrophy, IconDownload, IconUpload, IconSparkle } from "./Icons.jsx";

function Row({ title, desc, checked, onChange }) {
  return (
    <div className="fun-row">
      <div>
        <b>{title}</b>
        <small>{desc}</small>
      </div>
      <label className="switch">
        <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="slider" />
      </label>
    </div>
  );
}

export default function FunPanel({ prefs, onSet, onExport, onImport }) {
  const fileRef = useRef(null);
  const p = prefs || {};

  return (
    <>
      <div className="card fun">
        <div className="card-head">
          <div>
            <h2><IconCog width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--pulse-2)" }} />Personnalité de l'app</h2>
            <p className="lead">Le fond reste honnête et sérieux ; la forme, c'est toi qui choisis.</p>
          </div>
        </div>

        <div className="fun-row">
          <div>
            <b>Ton des messages</b>
            <small>Casual = bienveillant. Try Hard = compétitif et cash.</small>
          </div>
          <div className="seg">
            <button className={p.tone === "casual" ? "on" : ""} onClick={() => onSet({ tone: "casual" })}>Casual</button>
            <button className={p.tone === "tryhard" ? "on" : ""} onClick={() => onSet({ tone: "tryhard" })}>Try Hard</button>
          </div>
        </div>

        <Row title="Sons d'interface" desc="Petits bips Web Audio sur succès et rollback." checked={p.sounds} onChange={(v) => onSet({ sounds: v })} />
        <Row title="Fake Boost" desc="Animation exagérée « +847 FPS » après un benchmark. 100 % cosmétique, assumé." checked={p.fake_boost} onChange={(v) => onSet({ fake_boost: v })} />
        <Row title="Mode Roast (IA)" desc="L'assistant te chambre gentiment dans ses réponses." checked={p.roast_mode} onChange={(v) => onSet({ roast_mode: v })} />
        <Row title="Overlay monitoring (bêta)" desc="Indice d'un futur overlay FPS en jeu. Drapeau bêta — pas encore d'overlay réel." checked={p.overlay_beta} onChange={(v) => onSet({ overlay_beta: v })} />
      </div>

      <div className="card fun">
        <div className="card-head">
          <div>
            <h2><IconTrophy width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--warn)" }} />Badges</h2>
            <p className="lead">{p.rollback_count ? `${p.rollback_count} rollback(s) au compteur.` : "Tes hauts faits apparaîtront ici."}</p>
          </div>
        </div>
        {p.badges?.length > 0 ? (
          <div className="badges">
            {p.badges.map((b) => (
              <span key={b} className="badge-chip"><IconSparkle width={14} height={14} /> {b}</span>
            ))}
          </div>
        ) : (
          <p className="empty">Aucun badge pour l'instant. (Indice : le badge « Survivant de 47 rollbacks » existe vraiment… 😏)</p>
        )}
      </div>

      <div className="card fun">
        <div className="card-head">
          <div>
            <h2>Config partageable</h2>
            <p className="lead">Exporte tes réglages + optimisations dans un fichier, ou importe la config d'un pote.</p>
          </div>
        </div>
        <div className="fun-io">
          <button className="btn" onClick={onExport}><IconDownload /> Exporter (.json)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><IconUpload /> Importer…</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </>
  );
}
