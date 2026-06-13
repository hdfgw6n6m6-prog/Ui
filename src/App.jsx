// App.jsx — UI principale PulseBoost (refonte 2026)
// Accueil recentré sur UNE action ("Optimiser en 1 clic") + confiance visible +
// mesure avant/après + monitoring temps réel. Onglets : Accueil, Optimisations,
// Sécurité. Toute la logique s'appuie sur l'API Tauri existante (aucun nouveau
// backend requis).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import ScoreGauge from "./components/ScoreGauge.jsx";
import LiveMonitor from "./components/LiveMonitor.jsx";
import QuickMeasure from "./components/QuickMeasure.jsx";
import {
  IconPulse, IconSliders, IconShield, IconBolt, IconCheck, IconUndo,
  IconGem, IconWarn, IconDiscord, IconGauge, IconChat, IconSend,
} from "./components/Icons.jsx";

const TIER_COLOR = { vert: "var(--ok)", orange: "var(--warn)", rouge: "var(--bad)" };
const TIER_LABEL = { vert: "Bon état", orange: "À optimiser", rouge: "Critique" };

// Jeu de tweaks appliqués par "Optimiser en 1 clic" : sûrs, réversibles, à fort
// rapport bénéfice/risque. Les sensibles (réseau, mémoire, HAGS, DNS) restent en
// mode "Avancé", choisis manuellement.
const ONE_CLICK_FREE = ["power_plan_high_perf", "disable_game_dvr", "enable_game_mode", "gaming_responsiveness", "foreground_boost", "visual_effects_performance", "disable_startup_delay"];
const ONE_CLICK_PRO = ["disable_sysmain"];
const RECOMMENDED = new Set([...ONE_CLICK_FREE, ...ONE_CLICK_PRO, "startup_report"]);

const HIST = 30; // points d'historique des sparklines
const pushHist = (arr, v) => [...arr, v].slice(-HIST);

const TABS = [
  ["pulse", "Accueil", IconPulse],
  ["optims", "Optimisations", IconSliders],
  ["assistant", "Assistant", IconChat],
  ["securite", "Sécurité", IconShield],
];
const TAB_SUB = {
  pulse: "Santé, mesure et boost de ton PC",
  optims: "Tweaks réversibles, regroupés par niveau",
  assistant: "Chat IA : règle tes soucis PC et app",
  securite: "Journal complet et retour arrière 1 clic",
};

