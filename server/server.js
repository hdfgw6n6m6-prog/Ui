// server/server.js — PulseBoost : licence liée au compte Discord + panel web.
//
// Flux : l'app fait un login Discord (OAuth) -> session signée.
//        L'utilisateur "redeem" une clé -> la clé est liée à son ID Discord.
//        L'entitlement est vérifié par compte Discord (plus de partage de clé).
//
//   Env requis :
//     DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
//     PUBLIC_URL=https://api.tondomaine.com   (URL publique de CE serveur)
//     SESSION_SECRET=...        (HMAC sessions, 32+ octets aleatoires)
//     LICENSE_PRIVATE_KEY=...   (Ed25519, depuis keygen.js)
//     ADMIN_DISCORD_IDS=123,456 (IDs Discord autorises sur le panel)
//
//   node keygen.js  (une fois)   puis   node server.js

import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as discord from "./discord.js";
import { startBot } from "./bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

const PUBLIC_URL = process.env.PUBLIC_URL ?? "http://localhost:8787";
const ADMIN_IDS = (process.env.ADMIN_DISCORD_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// --- Base de donnees ---
// DATA_DIR permet de placer la base sur un disque persistant (utile sur un
// hebergeur de bots Node ou le filesystem applicatif peut etre ephemere).
const DATA_DIR = process.env.DATA_DIR ?? __dirname;
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "pulseboost.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY, username TEXT, avatar TEXT,
    banned INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), last_login TEXT
  );
  CREATE TABLE IF NOT EXISTS keys (
    key TEXT PRIMARY KEY, plan TEXT NOT NULL, days INTEGER NOT NULL,
    discord_id TEXT, redeemed_at TEXT, expires_at TEXT,
    revoked INTEGER DEFAULT 0, note TEXT, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS devices (
    discord_id TEXT, hwid TEXT, label TEXT,
    first_seen TEXT DEFAULT (datetime('now')), last_seen TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (discord_id, hwid)
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, discord_id TEXT,
    hwid TEXT, ip TEXT, detail TEXT, at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, level TEXT, discord_id TEXT,
    message TEXT, resolved INTEGER DEFAULT 0, at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT, type TEXT,
    payload TEXT, delivered INTEGER DEFAULT 0, at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS flags (name TEXT PRIMARY KEY, enabled INTEGER, scope TEXT);
  CREATE TABLE IF NOT EXISTS blacklist (hwid TEXT PRIMARY KEY, discord_id TEXT, reason TEXT, at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT, hwid TEXT, type TEXT, detail TEXT, at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT, reason TEXT, comment TEXT, at TEXT DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS snapshots (discord_id TEXT PRIMARY KEY, hwid TEXT, score INTEGER, hw TEXT, last_seen TEXT DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS idx_events_at ON events(at);
`);
for (const [n, s] of [["ai_analysis","pro"],["ai_chat","pro"],["network_tweaks","pro"],["game_profiles","pro"],["monitoring","free"]]) {
  db.prepare("INSERT OR IGNORE INTO flags (name, enabled, scope) VALUES (?,1,?)").run(n, s);
}

const log = (type, { discord_id=null, hwid=null, ip=null, detail=null } = {}) =>
  db.prepare("INSERT INTO logs (type,discord_id,hwid,ip,detail) VALUES (?,?,?,?,?)").run(type, discord_id, hwid, ip, detail);

// --- Alertes + flux SSE ---
const sseClients = new Set();
function alert(level, message, discord_id = null) {
  const info = db.prepare("INSERT INTO alerts (level,discord_id,message) VALUES (?,?,?)").run(level, discord_id, message);
  const payload = JSON.stringify({ id: info.lastInsertRowid, level, message, discord_id, at: new Date().toISOString() });
  for (const res of sseClients) res.write(`data: ${payload}\n\n`);
}

// --- Crypto : sessions HMAC + tokens Ed25519 ---
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
function makeSession(payload, ttlMs = 30 * 86400000) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  try { if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null; } catch { return null; }
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  if (data.exp < Date.now()) return null;
  return data;
}
const PRIV = process.env.LICENSE_PRIVATE_KEY
  ? crypto.createPrivateKey({ key: Buffer.from(process.env.LICENSE_PRIVATE_KEY, "hex"), format: "der", type: "pkcs8" })
  : null;
function signEntitlement(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  return body.toString("base64url") + "." + crypto.sign(null, body, PRIV).toString("base64url");
}

// --- Discord OAuth ---
async function discordExchange(code, redirectUri) {
  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code", code, redirect_uri: redirectUri,
    }),
  });
  const tok = await r.json();
  return fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((x) => x.json());
}

// Callback de l'APP desktop -> redirige vers le loopback local de l'app.
app.get("/auth/callback", async (req, res) => {
  try {
    const st = JSON.parse(Buffer.from(req.query.state, "base64url").toString()); // { port, nonce }
    const u = await discordExchange(req.query.code, `${PUBLIC_URL}/auth/callback`);
    db.prepare(`INSERT INTO users (discord_id,username,avatar,last_login) VALUES (?,?,?,datetime('now'))
                ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, avatar=excluded.avatar, last_login=datetime('now')`)
      .run(u.id, u.username, u.avatar ?? null);
    if (db.prepare("SELECT banned FROM users WHERE discord_id=?").get(u.id)?.banned) return res.send("<h2>Compte banni.</h2>");
    log("login", { discord_id: u.id, ip: req.ip });
    const session = makeSession({ kind: "app", id: u.id, name: u.username });
    res.redirect(`http://127.0.0.1:${st.port}/?session=${encodeURIComponent(session)}&name=${encodeURIComponent(u.username)}`);
  } catch (e) { console.error(e); res.status(500).send("Erreur OAuth"); }
});

// --- REDEEM : lier une cle au compte Discord ---

// Le compte a-t-il encore au moins une cle active ? (decide le retrait du role Pro)
function proStillActive(discord_id) {
  return !!db.prepare(`SELECT 1 FROM keys WHERE discord_id=? AND revoked=0
    AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1`).get(discord_id);
}

const normKey = (k) => String(k ?? "").trim().toUpperCase();
app.post("/v1/redeem", (req, res) => {
  const s = readSession(req.body.session);
  if (!s || s.kind !== "app") return res.status(401).json({ error: "session invalide" });
  const key = normKey(req.body.key);
  const row = db.prepare("SELECT * FROM keys WHERE key=?").get(key);
  if (!row || row.revoked) { log("redeem_fail", { discord_id: s.id, detail: key }); return res.status(403).json({ error: "cle invalide ou revoquee" }); }
  if (row.discord_id && row.discord_id !== s.id) {
    alert("warn", `Cle ${key} deja liee a un autre compte - tentative par ${s.name}`, s.id);
    return res.status(403).json({ error: "cle deja utilisee par un autre compte" });
  }
  const expires = row.days === 0 ? "2099-01-01T00:00:00Z" : new Date(Date.now() + row.days * 86400000).toISOString();
  db.prepare("UPDATE keys SET discord_id=?, redeemed_at=COALESCE(redeemed_at,datetime('now')), expires_at=? WHERE key=?").run(s.id, expires, key);
  log("redeem", { discord_id: s.id, detail: `${key} (${row.plan})` });
  alert("info", `${s.name} a active une cle ${row.plan}`, s.id);
  discord.safe(() => discord.addRole(s.id));
  discord.safe(() => discord.postLog(`✅ **${s.name}** a active une cle **${row.plan}** (\`${key}\`)`));
  res.json({ ok: true, plan: row.plan, expires_at: expires });
});

// --- ENTITLEMENT (heartbeat de l'app) ---
app.post("/v1/entitlement", (req, res) => {
  const s = readSession(req.body.session);
  if (!s || s.kind !== "app") return res.status(401).json({ error: "session invalide" });
  const hwid = String(req.body.hwid ?? "");
  if (db.prepare("SELECT banned FROM users WHERE discord_id=?").get(s.id)?.banned) return res.status(403).json({ error: "compte banni" });

  // --- Anti-crack : blacklist HWID (propagation a tout le compte) ---
  const blacklisted = !!db.prepare("SELECT 1 FROM blacklist WHERE hwid=?").get(hwid);
  if (req.body.tampered || blacklisted) {
    if (!blacklisted && hwid) {
      db.prepare("INSERT OR IGNORE INTO blacklist (hwid,discord_id,reason) VALUES (?,?,?)").run(hwid, s.id, "tamper signale par le client");
      db.prepare("UPDATE keys SET revoked=1 WHERE discord_id=?").run(s.id); // stop full access du compte
      alert("bad", `Falsification detectee : ${s.name} (HWID blackliste, cles revoquees)`, s.id);
    }
    log("blacklist_hit", { discord_id: s.id, hwid, ip: req.ip });
    return res.json({ pro: false, plan: "free", flags: {}, token: null, blacklisted: true,
      command: { type: "alert", payload: "Acces bloque : falsification detectee." } });
  }

  if (hwid) {
    const existed = db.prepare("SELECT 1 FROM devices WHERE discord_id=? AND hwid=?").get(s.id, hwid);
    db.prepare(`INSERT INTO devices (discord_id,hwid,last_seen) VALUES (?,?,datetime('now'))
                ON CONFLICT(discord_id,hwid) DO UPDATE SET last_seen=datetime('now')`).run(s.id, hwid);
    if (!existed) {
      const n = db.prepare("SELECT COUNT(*) c FROM devices WHERE discord_id=?").get(s.id).c;
      if (n > 3) alert("warn", `${s.name} : ${n} appareils differents (partage de compte probable)`, s.id);
    }
  }

  const key = db.prepare(`SELECT * FROM keys WHERE discord_id=? AND revoked=0
                          AND (expires_at IS NULL OR expires_at > datetime('now'))
                          ORDER BY expires_at DESC LIMIT 1`).get(s.id);
  const pro = !!key;
  const flags = Object.fromEntries(db.prepare("SELECT name,enabled,scope FROM flags").all()
    .map((f) => [f.name, f.enabled === 1 && (f.scope === "free" || pro)]));
  const cmd = db.prepare("SELECT * FROM commands WHERE discord_id=? AND delivered=0 ORDER BY id LIMIT 1").get(s.id);
  if (cmd) db.prepare("UPDATE commands SET delivered=1 WHERE id=?").run(cmd.id);

  const token = PRIV ? signEntitlement({
    id: s.id, hwid, pro, plan: key?.plan ?? "free",
    exp: Math.min(key ? new Date(key.expires_at).getTime() : Date.now() + 7*86400000, Date.now() + 7*86400000),
    iat: Date.now(),
  }) : null;
  res.json({ pro, plan: key?.plan ?? "free", expires_at: key?.expires_at ?? null, flags, token,
    command: cmd ? { type: cmd.type, payload: cmd.payload } : null });
});

// --- TELEMETRIE CLIENT (opt-in cote app) ---
app.post("/v1/telemetry", (req, res) => {
  const ss = readSession(req.body.session);
  if (!ss || ss.kind !== "app") return res.status(401).json({ error: "session" });
  const hwid = String(req.body.hwid ?? "");
  const ins = db.prepare("INSERT INTO events (discord_id,hwid,type,detail) VALUES (?,?,?,?)");
  for (const e of (req.body.events ?? []).slice(0, 50)) ins.run(ss.id, hwid, String(e.type), e.detail != null ? String(e.detail) : null);
  if (req.body.snapshot) {
    const { score = null, hw = null } = req.body.snapshot;
    db.prepare(`INSERT INTO snapshots (discord_id,hwid,score,hw,last_seen) VALUES (?,?,?,?,datetime('now'))
                ON CONFLICT(discord_id) DO UPDATE SET hwid=excluded.hwid, score=excluded.score, hw=excluded.hw, last_seen=datetime('now')`)
      .run(ss.id, hwid, score, hw ? JSON.stringify(hw) : null);
  }
  res.json({ ok: true });
});

// --- FEEDBACK DE DESABONNEMENT (churn) ---
app.post("/v1/churn_feedback", (req, res) => {
  const ss = readSession(req.body.session);
  if (!ss || ss.kind !== "app") return res.status(401).json({ error: "session" });
  db.prepare("INSERT INTO feedback (discord_id,reason,comment) VALUES (?,?,?)").run(ss.id, String(req.body.reason ?? ""), String(req.body.comment ?? ""));
  alert("info", `Churn: ${ss.name} -> ${req.body.reason}`, ss.id);
  discord.safe(() => discord.postLog(`📉 **${ss.name}** desabonnement — raison: ${req.body.reason}${req.body.comment ? " ("+req.body.comment+")" : ""}`));
  res.json({ ok: true });
});

// --- ANALYSE IA (feature Pro 100% serveur = incrackable par nature) ---
// Fournisseur : Google Gemini. La cle reste cote serveur, jamais dans le .exe.
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const AI_SYSTEM_PROMPT = `Tu es l'analyste integre d'un logiciel d'optimisation PC pour gamers Windows (FiveM, Fortnite, Valorant, CS2, Warzone).
REGLES STRICTES :
- Tu recois un scan hardware + un score deja calcule localement. Tu EXPLIQUES, tu n'inventes pas de chiffres.
- Jamais de promesse de FPS chiffree : utilise "faible / moyen / variable selon ta config".
- Le scan peut contenir "running_game" (jeu lance) et "games" (jeux installes) : ADAPTE tes conseils
  au jeu joue (ex. competitif comme Valorant/CS2 -> priorite latence/reseau ; FiveM -> CPU + reseau).
- Ton : direct, sympa, niveau debutant, tutoiement.
- Reponds UNIQUEMENT en JSON valide : { "resume": "...", "recommandations": [{ "id","titre","pourquoi","priorite","impact" }], "limite_materielle": "string|null" }`;

// Petit util : extrait un objet JSON meme si le modele l'enrobe de texte/markdown.
function parseJsonLoose(text) {
  const cleaned = String(text ?? "").replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a >= 0 && b > a) return JSON.parse(cleaned.slice(a, b + 1));
  throw new Error("reponse IA non parsable");
}

