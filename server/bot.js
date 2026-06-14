// bot.js — Bot Discord (gateway) pour l'administration par commandes slash.
//
// Choix de conception (cf. PASSATION) :
//  - Connexion gateway avec `intents: 0` : le bot NE LIT AUCUN message, n'a aucune
//    permission privilégiée. Il ne reçoit que les INTERACTION_CREATE (slash commands).
//  - CHAQUE commande est verrouillée aux ADMIN_DISCORD_IDS. Un non-admin reçoit un refus.
//  - Aucune dépendance lourde : client gateway minimal via `ws`, REST via fetch.
//
//  Le panel web reste disponible en parallèle (cette brique ne le remplace pas).
//  Env requis : DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID (commandes instantanées).

import crypto from "node:crypto";
import { WebSocket } from "ws";

const API = "https://discord.com/api/v10";
const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 4);
const normKey = (k) => String(k ?? "").trim().toUpperCase();

// Types d'options Discord : 3=STRING, 4=INTEGER, 5=BOOLEAN, 6=USER
const C = (name, description, options = []) => ({ name, description, options });
const COMMANDS = [
  C("genkey", "Générer des clés PulseBoost", [
    { type: 3, name: "plan", description: "Plan", required: true, choices: [
      { name: "weekly", value: "weekly" }, { name: "monthly", value: "monthly" },
      { name: "quarterly", value: "quarterly" }, { name: "lifetime", value: "lifetime" }] },
    { type: 4, name: "qty", description: "Quantité (défaut 1)", required: false },
    { type: 4, name: "days", description: "Jours (sinon selon le plan)", required: false },
    { type: 6, name: "dm", description: "Envoyer la/les clé(s) en DM à", required: false },
  ]),
  C("keys", "Lister des clés", [{ type: 6, name: "user", description: "Filtrer par utilisateur", required: false }]),
  C("revoke", "Révoquer une clé", [{ type: 3, name: "key", description: "Clé PB-XXXX-...", required: true }]),
  C("ban", "Bannir un utilisateur (révoque ses clés)", [{ type: 6, name: "user", description: "Utilisateur", required: true }]),
  C("unban", "Débannir un utilisateur", [{ type: 6, name: "user", description: "Utilisateur", required: true }]),
  C("stats", "Statistiques rapides"),
  C("blacklist", "Blacklister un HWID", [
    { type: 3, name: "hwid", description: "HWID (hash)", required: true },
    { type: 3, name: "reason", description: "Raison", required: false }]),
  C("unblacklist", "Retirer un HWID de la blacklist", [{ type: 3, name: "hwid", description: "HWID", required: true }]),
  C("userinfo", "Infos détaillées d'un utilisateur", [{ type: 6, name: "user", description: "Utilisateur", required: true }]),
  C("dm", "Envoyer un message privé à un utilisateur", [
    { type: 6, name: "user", description: "Utilisateur", required: true },
    { type: 3, name: "message", description: "Message", required: true }]),
  C("help", "Liste des commandes admin"),
];