export default function App() {
  const [tab, setTab] = useState("pulse");
  const [scan, setScan] = useState(null);
  const [health, setHealth] = useState(null);
  const [ai, setAi] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [free, setFree] = useState(null);
  const [freeBusy, setFreeBusy] = useState(false);
  const [tweaks, setTweaks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [live, setLive] = useState({ cpu_pct: 0, ram_pct: 0, cpu_temp_c: null });
  const [cpuHist, setCpuHist] = useState([]);
  const [ramHist, setRamHist] = useState([]);
  const [tempHist, setTempHist] = useState([]);
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
  const [optView, setOptView] = useState("reco"); // reco | avance
  const [activeGame, setActiveGame] = useState(null);
  const [profile, setProfile] = useState(null);
  const [autoAdapt, setAutoAdapt] = useState(() => localStorage.getItem("pb_auto_adaptive") === "1");
  const [chat, setChat] = useState([]); // { role: "user"|"assistant", content, action? }
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const isPro = pro;
  const toastTimer = useRef(null);
  const lastAutoGame = useRef(null);

  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  };

  const refreshTweaks = async () => { try { setTweaks(await invoke("list_tweaks")); } catch {} };

  useEffect(() => {
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
          const wasPro = localStorage.getItem("pb_was_pro") === "1";
          if (wasPro && !hb.pro) setChurnOpen(true);
          localStorage.setItem("pb_was_pro", hb.pro ? "1" : "0");
        }
      } catch {}
    })();

    const iv = setInterval(async () => {
      try {
        const s = await invoke("live_stats");
        setLive(s);
        setCpuHist((a) => pushHist(a, s.cpu_pct ?? 0));
        setRamHist((a) => pushHist(a, s.ram_pct ?? 0));
        if (s.cpu_temp_c != null) setTempHist((a) => pushHist(a, s.cpu_temp_c));
      } catch {}
    }, 2000);
    return () => { clearInterval(iv); clearTimeout(toastTimer.current); };
  }, []);

  const loginDiscord = async () => {
    setBusy(true);
    try {
      const name = await invoke("discord_login");
      setDiscordName(name); setLogged(true);
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
      await refreshTweaks();
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

  const runFree = async () => {
    setFreeBusy(true);
    try { setFree(await invoke("free_analysis")); }
    catch (e) { notify(String(e)); }
    finally { setFreeBusy(false); }
  };

  const applyIds = async (ids) => {
    if (!ids.length) { notify("Rien à appliquer : tout est déjà en place."); return; }
    setBusy(true);
    try {
      const r = await invoke("apply_tweaks", { ids });
      const n = r.applied?.length ?? 0;
      notify(n
        ? `${n} optimisation(s) appliquée(s). Point de restauration créé — réversible à tout moment.`
        : "Aucun changement nécessaire.");
      await refreshTweaks();
      setHealth(await invoke("health_score"));
      setSelected([]);
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  // Optimiser en 1 clic : applique le set recommandé non encore appliqué.
  const oneClick = () => {
    const wanted = [...ONE_CLICK_FREE, ...(isPro ? ONE_CLICK_PRO : [])];
    const ids = tweaks.filter((t) => wanted.includes(t.id) && !t.applied).map((t) => t.id);
    applyIds(ids);
  };

  const applySelected = () => applyIds(selected);

  const rollback = async () => {
    setBusy(true);
    try {
      const r = await invoke("rollback_all");
      notify(`${r.reverted} changement(s) annulé(s). Ton PC est revenu à son état d'origine.`);
      await refreshTweaks();
      setHealth(await invoke("health_score"));
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  const boost = async (game) => {
    try {
      const r = await invoke("game_boost", { game });
      notify(r.priority === "ok"
        ? `${game} : priorité CPU haute activée. Restaurée à la fermeture du jeu.`
        : `${game} ne tourne pas encore — lance le jeu puis réessaie.`);
    } catch (e) { notify(String(e)); }
  };

  const applyGameProfile = async (game) => {
    setBusy(true);
    try {
      const r = await invoke("apply_game_profile", { game });
      const n = r.applied?.length ?? 0;
      const skipped = r.skipped_pro?.length ?? 0;
      notify(`Profil ${game} appliqué : ${n} réglage(s) adapté(s)${skipped ? `, ${skipped} en Pro` : ""}. Réversible à tout moment.`);
      await refreshTweaks();
      setHealth(await invoke("health_score"));
    } catch (e) { notify(String(e)); }
    finally { setBusy(false); }
  };

  const toggleAutoAdapt = () => {
    const v = !autoAdapt; setAutoAdapt(v);
    localStorage.setItem("pb_auto_adaptive", v ? "1" : "0");
    if (v) notify("Mode adaptatif automatique activé : le profil s'appliquera au lancement d'un jeu.");
  };

  // Détection du jeu lancé + chargement de son profil (optimisation adaptative).
  useEffect(() => {
    if (gate.state !== "ok") return;
    let stop = false;
    const tick = async () => {
      try {
        const g = await invoke("active_game");
        if (stop) return;
        setActiveGame(g ?? null);
        if (g) {
          try { setProfile(await invoke("game_profile", { game: g })); } catch {}
        } else { setProfile(null); lastAutoGame.current = null; }
      } catch {}
    };
    tick();
    const iv = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(iv); };
  }, [gate.state]);

  // Mode automatique : applique le profil une fois par session de jeu.
  useEffect(() => {
    if (!autoAdapt || !activeGame || busy || !tweaks.length) return;
    if (lastAutoGame.current === activeGame) return;
    lastAutoGame.current = activeGame;
    applyGameProfile(activeGame);
  }, [autoAdapt, activeGame, tweaks.length]);

  const toggleTelemetry = async () => {
    const v = !telemetry; setTelemetry(v);
    try { await invoke("set_telemetry_consent", { on: v }); } catch {}
  };

  const sendChurn = async (reason, comment) => {
    try { await invoke("submit_churn", { reason, comment: comment || "" }); } catch {}
    setChurnOpen(false);
    notify("Merci pour ton retour.");
  };

  // --- Assistant IA (chat agentique) ---
  // Contexte envoyé à Gemini : profil + état de l'app (lecture). Pas de données
  // sensibles brutes, juste de quoi répondre juste.
  const buildContext = () => ({
    pro: isPro,
    connecte_discord: logged,
    pseudo: discordName,
    score: health?.score ?? null,
    etat: health?.tier ?? null,
    problemes: (health?.reasons ?? []).map((r) => r.label),
    optimisations_appliquees: tweaks.filter((t) => t.applied).map((t) => t.label),
    jeu_en_cours: activeGame,
    telemetrie: telemetry,
    onglet_actuel: tab,
  });

  const runAction = async (action) => {
    if (!action?.name) return;
    try {
      switch (action.name) {
        case "free_analysis": await runFree(); setTab("pulse"); return "Analyse gratuite effectuée — vois l'estimation sur l'Accueil.";
        case "apply_recommended": await applyIds([...ONE_CLICK_FREE, ...(isPro ? ONE_CLICK_PRO : [])].flatMap((id) => tweaks.filter((t) => t.id === id && !t.applied).map((t) => t.id))); return "Optimisations recommandées appliquées (point de restauration créé).";
        case "apply_game_profile": {
          const g = action.args?.game || activeGame;
          if (!g) return "Aucun jeu détecté — lance ton jeu puis redemande.";
          await applyGameProfile(g); return `Profil ${g} appliqué.`;
        }
        case "rollback_all": await rollback(); return "Toutes les modifications ont été annulées.";
        case "reset_profile": {
          const r = await invoke("reset_profile");
          localStorage.removeItem("pb_was_pro"); localStorage.removeItem("pb_auto_adaptive"); localStorage.removeItem("pb_measure_last");
          setPro(false); setLogged(false); setDiscordName(null); setTelemetry(false); setAutoAdapt(false);
          await refreshTweaks(); setHealth(await invoke("health_score"));
          return `Profil réinitialisé : ${r.reverted ?? 0} changement(s) annulé(s), déconnexion effectuée.`;
        }
        case "open_tab": { const t = action.args?.tab; if (TABS.some(([k]) => k === t)) setTab(t); return `Onglet « ${t} » ouvert.`; }
        default: return "Action non reconnue.";
      }
    } catch (e) { return "Échec : " + String(e); }
  };

  const sendChat = async (text) => {
    const msg = (text ?? chatInput).trim();
    if (!msg || chatBusy) return;
    setChatInput("");
    const history = [...chat, { role: "user", content: msg }];
    setChat(history);
    setChatBusy(true);
    try {
      const r = await invoke("ai_chat", {
        messages: history.map(({ role, content }) => ({ role, content })),
        context: buildContext(),
      });
      setChat((c) => [...c, { role: "assistant", content: r.reply || "…", action: r.action || null }]);
    } catch (e) {
      setChat((c) => [...c, { role: "assistant", content: String(e), action: null }]);
    } finally { setChatBusy(false); }
  };

  // Exécute une action proposée (après confirmation côté UI) et journalise le résultat dans le chat.
  const confirmChatAction = async (idx, action) => {
    setChat((c) => c.map((m, i) => i === idx ? { ...m, action: { ...m.action, done: true } } : m));
    const result = await runAction(action);
    setChat((c) => [...c, { role: "assistant", content: result, action: null }]);
  };
  const dismissChatAction = (idx) => {
    setChat((c) => c.map((m, i) => i === idx ? { ...m, action: { ...m.action, dismissed: true } } : m));
  };

  const loadLog = async () => { try { setLog(await invoke("change_log")); } catch {} };
  useEffect(() => { if (tab === "securite") loadLog(); }, [tab]);

  const recoTweaks = useMemo(() => tweaks.filter((t) => RECOMMENDED.has(t.id) && !t.pro_only), [tweaks]);
  const advFree = useMemo(() => tweaks.filter((t) => !RECOMMENDED.has(t.id) && !t.pro_only), [tweaks]);
  const proTweaks = useMemo(() => tweaks.filter((t) => t.pro_only), [tweaks]);
  const pendingOneClick = useMemo(() => {
    const wanted = [...ONE_CLICK_FREE, ...(isPro ? ONE_CLICK_PRO : [])];
    return tweaks.filter((t) => wanted.includes(t.id) && !t.applied).length;
  }, [tweaks, isPro]);

  const cpuClass = live.cpu_pct >= 90 ? "bad" : live.cpu_pct >= 70 ? "warn" : "";
  const ramClass = live.ram_pct >= 90 ? "bad" : live.ram_pct >= 70 ? "warn" : "";

  // --- Écran de chargement (porte de sécurité en cours) ---
  if (gate.state === "checking") {
    return (
      <div className="boot">
        <span className="logo-pulse" />
        <p>Vérification de sécurité…</p>
      </div>
    );
  }

  // --- Écran verrouillé : blacklist / falsification (même hors-ligne) ---
  if (gate.state !== "ok") {
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
          {TABS.map(([k, l, Ic]) => (
            <button key={k} className={tab === k ? "nav on" : "nav"} onClick={() => setTab(k)}>
              <Ic className="ic" /> {l}
            </button>
          ))}
        </nav>
        <div className="rail-foot">
          <div className={"pro-pill " + (isPro ? "on" : "off")}>
            <IconGem className="gem" />
            {isPro ? "PulseBoost Pro" : "Version gratuite"}
          </div>
        </div>
      </aside>

      <main className="content">
        <div className="topbar">
          <div>
            <h1>{TABS.find(([k]) => k === tab)[1]}</h1>
            <div className="sub">{TAB_SUB[tab]}</div>
          </div>
          <div className="topbar-live">
            <div className="chip-stat"><span>CPU</span><b className={cpuClass}>{Math.round(live.cpu_pct ?? 0)}%</b></div>
            <div className="chip-stat"><span>RAM</span><b className={ramClass}>{Math.round(live.ram_pct ?? 0)}%</b></div>
            {live.cpu_temp_c != null && <div className="chip-stat"><span>Temp</span><b>{Math.round(live.cpu_temp_c)}°</b></div>}
          </div>
        </div>

        <div className="content-inner">
          {tab === "pulse" && (
            <>
              <div className="card hero">
                <ScoreGauge
                  value={health?.score ?? 0}
                  color={TIER_COLOR[health?.tier] ?? "var(--ok)"}
                  tier={TIER_LABEL[health?.tier] ?? ""}
                />
                <div className="hero-side">
                  <div className="hero-head">
                    <h1>Santé de ton PC</h1>
                    {health?.reasons?.length
                      ? <p className="lead">{health.reasons.length} point(s) à améliorer détecté(s). On peut s'en occuper en un clic.</p>
                      : <p className="lead">Aucun problème détecté. Ton PC est déjà propre.</p>}
                  </div>

                  {health?.reasons?.length > 0 && (
                    <ul className="reasons">
                      {health.reasons.slice(0, 4).map((r, i) => (
                        <li key={i}><span className={"dot " + r.severity}>–{r.penalty}</span>{r.label}</li>
                      ))}
                    </ul>
                  )}

                  <div className="hero-cta">
                    <button className="btn primary lg" onClick={oneClick} disabled={busy || !tweaks.length}>
                      {busy ? <span className="spin" /> : <IconBolt />}
                      {busy ? "Optimisation…" : "Optimiser en 1 clic"}
                    </button>
                    <button className="btn lg" onClick={runFree} disabled={freeBusy}>
                      {freeBusy ? <span className="spin" /> : <IconGauge />}
                      {freeBusy ? "Analyse…" : "Analyse gratuite"}
                    </button>
                    <button className="btn lg ghost" onClick={runAi} disabled={aiBusy || !scan} title={isPro ? "" : "Réservé au Pro"}>
                      {aiBusy ? <span className="spin" /> : <IconPulse />}
                      {aiBusy ? "Analyse…" : "Analyse IA"}{!isPro && <span className="mini-pro">Pro</span>}
                    </button>
                  </div>
                  {pendingOneClick > 0
                    ? <p className="muted tiny">{pendingOneClick} optimisation(s) recommandée(s) prête(s) — sûres et réversibles.</p>
                    : <p className="muted tiny">Toutes les optimisations recommandées sont déjà actives.</p>}
                </div>
              </div>

              {free && <FreeAnalysisCard data={free} onOptimize={oneClick} busy={busy} pending={pendingOneClick} />}

              <TrustStrip />

              {ai && (
                <div className="card">
                  <h2>Ce que dit l'analyse</h2>
                  <p style={{ marginTop: 6 }}>{ai.resume}</p>
                  {ai.limite_materielle && (
                    <p className="honest"><IconWarn /> Limite matérielle : {ai.limite_materielle}</p>
                  )}
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

              <div className="grid-2">
                <QuickMeasure />
                <div className="card">
                  <div className="card-head"><h2>Monitoring temps réel</h2></div>
                  <p className="lead" style={{ marginBottom: 14 }}>Charge réelle du système, rafraîchie en continu.</p>
                  <LiveMonitor cpuHist={cpuHist} ramHist={ramHist} tempHist={tempHist} live={live} />
                </div>
              </div>

              <AdaptiveCard
                activeGame={activeGame}
                profile={profile}
                tweaks={tweaks}
                autoAdapt={autoAdapt}
                onToggleAuto={toggleAutoAdapt}
                onApply={applyGameProfile}
                busy={busy}
                isPro={isPro}
              />

              <div className="card">
                <div className="card-head"><h2>Game Boost</h2></div>
                <p className="lead">Lance ton jeu puis booste-le : priorité CPU haute, restaurée automatiquement à la fermeture.</p>
                <div className="games">
                  {["FiveM", "Fortnite", "Valorant", "CS2", "Warzone", "Apex Legends"].map((g) => {
                    const installed = scan?.games?.some((x) => x.name === g);
                    return (
                      <button key={g} className={installed ? "game on" : "game"} onClick={() => boost(g)}>
                        <b>{g}</b>
                        {installed
                          ? <span className="installed"><IconCheck width={12} height={12} /> détecté</span>
                          : <span className="not">booster si lancé</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "optims" && (
            <>
              <div className="card">
                <div className="apply-bar">
                  <div className="seg">
                    <button className={optView === "reco" ? "on" : ""} onClick={() => setOptView("reco")}>Recommandé</button>
                    <button className={optView === "avance" ? "on" : ""} onClick={() => setOptView("avance")}>Avancé</button>
                  </div>
                  <div className="apply-bar" style={{ gap: 14 }}>
                    <span className="count-pill">{selected.length} sélectionné(s)</span>
                    <button className="btn primary" disabled={!selected.length || busy} onClick={applySelected}>
                      {busy ? <span className="spin" /> : <IconBolt />}
                      {busy ? "Application…" : "Appliquer"}
                    </button>
                  </div>
                </div>
                <p className="lead" style={{ marginTop: 12 }}>
                  Un point de restauration Windows est créé avant chaque application. Si ça échoue, rien n'est modifié.
                </p>

                {optView === "reco" ? (
                  <TweakList tweaks={recoTweaks} selected={selected} setSelected={setSelected} locked={false} />
                ) : (
                  <>
                    <TweakList tweaks={advFree} selected={selected} setSelected={setSelected} locked={false} />
                    {advFree.length === 0 && <p className="empty">Rien ici — tout est dans Recommandé.</p>}
                  </>
                )}
              </div>

              <div className="card pro">
                <div className="card-head">
                  <h2><IconGem width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--pulse-2)" }} />Optimisations Pro</h2>
                  {isPro && <span className="pro-active"><IconCheck /> Licence active</span>}
                </div>
                <TweakList tweaks={proTweaks} selected={selected} setSelected={setSelected} locked={!isPro} />
                {!isPro && (
                  <div className="activate">
                    <ul className="pro-perks">
                      <li><IconCheck /> Tweaks réseau & latence (Nagle, DNS rapide)</li>
                      <li><IconCheck /> Mémoire, SysMain, GPU scheduling matériel</li>
                      <li><IconCheck /> Analyse IA détaillée de ton matériel</li>
                    </ul>
                    {!discordName && !logged ? (
                      <>
                        <p className="muted">Connecte-toi avec Discord, puis active ta clé. La clé se lie à ton compte (pas au PC).</p>
                        <button className="btn discord" onClick={loginDiscord} disabled={busy}>
                          <IconDiscord />{busy ? "Ouverture…" : "Se connecter avec Discord"}
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
              </div>
            </>
          )}

          {tab === "assistant" && (
            <Assistant
              chat={chat}
              chatInput={chatInput}
              setChatInput={setChatInput}
              chatBusy={chatBusy}
              onSend={sendChat}
              onConfirm={confirmChatAction}
              onDismiss={dismissChatAction}
              isPro={isPro}
            />
          )}

          {tab === "securite" && (
            <>
              <TrustStrip />
              <div className="card">
                <div className="row-between">
                  <div>
                    <h2>Journal des modifications</h2>
                    <p className="lead">Chaque changement est listé avec sa valeur d'origine. Le rollback restaure tout, dans l'ordre inverse.</p>
                  </div>
                  <button className="btn danger" onClick={rollback} disabled={busy || !log.length}>
                    <IconUndo /> Tout annuler
                  </button>
                </div>
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
                    <p className="lead" style={{ maxWidth: 540 }}>
                      Optionnel. Si tu actives, l'app envoie ton score PC et des évènements d'usage (optimisations appliquées) pour nous aider à améliorer le produit. Aucune donnée personnelle, aucun fichier. Désactivé par défaut.
                    </p>
                  </div>
                  <label className="switch">
                    <input type="checkbox" checked={telemetry} onChange={toggleTelemetry} />
                    <span className="slider" />
                  </label>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {churnOpen && <ChurnSurvey onSubmit={sendChurn} onClose={() => setChurnOpen(false)} />}
      {toast && <div className="toast"><IconCheck /> {toast}</div>}
    </div>
  );
}

// Optimisation adaptative : détecte le jeu lancé et propose (ou applique) le
// profil adapté. Le comportement auto/validation est piloté par une case à cocher.
function AdaptiveCard({ activeGame, profile, tweaks, autoAdapt, onToggleAuto, onApply, busy, isPro }) {
  const labelOf = (id) => tweaks.find((t) => t.id === id)?.label ?? id;
  return (
    <div className="card adaptive">
      <div className="row-between">
        <div>
          <h2>Optimisation adaptative</h2>
          <p className="lead">Le profil s'adapte au jeu que tu lances (priorité CPU, latence réseau…). Sûr et réversible.</p>
        </div>
        <label className="auto-toggle">
          <span>Auto</span>
          <span className="switch">
            <input type="checkbox" checked={autoAdapt} onChange={onToggleAuto} />
            <span className="slider" />
          </span>
        </label>
      </div>

      {activeGame ? (
        <div className="adaptive-live">
          <div className="adaptive-head">
            <span className="game-dot" />
            <b>{activeGame}</b> détecté
            <span className="prio-pill">priorité {profile?.priority ?? "High"}</span>
          </div>
          {profile?.summary && <p className="muted" style={{ margin: "8px 0" }}>{profile.summary}</p>}
          {profile?.tweaks?.length > 0 && (
            <div className="profile-tags">
              {profile.tweaks.map((id) => {
                const isProTweak = !isPro && !["power_plan_high_perf","disable_game_dvr","enable_game_mode","visual_effects_performance","disable_startup_delay","startup_report","clean_temp_files"].includes(id);
                return <span key={id} className={"ptag" + (isProTweak ? " pro" : "")}>{labelOf(id)}{isProTweak && " · Pro"}</span>;
              })}
            </div>
          )}
          {autoAdapt
            ? <p className="muted tiny" style={{ marginTop: 10 }}>Mode automatique actif — le profil s'applique au démarrage du jeu.</p>
            : <button className="btn primary" style={{ marginTop: 12 }} onClick={() => onApply(activeGame)} disabled={busy}>
                {busy ? <span className="spin" /> : <IconBolt />} Optimiser pour {activeGame}
              </button>}
        </div>
      ) : (
        <p className="muted" style={{ marginTop: 10 }}>Aucun jeu détecté pour l'instant. Lance ton jeu : PulseBoost reconnaîtra FiveM, Valorant, CS2, Fortnite, Warzone ou Apex et proposera le profil adapté.</p>
      )}
    </div>
  );
}

// Analyse gratuite : estimation locale d'un gain FPS en fourchette HONNÊTE.
function FreeAnalysisCard({ data, onOptimize, busy, pending }) {
  const e = data?.estimate;
  if (!e) return null;
  const tierColor = e.tier === "notable" ? "var(--ok)" : e.tier === "moyen" ? "var(--data)" : "var(--muted)";
  return (
    <div className="card free-card">
      <div className="row-between">
        <div>
          <h2>Analyse gratuite</h2>
          <p className="lead">{e.summary}</p>
        </div>
        <div className="fps-badge" style={{ borderColor: tierColor }}>
          <span className="fps-k">Gain FPS estimé</span>
          <b style={{ color: tierColor }}>+{e.fps_gain_min} à +{e.fps_gain_max}%</b>
          <span className="fps-tier">{e.tier}</span>
        </div>
      </div>

      <ul className="free-items">
        {e.items?.map((it, i) => (
          <li key={i}><span className="fi-gain">{it.gain}</span><span className="fi-label">{it.label}</span></li>
        ))}
      </ul>

      {e.hardware_note && <p className="honest"><IconWarn /> {e.hardware_note}</p>}
      <p className="muted tiny" style={{ marginTop: 6 }}>{e.disclaimer}</p>

      <div className="row-between" style={{ marginTop: 14 }}>
        <span className="muted tiny">{pending > 0 ? `${pending} réglage(s) recommandé(s) prêt(s).` : "Réglages recommandés déjà actifs."}</span>
        <button className="btn primary" onClick={onOptimize} disabled={busy || pending === 0}>
          {busy ? <span className="spin" /> : <IconBolt />} Réaliser ce gain (1 clic)
        </button>
      </div>
    </div>
  );
}

// Assistant IA agentique : chat de support PC + app. Les actions proposées par
// Gemini ne s'exécutent qu'après confirmation explicite de l'utilisateur.
const DESTRUCTIVE = new Set(["reset_profile", "rollback_all"]);
const ACTION_LABEL = {
  free_analysis: "Lancer l'analyse gratuite",
  apply_recommended: "Appliquer les optimisations recommandées",
  apply_game_profile: "Appliquer le profil du jeu",
  rollback_all: "Tout annuler (rollback)",
  reset_profile: "Réinitialiser le profil",
  open_tab: "Changer d'onglet",
};
const SUGGESTIONS = [
  "Mon PC rame en jeu, que faire ?",
  "Optimise mon PC",
  "Réinitialise mon profil",
  "Comment activer ma clé Pro ?",
];

function Assistant({ chat, chatInput, setChatInput, chatBusy, onSend, onConfirm, onDismiss, isPro }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat, chatBusy]);

  return (
    <div className="card chat-card">
      <div className="card-head">
        <div>
          <h2><IconChat width={18} height={18} style={{ verticalAlign: "-3px", marginRight: 6, color: "var(--pulse-2)" }} />Assistant IA</h2>
          <p className="lead">Décris ton souci (PC ou application). L'assistant peut proposer une action ; rien ne s'exécute sans ta confirmation.</p>
        </div>
        {!isPro && <span className="lock">PRO</span>}
      </div>

      <div className="chat-scroll">
        {chat.length === 0 && (
          <div className="chat-empty">
            <p className="muted">Pose ta question, ou choisis :</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chip" onClick={() => onSend(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={"bubble " + m.role}>
            <div className="bubble-body">{m.content}</div>
            {m.action && !m.action.dismissed && (
              <div className={"action-card" + (DESTRUCTIVE.has(m.action.name) ? " danger" : "")}>
                <div className="action-head">
                  {DESTRUCTIVE.has(m.action.name) && <IconWarn width={15} height={15} />}
                  <b>{ACTION_LABEL[m.action.name] ?? m.action.name}</b>
                  {m.action.args?.game && <span className="muted"> · {m.action.args.game}</span>}
                </div>
                {m.action.done
                  ? <span className="muted tiny">Exécution…</span>
                  : <div className="action-btns">
                      <button className="btn tiny-btn" onClick={() => onDismiss(i)}>Annuler</button>
                      <button className={"btn tiny-btn " + (DESTRUCTIVE.has(m.action.name) ? "danger" : "primary")} onClick={() => onConfirm(i, m.action)}>
                        Confirmer
                      </button>
                    </div>}
              </div>
            )}
          </div>
        ))}
        {chatBusy && <div className="bubble assistant"><div className="bubble-body typing"><span /><span /><span /></div></div>}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Écris ton message…"
          disabled={chatBusy}
        />
        <button className="btn primary" type="submit" disabled={chatBusy || !chatInput.trim()}>
          <IconSend />
        </button>
      </form>
    </div>
  );
}

function TrustStrip() {
  return (
    <div className="trust">
      <span><IconShield width={15} height={15} /> Point de restauration avant chaque action</span>
      <span><IconUndo width={15} height={15} /> 100 % réversible en 1 clic</span>
      <span><IconCheck width={15} height={15} /> Chaque modification journalisée</span>
    </div>
  );
}

function TweakList({ tweaks, selected, setSelected, locked }) {
  const toggle = (id) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  if (!tweaks.length) return null;
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
              <span className="tweak-cat">{t.category}</span>
              <b>{t.label}</b>
              <small>{t.description}</small>
            </span>
            <span className={"impact" + (t.applied ? " done" : "")}>{t.applied ? "déjà actif" : t.impact}</span>
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