app.post("/v1/analyze", async (req, res) => {
  const ss = readSession(req.body.session);
  if (!ss || ss.kind !== "app") return res.status(401).json({ error: "session invalide" });
  // abonnement actif requis
  const active = db.prepare(`SELECT 1 FROM keys WHERE discord_id=? AND revoked=0
    AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1`).get(ss.id);
  const aiFlag = db.prepare("SELECT enabled FROM flags WHERE name='ai_analysis'").get()?.enabled === 1;
  if (!active || !aiFlag) return res.status(403).json({ error: "analyse IA reservee aux abonnes Pro actifs" });
  if (!req.body.scan) return res.status(400).json({ error: "scan manquant" });
  if (!process.env.GEMINI_API_KEY) return res.status(502).json({ error: "IA non configuree (GEMINI_API_KEY)" });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: `Locale: ${req.body.locale ?? "fr"}\nScan PC: ${JSON.stringify(req.body.scan)}` }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1200, responseMimeType: "application/json" },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) { console.error("[gemini]", r.status, JSON.stringify(data).slice(0, 400)); return res.status(502).json({ error: "analyse indisponible" }); }
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const out = parseJsonLoose(text);
    db.prepare("INSERT INTO events (discord_id,hwid,type,detail) VALUES (?,?,?,?)")
      .run(ss.id, String(req.body.hwid ?? ""), "ai_analysis", GEMINI_MODEL);
    res.json(out);
  } catch (e) {
    console.error("[analyze]", e);
    res.status(502).json({ error: "analyse indisponible" });
  }
});

