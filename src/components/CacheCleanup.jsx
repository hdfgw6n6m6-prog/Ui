// CacheCleanup.jsx — nettoyage de caches, mesuré et tracé.
// Honnêteté : ça libère du DISQUE, pas des FPS. Point de restauration créé avant.
import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IconTrash, IconCheck } from "./Icons.jsx";

export default function CacheCleanup({ isPro, notify }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(true);

  const scan = async () => {
    setScanning(true);
    try {
      const d = await invoke("scan_caches");
      setData(d);
      setSel(d.items.filter((i) => !i.locked && i.size_mb > 0).map((i) => i.id));
    } catch (e) { notify?.(String(e)); }
    finally { setScanning(false); }
  };
  useEffect(() => { scan(); }, []);

  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const clean = async () => {
    if (!sel.length) return;
    setBusy(true);
    try {
      const r = await invoke("clean_caches", { ids: sel });
      notify?.(`${r.freed_mb} Mo libérés${r.skipped?.length ? ` (${r.skipped.length} ignoré·s)` : ""}. Point de restauration créé.`);
      await scan();
    } catch (e) { notify?.(String(e)); }
    finally { setBusy(false); }
  };

  const selectedMb = data?.items?.filter((i) => sel.includes(i.id)).reduce((a, i) => a + (i.size_mb || 0), 0) ?? 0;

  return (
    <div className="card cache">
      <div className="card-head">
        <div>
          <h2><IconTrash width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--data)" }} />Nettoyage de caches</h2>
          <p className="lead">Caches reconstruits automatiquement par les jeux/Windows. Libère du disque — aucun FPS perdu ni gagné.</p>
        </div>
        <button className="btn primary" disabled={busy || scanning || !sel.length} onClick={clean}>
          {busy ? <span className="spin" /> : <IconTrash />}
          {busy ? "Nettoyage…" : `Nettoyer ${selectedMb > 0 ? `(${selectedMb} Mo)` : ""}`}
        </button>
      </div>

      {scanning && <div className="skeleton" style={{ height: 56, marginTop: 12 }} />}

      {data && !scanning && (
        <ul className="cache-list">
          {data.items.map((it) => (
            <li key={it.id} className={"cache-item" + (it.locked ? " locked" : "")}>
              <label>
                <input
                  type="checkbox"
                  disabled={it.locked || it.size_mb === 0 || !it.exists}
                  checked={sel.includes(it.id)}
                  onChange={() => toggle(it.id)}
                />
                <span className="cache-main">
                  <b>{it.label}</b>
                  <small>{it.exists ? it.note : "Introuvable sur ce PC — rien à nettoyer."}</small>
                </span>
                <span className="cache-size">{it.size_mb} Mo</span>
                {it.locked && <span className="lock">PRO</span>}
              </label>
            </li>
          ))}
        </ul>
      )}

      {data && !scanning && (
        <p className="muted tiny" style={{ marginTop: 10 }}>
          {data.total_mb > 0
            ? <><IconCheck width={13} height={13} style={{ verticalAlign: "-2px", color: "var(--ok)" }} /> {data.total_mb} Mo récupérables{!isPro && data.items.some((i) => i.locked) ? " · certains caches sont réservés au Pro" : ""}.</>
            : "Tout est déjà propre — rien à nettoyer pour l'instant."}
        </p>
      )}
    </div>
  );
}
