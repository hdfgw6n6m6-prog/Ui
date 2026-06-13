// App.jsx — UI principale PulseBoost
// 3 onglets : Pulse (dashboard), Optimisations, Sécurité (journal + rollback).
import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ScoreGauge from "./components/ScoreGauge.jsx";

const TIER_COLOR = { vert: "var(--ok)", orange: "var(--warn)", rouge: "var(--bad)" };

export default function App() {
  const [tab, setTab] = useState("pulse");
  const [scan, setScan] = useState(null);
  const [health, setHealth] = useState(null);
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [tweaks, setTweaks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [live, setLive] = useState({ cpu_pct: 0, ram_pct: 0, cpu_temp_c: null });
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [pro, setPro] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [gate, setGate] = useState({ state: "checking", reason: "" });
  const [discordName, setDiscordName] = useState(null);
  const [logged, setLogged] = useState(false);
  const [telemetry, setTelemetry] = useState(false);
  const [churnOpen, setChurnOpen] = useState(false);
  const isPro = pro;

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 4000); };

  useEffect(() => {
    (async () => {
      try {
        const [s, h, t] = await Promise.all([
          invoke("scan_hardware"),
          invoke("health_score"),
          invoke("list_tweaks"),
        ]);
        setScan(s); setHealth(h); setTweaks(t);
      } catch (e) { notify(String(e)); }
    })();
    // 0) Porte de sécurité AVANT tout (blacklist/tamper, marche hors-ligne)
    (async () => {
      try {
        const g = await invoke("security_gate");
        setGate(g);
        if (g.state !== "ok") return; // app verrouillée
      } catch { setGate({ state: "ok", reason: "" }); }

      try {
        const [s, h, t] = await Promise.all([
          invoke("scan_hardware"),
          invoke("health_score"),
          invoke("list_tweaks"),
        ]);
        setScan(s); setHealth(h); setTweaks(t);
      } catch (e) { notify(String(e)); }

      // Licence : statut local (offline), login déjà fait ?, puis heartbeat serveur.
      try { setTelemetry(await invoke("telemetry_consent")); } catch {}
      try { setPro((await invoke("license_status")).pro); } catch {}
      try {
        const li = await invoke("logged_in"); setLogged(li);
        if (li) {
          const hb = await invoke("license_heartbeat");
          setPro(!!hb.pro);
          if (hb.command?.type === "alert") notify(hb.command.payload);
          // Churn : déjà connu comme Pro mais plus actif -> proposer un court sondage.
          const wasPro = localStorage.getItem("pb_was_pro") === "1";
          if (wasPro && !hb.pro) setChurnOpen(true);
          localStorage.setItem("pb_was_pro", hb.pro ? "1" : "0");
        }
      } catch {}
    })();

    const iv = setInterval(async () => {
      try { setLive(await invoke("live_stats")); } catch {}
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  const loginDiscord = async () => {
    setBusy(true);
    try {
      const name = await invoke("discord_login");
      setDiscordName(name);
      setLogged(true);
      notify(`Connecté en tant que ${name}. Tu peux activer ta clé.`);
      const hb = await invoke("license_heartbeat");
      setPro(!!hb.pro);
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  const redeem = async () => {
    setBusy(true);
    try {
      const r = await invoke("redeem_key", { key: keyInput });
      setPro(true);
      notify(`Clé ${r.plan} activée et liée à ton compte Discord.`);
      setTweaks(await invoke("list_tweaks"));
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  const runAi = async () => {
    if (!scan) return;
    setAiBusy(true);
    try { setAi(await invoke("ai_analysis", { scan, locale: "fr" })); }
    catch (e) { notify(String(e)); }
    finally { setAiBusy(false); }
  };

  const applySelected = async () => {
    setBusy(true);
    try {
      const r = await invoke("apply_tweaks", { ids: selected });
      notify(`${r.applied.length} optimisation(s) appliquée(s). Point de restauration créé.`);
      setTweaks(await invoke("list_tweaks"));
      setHealth(await invoke("health_score"));
      setSelected([]);
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  const rollback = async () => {
    setBusy(true);
    try {
      const r = await invoke("rollback_all");
      notify(`${r.reverted} changement(s) annulé(s). Ton PC est revenu à son état d'origine.`);
      setTweaks(await invoke("list_tweaks"));
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  const boost = async (game) => {
    try {
      const r = await invoke("game_boost", { game });
      notify(r.priority === "ok"
        ? `${game} : priorité CPU haute activée.`
        : `${game} ne tourne pas encore — lance le jeu puis réessaie.`);
    } catch (e) { notify(String(e)); }
  };

  const toggleTelemetry = async () => {
    const v = !telemetry;
    setTelemetry(v);
    try { await invoke("set_telemetry_consent", { on: v }); } catch {}
  };

  const sendChurn = async (reason, comment) => {
    try { await invoke("submit_churn", { reason, comment: comment || "" }); } catch {}
    setChurnOpen(false);
    notify("Merci pour ton retour.");
  };

  const loadLog = async () => setLog(await invoke("change_log"));
  useEffect(() => { if (tab === "securite") loadLog(); }, [tab]);

  const freeTweaks = useMemo(() => tweaks.filter((t) => !t.pro_only), [tweaks]);
  const proTweaks = useMemo(() => tweaks.filter((t) => t.pro_only), [tweaks]);

  // Écran de verrouillage : blacklist / falsification détectée (même hors-ligne).
  if (gate.state !== "ok" && gate.state !== "checking") {
    return (
      <div className="locked">
        <div className="lock-card">
          <span className="lock-ico">⊘</span>
          <h1>Accès bloqué</h1>
          <p>{gate.reason}</p>
          <p className="muted">Si tu penses que c'est une erreur, contacte le support sur le Discord avec ton identifiant.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="rail">
        <div className="logo"><span className="logo-pulse" />PulseBoost</div>
        <nav>
          {[["pulse", "Pulse"], ["optims", "Optimisations"], ["securite", "Sécurité"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "nav on" : "nav"} onClick={() => setTab(k)}>{l}</button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className="stat-mini"><span>CPU</span><b>{live.cpu_pct?.toFixed(0)}%</b></div>
          <div className="stat-mini"><span>RAM</span><b>{live.ram_pct?.toFixed(0)}%</b></div>
          {live.cpu_temp_c != null && <div className="stat-mini"><span>Temp</span><b>{live.cpu_temp_c.toFixed(0)}°C</b></div>}
        </div>
      </aside>

      <main className="content">
        {tab === "pulse" && (
          <section className="grid-pulse">
            <div className="card hero">
              <ScoreGauge value={health?.score ?? 0} color={TIER_COLOR[health?.tier] ?? "var(--ok)"} />
              <div className="hero-side">
                <h1>Santé de ton PC</h1>
                {health?.reasons?.length
                  ? <ul className="reasons">{health.reasons.map((r, i) => (
                      <li key={i}><span className={"dot " + r.severity}>–{r.penalty}</span>{r.label}</li>
                    ))}</ul>
                  : <p className="muted">Aucun problème détecté. Sérieusement, ton PC est propre.</p>}
                <button className="btn primary" onClick={runAi} disabled={aiBusy || !scan}>
                  {aiBusy ? "Analyse en cours…" : "Analyse IA détaillée"}
                </button>
              </div>
            </div>

            {ai && (
              <div className="card">
                <h2>Ce que dit l'analyse</h2>
                <p>{ai.resume}</p>
                {ai.limite_materielle && <p className="honest">Limite matérielle : {ai.limite_materielle}</p>}
                <ul className="reco">
                  {ai.recommandations?.map((r) => (
                    <li key={r.id}>
                      <b>{r.titre}</b> <span className={"badge " + r.priorite}>{r.priorite}</span>
                      <p>{r.pourquoi}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card">
              <h2>Game Boost</h2>
              <p className="muted">Lance ton jeu, puis booste-le. Tout revient à la normale à la fermeture.</p>
              <div className="games">
                {["FiveM", "Fortnite", "Valorant", "CS2", "Warzone", "Apex Legends"].map((g) => {
                  const installed = scan?.games?.some((x) => x.name === g);
                  return (
                    <button key={g} className={installed ? "game on" : "game"} onClick={() => boost(g)}>
                      {g}{installed && <span className="installed">détecté</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {tab === "optims" && (
          <section>
            <div className="card">
              <div className="row-between">
                <h2>Optimisations gratuites</h2>
                <button className="btn primary" disabled={!selected.length || busy} onClick={applySelected}>
                  {busy ? "Application…" : `Appliquer (${selected.length})`}
                </button>
              </div>
              <p className="muted">Un point de restauration Windows est créé avant chaque application. Si ça échoue, rien n'est modifié.</p>
              <TweakList tweaks={freeTweaks} selected={selected} setSelected={setSelected} locked={false} />
            </div>
            <div className="card pro">
              <h2>Optimisations Pro</h2>
              <TweakList tweaks={proTweaks} selected={selected} setSelected={setSelected} locked={!isPro} />
              {!isPro && (
                <div className="activate">
                  {!discordName && !logged ? (
                    <>
                      <p className="muted">Connecte-toi avec Discord, puis active ta clé. La clé se lie à ton compte Discord.</p>
                      <button className="btn discord" onClick={loginDiscord} disabled={busy}>
                        {busy ? "Ouverture…" : "Se connecter avec Discord"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="muted">{discordName ? `Connecté : ${discordName}. ` : ""}Colle ta clé pour débloquer le Pro.</p>
                      <div className="activate-row">
                        <input
                          className="key-field"
                          placeholder="PB-XXXX-XXXX-XXXX-XXXX"
                          value={keyInput}
                          onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                          maxLength={22}
                        />
                        <button className="btn pro-cta" onClick={redeem} disabled={busy || keyInput.length < 10}>
                          {busy ? "Activation…" : "Activer"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
              {isPro && <p className="pro-active">Licence Pro active — merci ✦</p>}
            </div>
          </section>
        )}

        {tab === "securite" && (
          <section>
            <div className="card">
              <div className="row-between">
                <h2>Journal des modifications</h2>
                <button className="btn danger" onClick={rollback} disabled={busy || !log.length}>
                  Rollback complet
                </button>
              </div>
              <p className="muted">Chaque changement est listé avec sa valeur d'origine. Le rollback restaure tout, dans l'ordre inverse.</p>
              {log.length === 0
                ? <p className="empty">Aucune modification pour l'instant. Applique une optimisation pour la voir apparaître ici.</p>
                : <table className="log">
                    <thead><tr><th>Quand</th><th>Optimisation</th><th>Cible</th><th>Avant</th><th>Après</th></tr></thead>
                    <tbody>{log.map((e, i) => (
                      <tr key={i}>
                        <td>{new Date(e.quand).toLocaleString("fr-FR")}</td>
                        <td>{e.optimisation}</td>
                        <td className="mono">{e.cible}</td>
                        <td className="mono">{JSON.stringify(e.avant)}</td>
                        <td className="mono">{JSON.stringify(e["après"])}</td>
                      </tr>
                    ))}</tbody>
                  </table>}
            </div>
            <div className="card">
              <div className="row-between">
                <div>
                  <h2>Statistiques d'usage anonymes</h2>
                  <p className="muted" style={{ maxWidth: 520 }}>
                    Optionnel. Si tu actives, l'app envoie ton score PC et des évènements d'usage (optimisations appliquées) pour nous aider à améliorer le produit. Aucune donnée personnelle, aucun fichier. Désactivé par défaut.
                  </p>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={telemetry} onChange={toggleTelemetry} />
                  <span className="slider" />
                </label>
              </div>
            </div>
          </section>
        )}
      </main>

      {churnOpen && <ChurnSurvey onSubmit={sendChurn} onClose={() => setChurnOpen(false)} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function TweakList({ tweaks, selected, setSelected, locked }) {
  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <ul className="tweaks">
      {tweaks.map((t) => (
        <li key={t.id} className={t.applied ? "tweak done" : "tweak"}>
          <label>
            <input
              type="checkbox"
              disabled={locked || t.applied}
              checked={selected.includes(t.id)}
              onChange={() => toggle(t.id)}
            />
            <span className="tweak-main">
              <b>{t.label}</b>
              <small>{t.description}</small>
            </span>
            <span className="impact">{t.applied ? "déjà actif" : t.impact}</span>
            {locked && <span className="lock">PRO</span>}
          </label>
        </li>
      ))}
    </ul>
  );
}

// Sondage de désabonnement (churn) — court, non bloquant, alimente le panel.
function ChurnSurvey({ onSubmit, onClose }) {
  const [reason, setReason] = useState("");
  const [comment, setComment] = useState("");
  const reasons = [
    "Trop cher",
    "Pas assez de gains ressentis",
    "Problème technique / bug",
    "Je ne joue plus autant",
    "J'ai trouvé une alternative",
    "Autre",
  ];
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2>Ton abonnement a expiré</h2>
        <p className="muted">Une question rapide : qu'est-ce qui t'a fait partir ? Ça nous aide à nous améliorer.</p>
        <div className="churn-reasons">
          {reasons.map((r) => (
            <button key={r} className={reason === r ? "chip on" : "chip"} onClick={() => setReason(r)}>{r}</button>
          ))}
        </div>
        <textarea
          className="churn-comment"
          placeholder="Un détail à ajouter ? (optionnel)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <div className="row-between">
          <button className="btn" onClick={onClose}>Plus tard</button>
          <button className="btn primary" disabled={!reason} onClick={() => onSubmit(reason, comment)}>Envoyer</button>
        </div>
      </div>
    </div>
  );
}