// --- CHAT IA AGENTIQUE (support PC + app), feature Pro 100% serveur ---
// Gemini voit le profil/etat de l'app (contexte) et PROPOSE des actions que
// l'app execute APRES confirmation de l'utilisateur. Le serveur n'execute rien
// sur le PC : il ne fait que router vers Gemini.
const CHAT_ACTIONS = "free_analysis{}, apply_recommended{}, apply_game_profile{game}, rollback_all{}, reset_profile{}, open_tab{tab in [pulse,optims,securite,assistant]}";
const CHAT_SYSTEM = `Tu es l'assistant integre de PulseBoost (optimiseur PC pour gamers) ET le support de l'application.
TON ROLE : aider a regler les problemes du PC (perfs, FPS, latence, reglages Windows) ET les problemes de l'app (licence, activation, optimisations, profil).
REGLES STRICTES :
- Jamais de FPS chiffres garantis : "faible / moyen / variable selon ta config".
- Tu N'EXECUTES rien toi-meme. Quand une action est utile, tu la PROPOSES dans le champ "action" ; l'app demandera CONFIRMATION a l'utilisateur puis l'executera.
- Pour toute action destructive (reset_profile, rollback_all), ton "reply" DOIT demander clairement confirmation et expliquer les consequences.
- Actions autorisees (name + args) : ${CHAT_ACTIONS}. Si aucune action n'est utile, "action": null.
- Sers-toi du CONTEXTE (licence, score, jeux, optimisations appliquees) pour repondre precisement et tutoyer l'utilisateur.
- Reponds STRICTEMENT en JSON : {"reply":"texte pour l'utilisateur","action": null | {"name":"...","args":{...}}}`;