export function startBot({ db, discord, adminIds = [], log = () => {}, alert = () => {} }) {
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  const APP = process.env.DISCORD_CLIENT_ID;
  const GUILD = process.env.DISCORD_GUILD_ID;
  if (!TOKEN || !APP) {
    console.log("[bot] DISCORD_BOT_TOKEN/CLIENT_ID manquant — commandes Discord désactivées.");
    return;
  }
  if (!adminIds.length) console.log("[bot] ⚠️ ADMIN_DISCORD_IDS vide — aucune commande ne sera autorisée.");

  registerCommands().catch((e) => console.error("[bot] enregistrement commandes:", e.message));

  // --- Logique métier (réutilise la même base que le panel) ---
  const proStillActive = (id) => !!db.prepare(
    "SELECT 1 FROM keys WHERE discord_id=? AND revoked=0 AND (expires_at IS NULL OR expires_at>datetime('now')) LIMIT 1").get(id);

  function runCommand(name, o, uid) {
    switch (name) {
      case "genkey": {
        const plan = o.plan || "monthly";
        const fallback = { weekly: 7, monthly: 30, quarterly: 90, lifetime: 0 }[plan] ?? 30;
        const days = plan === "lifetime" ? 0 : (o.days ?? fallback);
        const qty = Math.min(Math.max(o.qty || 1, 1), 50);
        const ins = db.prepare("INSERT INTO keys (key,plan,days,note) VALUES (?,?,?,?)");
        const out = [];
        for (let i = 0; i < qty; i++) { const key = `PB-${seg()}-${seg()}-${seg()}-${seg()}`; ins.run(key, plan, days, `discord:${uid}`); out.push(key); }
        log("keys_created", { discord_id: uid, detail: `${qty}x ${plan} (discord)` });
        if (o.dm) discord.safe(() => discord.dmUser(o.dm, `🔑 Ta/tes clé(s) PulseBoost **${plan}** :\n${out.map((k) => "`" + k + "`").join("\n")}\n\nDans l'app : connecte-toi avec Discord puis colle ta clé.`));
        discord.safe(() => discord.postLog(`🔑 ${qty}x **${plan}** générée(s) via Discord`));
        return `✅ ${qty} clé(s) **${plan}** :\n${out.map((k) => "`" + k + "`").join("\n")}${o.dm ? `\n📩 Envoyée(s) en DM à <@${o.dm}>` : ""}`;
      }
      case "keys": {
        if (o.user) {
          const rows = db.prepare("SELECT key,plan,revoked,expires_at FROM keys WHERE discord_id=? ORDER BY created_at DESC LIMIT 15").all(o.user);
          return rows.length ? `Clés de <@${o.user}> :\n` + rows.map((r) => `\`${r.key}\` · ${r.plan}${r.revoked ? " ⛔" : ""}`).join("\n") : "Aucune clé pour cet utilisateur.";
        }
        const rows = db.prepare("SELECT key,plan,discord_id,revoked FROM keys ORDER BY created_at DESC LIMIT 10").all();
        return rows.length ? "10 dernières clés :\n" + rows.map((r) => `\`${r.key}\` · ${r.plan} · ${r.discord_id ? `<@${r.discord_id}>` : "libre"}${r.revoked ? " ⛔" : ""}`).join("\n") : "Aucune clé.";
      }
      case "revoke": {
        const key = normKey(o.key);
        const owner = db.prepare("SELECT discord_id FROM keys WHERE key=?").get(key)?.discord_id;
        const r = db.prepare("UPDATE keys SET revoked=1 WHERE key=?").run(key);
        if (!r.changes) return "Clé introuvable.";
        if (owner && !proStillActive(owner)) discord.safe(() => discord.removeRole(owner));
        alert("info", `Clé ${key} révoquée via Discord`);
        discord.safe(() => discord.postLog(`⛔ Clé \`${key}\` révoquée via Discord`));
        return `⛔ Clé \`${key}\` révoquée.`;
      }
      case "ban": {
        const id = o.user;
        db.prepare("INSERT OR IGNORE INTO users (discord_id) VALUES (?)").run(id);
        db.prepare("UPDATE users SET banned=1 WHERE discord_id=?").run(id);
        db.prepare("UPDATE keys SET revoked=1 WHERE discord_id=?").run(id);
        discord.safe(() => discord.removeRole(id));
        discord.safe(() => discord.dmUser(id, "⛔ Ton accès PulseBoost a été suspendu. Contacte le support si tu penses que c'est une erreur."));
        alert("warn", `<@${id}> banni via Discord`, id);
        discord.safe(() => discord.postLog(`🔨 <@${id}> banni + clés révoquées via Discord`));
        return `🔨 <@${id}> banni, clés révoquées.`;
      }
      case "unban": {
        db.prepare("UPDATE users SET banned=0 WHERE discord_id=?").run(o.user);
        return `✅ <@${o.user}> débanni (ses anciennes clés restent révoquées — régénère si besoin).`;
      }
      case "stats": {
        const one = (q) => db.prepare(q).get().c;
        return `📊 **PulseBoost — stats**\n• Utilisateurs : ${one("SELECT COUNT(*) c FROM users")}\n` +
          `• Abonnés actifs : ${one("SELECT COUNT(*) c FROM keys WHERE revoked=0 AND discord_id IS NOT NULL AND (expires_at IS NULL OR expires_at>datetime('now'))")}\n` +
          `• Clés totales : ${one("SELECT COUNT(*) c FROM keys")}\n` +
          `• Actifs 24h : ${one("SELECT COUNT(DISTINCT discord_id) c FROM events WHERE at>datetime('now','-1 day')")}\n` +
          `• Bannis : ${one("SELECT COUNT(*) c FROM users WHERE banned=1")}`;
      }
      case "blacklist": {
        const hwid = String(o.hwid).trim();
        db.prepare("INSERT OR REPLACE INTO blacklist (hwid,discord_id,reason) VALUES (?,?,?)").run(hwid, null, o.reason || "via Discord");
        alert("bad", `HWID ${hwid.slice(0, 12)}… blacklisté via Discord`);
        return `🚫 HWID \`${hwid.slice(0, 20)}…\` blacklisté.`;
      }
      case "unblacklist": {
        const r = db.prepare("DELETE FROM blacklist WHERE hwid=?").run(String(o.hwid).trim());
        return r.changes ? "✅ HWID retiré de la blacklist." : "HWID introuvable dans la blacklist.";
      }
      case "userinfo": {
        const id = o.user;
        const u = db.prepare("SELECT * FROM users WHERE discord_id=?").get(id);
        if (!u) return "Utilisateur inconnu (jamais connecté à l'app).";
        const plan = db.prepare("SELECT plan FROM keys WHERE discord_id=? AND revoked=0 AND (expires_at IS NULL OR expires_at>datetime('now')) ORDER BY expires_at DESC LIMIT 1").get(id)?.plan || "free";
        const devices = db.prepare("SELECT COUNT(*) c FROM devices WHERE discord_id=?").get(id).c;
        const snap = db.prepare("SELECT score FROM snapshots WHERE discord_id=?").get(id);
        return `👤 <@${id}> (${u.username || "?"})\n• Email : ${u.email || "–"}${u.email ? (u.email_verified ? " ✅" : " ⚠️ non vérifié") : ""}\n• Plan : **${plan}**\n• Appareils (HWID) : ${devices}\n• Score PC : ${snap?.score ?? "–"}/100\n• Banni : ${u.banned ? "oui ⛔" : "non"}\n• Dernière connexion : ${u.last_login || "–"}`;
      }
      case "dm": {
        discord.safe(() => discord.dmUser(o.user, o.message));
        log("discord_dm", { discord_id: uid, detail: `-> ${o.user}` });
        return `📩 Message envoyé à <@${o.user}>.`;
      }
      case "help":
        return "**Commandes admin PulseBoost**\n`/genkey` `/keys` `/revoke` `/ban` `/unban` `/stats` `/blacklist` `/unblacklist` `/userinfo` `/dm`\nToutes réservées aux administrateurs.";
      default:
        return "Commande inconnue.";
    }
  }

  // --- Enregistrement des slash commands (guild = instantané) ---
  async function registerCommands() {
    const url = GUILD ? `${API}/applications/${APP}/guilds/${GUILD}/commands` : `${API}/applications/${APP}/commands`;
    const r = await fetch(url, { method: "PUT", headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(COMMANDS) });
    if (!r.ok) console.error("[bot] PUT commands", r.status, (await r.text()).slice(0, 200));
    else console.log(`[bot] ${COMMANDS.length} commandes slash enregistrées (${GUILD ? "guild" : "global"}).`);
  }

  async function reply(i, content) {
    await fetch(`${API}/interactions/${i.id}/${i.token}/callback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 4, data: { content: String(content).slice(0, 1900), flags: 64 } }),
    }).catch((e) => console.error("[bot] reply", e.message));
  }

  function handleInteraction(i) {
    if (i.type !== 2) return; // 2 = APPLICATION_COMMAND
    const uid = i.member?.user?.id || i.user?.id;
    const opts = Object.fromEntries((i.data?.options || []).map((x) => [x.name, x.value]));
    if (!adminIds.includes(uid)) { reply(i, "⛔ Réservé aux administrateurs."); return; }
    try { reply(i, runCommand(i.data?.name, opts, uid)); }
    catch (e) { console.error("[bot] cmd", e); reply(i, "Erreur : " + e.message); }
  }

  // --- Client gateway minimal ---
  let ws, hb = null, lastSeq = null, acked = true, reconnectTimer = null;
  const send = (obj) => { try { ws.send(JSON.stringify(obj)); } catch {} };
  const cleanup = () => { if (hb) clearInterval(hb); hb = null; };
  const scheduleReconnect = (ms = 5000) => { clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, ms); };

  function connect() {
    cleanup();
    ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
    ws.on("message", (raw) => {
      let p; try { p = JSON.parse(raw); } catch { return; }
      const { op, d, s, t } = p;
      if (s != null) lastSeq = s;
      if (op === 10) { // HELLO
        acked = true;
        hb = setInterval(() => {
          if (!acked) { try { ws.terminate(); } catch {} return; }
          acked = false; send({ op: 1, d: lastSeq });
        }, d.heartbeat_interval);
        send({ op: 2, d: { token: TOKEN, intents: 0, properties: { os: "linux", browser: "pulseboost", device: "pulseboost" } } });
      } else if (op === 11) { acked = true; }
      else if (op === 7) { try { ws.close(); } catch {} }
      else if (op === 9) { cleanup(); scheduleReconnect(2000 + Math.random() * 3000); }
      else if (op === 0) {
        if (t === "READY") console.log("[bot] connecté à Discord ✓");
        else if (t === "INTERACTION_CREATE") handleInteraction(d);
      }
    });
    ws.on("close", () => { cleanup(); scheduleReconnect(); });
    ws.on("error", (e) => console.error("[bot] ws:", e.message));
  }
  connect();
}