app.post("/v1/chat", async (req, res) => {
  const ss = readSession(req.body.session);
  if (!ss || ss.kind !== "app") return res.status(401).json({ error: "session invalide" });
  const active = db.prepare(`SELECT 1 FROM keys WHERE discord_id=? AND revoked=0
    AND (expires_at IS NULL OR expires_at > datetime('now')) LIMIT 1`).get(ss.id);
  const flag = db.prepare("SELECT enabled FROM flags WHERE name='ai_chat'").get()?.enabled === 1;
  if (!active || !flag) return res.status(403).json({ error: "assistant IA reserve aux abonnes Pro actifs" });
  if (!process.env.GEMINI_API_KEY) return res.status(502).json({ error: "IA non configuree (GEMINI_API_KEY)" });

  // Historique -> format Gemini (roles user/model), limite a 16 derniers tours.
  const history = (req.body.messages ?? []).slice(-16).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content ?? "") }],
  }));
  if (!history.length) return res.status(400).json({ error: "message manquant" });
  const context = JSON.stringify(req.body.context ?? {});
  const sys = `${CHAT_SYSTEM}\nLocale: ${req.body.locale ?? "fr"}\nCONTEXTE UTILISATEUR/APP: ${context}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: sys }] },
          contents: history,
          generationConfig: { temperature: 0.5, maxOutputTokens: 900, responseMimeType: "application/json" },
        }),
      }
    );
    const data = await r.json();
    if (!r.ok) { console.error("[gemini chat]", r.status, JSON.stringify(data).slice(0, 400)); return res.status(502).json({ error: "assistant indisponible" }); }
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const out = parseJsonLoose(text);
    // Garde-fou : n'accepter que les actions whitelistees.
    const allowed = ["free_analysis", "apply_recommended", "apply_game_profile", "rollback_all", "reset_profile", "open_tab"];
    if (out.action && !allowed.includes(out.action.name)) out.action = null;
    db.prepare("INSERT INTO events (discord_id,hwid,type,detail) VALUES (?,?,?,?)")
      .run(ss.id, String(req.body.hwid ?? ""), "ai_chat", out.action?.name ?? null);
    res.json({ reply: String(out.reply ?? ""), action: out.action ?? null });
  } catch (e) {
    console.error("[chat]", e);
    res.status(502).json({ error: "assistant indisponible" });
  }
});

// --- PANEL ADMIN ---
app.get("/admin/login", (req, res) => {
  const state = Buffer.from(JSON.stringify({ admin: true })).toString("base64url");
  res.redirect(`https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}` +
    `&response_type=code&scope=identify&redirect_uri=${encodeURIComponent(PUBLIC_URL + "/admin/callback")}&state=${state}`);
});
app.get("/admin/callback", async (req, res) => {
  try {
    const u = await discordExchange(req.query.code, `${PUBLIC_URL}/admin/callback`);
    if (!ADMIN_IDS.includes(u.id)) return res.status(403).send("Acces refuse : compte non admin.");
    const sess = makeSession({ kind: "admin", id: u.id, name: u.username }, 12 * 3600000);
    res.setHeader("Set-Cookie", `pb_admin=${sess}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
    res.redirect("/panel");
  } catch (e) { console.error(e); res.status(500).send("Erreur OAuth admin"); }
});
function admin(req, res, next) {
  const cookie = (req.headers.cookie ?? "").split(";").map((c) => c.trim()).find((c) => c.startsWith("pb_admin="));
  const s = readSession(cookie?.slice("pb_admin=".length));
  if (!s || s.kind !== "admin" || !ADMIN_IDS.includes(s.id)) return res.status(401).json({ error: "non authentifie" });
  req.admin = s; next();
}

app.get("/admin/api/stats", admin, (req, res) => res.json({
  users: db.prepare("SELECT COUNT(*) c FROM users").get().c,
  active: db.prepare("SELECT COUNT(*) c FROM keys WHERE revoked=0 AND discord_id IS NOT NULL AND (expires_at IS NULL OR expires_at>datetime('now'))").get().c,
  keys: db.prepare("SELECT COUNT(*) c FROM keys").get().c,
  alerts: db.prepare("SELECT COUNT(*) c FROM alerts WHERE resolved=0").get().c,
}));
app.get("/admin/api/keys", admin, (req, res) => res.json(db.prepare("SELECT * FROM keys ORDER BY created_at DESC LIMIT 500").all()));
app.post("/admin/api/keys", admin, (req, res) => {
  const { plan="monthly", days=30, qty=1, note=null } = req.body ?? {};
  const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase().slice(0,4);
  const out = [];
  for (let i=0; i<Math.min(qty,100); i++) {
    const key = `PB-${seg()}-${seg()}-${seg()}-${seg()}`;
    db.prepare("INSERT INTO keys (key,plan,days,note) VALUES (?,?,?,?)").run(key, plan, plan==="lifetime"?0:days, note);
    out.push(key);
  }
  log("keys_created", { discord_id: req.admin.id, detail: `${out.length}x ${plan}` });
  if (req.body.dm_to) {
    discord.safe(() => discord.dmUser(req.body.dm_to,
      `🔑 Ta/tes cle(s) PulseBoost **${plan}** :\n${out.map(k => "`"+k+"`").join("\n")}\n\nDans l'app : connecte-toi avec Discord puis colle ta cle.`));
  }
  res.json({ keys: out });
});
app.post("/admin/api/revoke", admin, (req, res) => {
  const key = normKey(req.body.key);
  const owner = db.prepare("SELECT discord_id FROM keys WHERE key=?").get(key)?.discord_id;
  const r = db.prepare("UPDATE keys SET revoked=1 WHERE key=?").run(key);
  if (r.changes) {
    alert("info", `Cle ${key} revoquee par admin`);
    if (owner && !proStillActive(owner)) discord.safe(() => discord.removeRole(owner));
    discord.safe(() => discord.postLog(`⛔ Cle \`${key}\` revoquee par admin`));
  }
  res.json({ revoked: r.changes === 1 });
});
app.post("/admin/api/unbind", admin, (req, res) =>
  res.json({ unbound: db.prepare("UPDATE keys SET discord_id=NULL, redeemed_at=NULL WHERE key=?").run(normKey(req.body.key)).changes === 1 }));
app.get("/admin/api/users", admin, (req, res) => res.json(db.prepare(`
  SELECT u.*, (SELECT COUNT(*) FROM devices d WHERE d.discord_id=u.discord_id) devices,
         (SELECT plan FROM keys k WHERE k.discord_id=u.discord_id AND k.revoked=0 ORDER BY expires_at DESC LIMIT 1) plan
  FROM users u ORDER BY last_login DESC LIMIT 500`).all()));
app.post("/admin/api/ban", admin, (req, res) => {
  const { discord_id, banned=1 } = req.body ?? {};
  db.prepare("UPDATE users SET banned=? WHERE discord_id=?").run(banned?1:0, discord_id);
  if (banned) {
    db.prepare("UPDATE keys SET revoked=1 WHERE discord_id=?").run(discord_id);
    discord.safe(() => discord.removeRole(discord_id));
    discord.safe(() => discord.dmUser(discord_id, "⛔ Ton acces PulseBoost a ete suspendu. Contacte le support si tu penses que c'est une erreur."));
    discord.safe(() => discord.postLog(`🔨 <@${discord_id}> banni + cles revoquees par admin`));
  }
  alert("warn", `Utilisateur ${discord_id} ${banned?"banni + cles revoquees":"debanni"} par admin`, discord_id);
  res.json({ ok: true });
});
app.get("/admin/api/logs", admin, (req, res) => res.json(db.prepare("SELECT * FROM logs ORDER BY id DESC LIMIT 300").all()));
app.get("/admin/api/alerts", admin, (req, res) => res.json(db.prepare("SELECT * FROM alerts ORDER BY id DESC LIMIT 100").all()));
app.post("/admin/api/alerts/resolve", admin, (req, res) => res.json({ ok: db.prepare("UPDATE alerts SET resolved=1 WHERE id=?").run(req.body.id).changes === 1 }));
app.get("/admin/api/alerts/stream", admin, (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(": connecte\n\n"); sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});
app.post("/admin/api/command", admin, (req, res) => {
  const { discord_id, type, payload="" } = req.body ?? {};
  db.prepare("INSERT INTO commands (discord_id,type,payload) VALUES (?,?,?)").run(discord_id, type, payload);
  log("command", { discord_id: req.admin.id, detail: `${type} -> ${discord_id}` });
  res.json({ queued: true });
});
app.get("/admin/api/flags", admin, (req, res) => res.json(db.prepare("SELECT * FROM flags").all()));
app.post("/admin/api/flags", admin, (req, res) => {
  const { name, enabled, scope } = req.body ?? {};
  db.prepare("UPDATE flags SET enabled=?, scope=COALESCE(?,scope) WHERE name=?").run(enabled?1:0, scope ?? null, name);
  res.json({ ok: true });
});

// Le panel ordonne au bot d'envoyer un DM (personne ne tape ca dans Discord)
app.post("/admin/api/dm", admin, async (req, res) => {
  const { discord_id, message } = req.body ?? {};
  const r = await discord.safe(() => discord.dmUser(discord_id, message));
  log("discord_dm", { discord_id: req.admin.id, detail: `-> ${discord_id}` });
  res.json({ sent: r !== null });
});
// Le panel ordonne au bot d'ajouter/retirer un role
app.post("/admin/api/role", admin, async (req, res) => {
  const { discord_id, action, role_id } = req.body ?? {};
  const r = await discord.safe(() => action === "remove"
    ? discord.removeRole(discord_id, role_id) : discord.addRole(discord_id, role_id));
  log("discord_role", { discord_id: req.admin.id, detail: `${action} ${role_id||"PRO"} -> ${discord_id}` });
  res.json({ ok: r !== null || true });
});

// Analytics agregees
app.get("/admin/api/analytics", admin, (req, res) => {
  const one = (q, ...p) => db.prepare(q).get(...p);
  const all = (q, ...p) => db.prepare(q).all(...p);
  const dau = one("SELECT COUNT(DISTINCT discord_id) c FROM events WHERE at > datetime('now','-1 day')").c;
  const wau = one("SELECT COUNT(DISTINCT discord_id) c FROM events WHERE at > datetime('now','-7 day')").c;
  const totalUsers = one("SELECT COUNT(*) c FROM users").c;
  const proUsers = one(`SELECT COUNT(DISTINCT discord_id) c FROM keys WHERE revoked=0 AND discord_id IS NOT NULL AND (expires_at IS NULL OR expires_at>datetime('now'))`).c;
  const newUsers = one("SELECT COUNT(*) c FROM users WHERE created_at > datetime('now','-7 day')").c;
  const avgScore = one("SELECT ROUND(AVG(score)) s FROM snapshots").s;
  const expiringSoon = one("SELECT COUNT(*) c FROM keys WHERE revoked=0 AND expires_at BETWEEN datetime('now') AND datetime('now','+7 day')").c;
  const churned30 = one("SELECT COUNT(*) c FROM keys WHERE revoked=0 AND redeemed_at IS NOT NULL AND expires_at BETWEEN datetime('now','-30 day') AND datetime('now')").c;
  const planMix = all("SELECT plan, COUNT(*) c FROM keys WHERE discord_id IS NOT NULL AND revoked=0 GROUP BY plan");
  const topTweaks = all("SELECT detail, COUNT(*) c FROM events WHERE type='tweak_applied' GROUP BY detail ORDER BY c DESC LIMIT 10");
  const redeemsByDay = all("SELECT date(redeemed_at) d, COUNT(*) c FROM keys WHERE redeemed_at > datetime('now','-14 day') GROUP BY d ORDER BY d");
  const activeByDay = all("SELECT date(at) d, COUNT(DISTINCT discord_id) c FROM events WHERE at > datetime('now','-14 day') GROUP BY d ORDER BY d");
  const conversion = totalUsers ? Math.round((proUsers/totalUsers)*100) : 0;
  res.json({ dau, wau, totalUsers, proUsers, newUsers, avgScore, conversion, expiringSoon, churned30, planMix, topTweaks, redeemsByDay, activeByDay });
});

// Detail complet d'un client (analyse "qu'est-ce qui ne va pas")
app.get("/admin/api/user", admin, (req, res) => {
  const id = req.query.discord_id;
  const user = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
  if (!user) return res.status(404).json({ error: "introuvable" });
  const keys = db.prepare("SELECT * FROM keys WHERE discord_id=? ORDER BY created_at DESC").all(id);
  const devices = db.prepare("SELECT * FROM devices WHERE discord_id=? ORDER BY last_seen DESC").all(id);
  const snap = db.prepare("SELECT * FROM snapshots WHERE discord_id=?").get(id);
  const events = db.prepare("SELECT type,detail,at FROM events WHERE discord_id=? ORDER BY id DESC LIMIT 60").all(id);
  const feedback = db.prepare("SELECT reason,comment,at FROM feedback WHERE discord_id=? ORDER BY id DESC").all(id);
  if (snap?.hw) try { snap.hw = JSON.parse(snap.hw); } catch {}

  // Avatar Discord (CDN). Animé si le hash commence par a_, sinon défaut Discord.
  let avatar;
  try {
    avatar = user.avatar
      ? `https://cdn.discordapp.com/avatars/${id}/${user.avatar}.${user.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
  } catch { avatar = "https://cdn.discordapp.com/embed/avatars/0.png"; }

  // Connexions (logins) avec IP + adresses distinctes.
  const connections = db.prepare("SELECT ip, at FROM logs WHERE discord_id=? AND type='login' ORDER BY id DESC LIMIT 50").all(id);
  const ips = db.prepare("SELECT DISTINCT ip FROM logs WHERE discord_id=? AND ip IS NOT NULL ORDER BY id DESC LIMIT 30").all(id).map((r) => r.ip);

  // Temps d'utilisation estimé : on regroupe les évènements en sessions
  // (coupure > 30 min = nouvelle session) et on somme les durées.
  const ts = db.prepare("SELECT at FROM events WHERE discord_id=? ORDER BY at ASC").all(id)
    .map((r) => +new Date(String(r.at).replace(" ", "T") + "Z")).filter((n) => !isNaN(n));
  const GAP = 30 * 60000, MIN = 2 * 60000;
  let totalMs = 0, sessions = 0, start = null, last = null;
  for (const t of ts) {
    if (start === null) { start = last = t; sessions++; continue; }
    if (t - last <= GAP) { last = t; }
    else { totalMs += Math.max(last - start, MIN); start = last = t; sessions++; }
  }
  if (start !== null) totalMs += Math.max(last - start, MIN);
  const agg = db.prepare(`SELECT COUNT(*) total, COUNT(DISTINCT date(at)) active_days,
                                 MIN(at) first_at, MAX(at) last_at FROM events WHERE discord_id=?`).get(id);
  const usage = {
    total_ms: totalMs, sessions, total_events: agg.total, active_days: agg.active_days,
    first_seen: agg.first_at, last_seen: agg.last_at, logins: connections.length,
  };

  res.json({ user, avatar, keys, devices, snapshot: snap, events, feedback, connections, ips, usage });
});

// Vue churn : qui expire bientot, qui a churn, raisons
app.get("/admin/api/churn", admin, (req, res) => res.json({
  expiring: db.prepare(`SELECT k.key,k.plan,k.expires_at,u.username,k.discord_id FROM keys k LEFT JOIN users u ON u.discord_id=k.discord_id
    WHERE k.revoked=0 AND k.expires_at BETWEEN datetime('now') AND datetime('now','+7 day') ORDER BY k.expires_at`).all(),
  churned: db.prepare(`SELECT k.key,k.plan,k.expires_at,u.username,k.discord_id FROM keys k LEFT JOIN users u ON u.discord_id=k.discord_id
    WHERE k.revoked=0 AND k.redeemed_at IS NOT NULL AND k.expires_at < datetime('now') ORDER BY k.expires_at DESC LIMIT 100`).all(),
  reasons: db.prepare("SELECT reason, COUNT(*) c FROM feedback GROUP BY reason ORDER BY c DESC").all(),
  recent: db.prepare(`SELECT f.reason,f.comment,f.at,u.username FROM feedback f LEFT JOIN users u ON u.discord_id=f.discord_id ORDER BY f.id DESC LIMIT 50`).all(),
}));

app.get("/admin/api/blacklist", admin, (req, res) => res.json(db.prepare("SELECT * FROM blacklist ORDER BY at DESC LIMIT 300").all()));
app.post("/admin/api/blacklist", admin, (req, res) => {
  const { hwid, discord_id=null, reason="manuel" } = req.body ?? {};
  db.prepare("INSERT OR REPLACE INTO blacklist (hwid,discord_id,reason) VALUES (?,?,?)").run(hwid, discord_id, reason);
  if (discord_id) db.prepare("UPDATE keys SET revoked=1 WHERE discord_id=?").run(discord_id);
  alert("bad", `HWID ${String(hwid).slice(0,12)}... blackliste manuellement`, discord_id);
  res.json({ ok: true });
});
app.post("/admin/api/unblacklist", admin, (req, res) =>
  res.json({ removed: db.prepare("DELETE FROM blacklist WHERE hwid=?").run(req.body.hwid).changes }));

app.get("/panel", admin, (req, res) => res.sendFile(path.join(__dirname, "public", "panel.html")));
app.get("/", (req, res) => res.redirect("/admin/login"));

app.listen(process.env.PORT ?? 8787, () => console.log(`PulseBoost server pret - panel sur ${PUBLIC_URL}/panel`));

// Bot Discord (gateway) : commandes admin slash. Le panel web reste actif en parallèle.
startBot({ db, discord, adminIds: ADMIN_IDS, log, alert });
