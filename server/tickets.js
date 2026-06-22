// tickets.js — Système de support par MP (DM) avec le bot.
//
// Le bot se connecte au gateway UNIQUEMENT pour lire les messages privés (DM) :
//   intents = DIRECT_MESSAGES | MESSAGE_CONTENT (aucune commande, aucun message de serveur).
// Flux : un utilisateur DM le bot -> un ticket s'ouvre, le bot envoie un embed
//   d'accueil, et CHAQUE message est sauvegardé (même supprimé / édité).
//   L'admin lit et répond depuis le panel ; la réponse part en DM.
//
//   ⚠️ Requiert l'intent privilégié « Message Content » (portail Discord -> Bot).
//   Env : DISCORD_BOT_TOKEN.

import { WebSocket } from "ws";

const INTENTS = (1 << 12) | (1 << 15); // DIRECT_MESSAGES + MESSAGE_CONTENT

function welcomeEmbed(ticketId) {
  return {
    title: `🎫 Ticket de support #${ticketId}`,
    description: "Décris ton problème **en détail** ici. Un administrateur PulseBoost te répondra **directement dans ce message privé**.\n\nTu peux envoyer plusieurs messages, des captures, etc.",
    color: 0x8b5cf6,
    footer: { text: "PulseBoost · Support" },
    timestamp: new Date().toISOString(),
  };
}

export function startTickets({ db, discord, alert = () => {}, log = () => {} }) {
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!TOKEN) { console.log("[tickets] DISCORD_BOT_TOKEN manquant — support DM désactivé."); return; }

  let botId = null;
  const flood = new Map(); // anti-spam léger par utilisateur

  // --- Réception d'un DM utilisateur -> ticket ---
  function onUserDM(m) {
    if (!m || !m.author || m.author.bot) return;
    if (m.guild_id) return;            // on ne traite QUE les DM
    if (botId && m.author.id === botId) return;
    const uid = m.author.id;

    // anti-spam : max 25 messages / minute par personne
    const now = Date.now(); const f = flood.get(uid);
    if (!f || now > f.reset) flood.set(uid, { n: 1, reset: now + 60000 });
    else if (++f.n > 25) return;

    const atts = (m.attachments || []).map((a) => a.url).join("\n");
    const content = [m.content, atts].filter(Boolean).join("\n") || "(message vide)";
    const name = m.author.global_name || m.author.username || uid;

    let ticket = db.prepare("SELECT id FROM tickets WHERE discord_id=? AND status!='closed' ORDER BY id DESC LIMIT 1").get(uid);
    let isNew = false;
    if (!ticket) {
      const r = db.prepare("INSERT INTO tickets (discord_id,username,status) VALUES (?,?,?)").run(uid, name, "open");
      ticket = { id: r.lastInsertRowid }; isNew = true;
    }
    db.prepare("INSERT INTO ticket_messages (ticket_id,author,content,discord_message_id) VALUES (?,?,?,?)")
      .run(ticket.id, "user", content, m.id);
    db.prepare("UPDATE tickets SET status='open', updated_at=datetime('now'), username=? WHERE id=?").run(name, ticket.id);
    alert("warn", `🎫 Ticket #${ticket.id} — ${isNew ? "nouveau ticket de" : "message de"} ${name}`, uid);
    log("ticket_msg", { discord_id: uid, detail: `#${ticket.id}` });
    if (isNew) discord.safe(() => discord.dmEmbed(uid, welcomeEmbed(ticket.id)));
  }

  function onDelete(d) {
    if (!d || !d.id) return;
    db.prepare("UPDATE ticket_messages SET deleted=1 WHERE discord_message_id=?").run(d.id);
  }
  function onUpdate(d) {
    if (!d || !d.id || d.content === undefined) return;
    const row = db.prepare("SELECT content FROM ticket_messages WHERE discord_message_id=?").get(d.id);
    if (row && d.content !== row.content) {
      db.prepare("UPDATE ticket_messages SET edited=1, original_content=COALESCE(original_content,content), content=? WHERE discord_message_id=?")
        .run(d.content, d.id);
    }
  }

  // --- Client gateway minimal (heartbeat + reconnexion) ---
  let ws, hb = null, lastSeq = null, acked = true, rec = null;
  const send = (o) => { try { ws.send(JSON.stringify(o)); } catch {} };
  const cleanup = () => { if (hb) clearInterval(hb); hb = null; };
  const reconnect = (ms = 5000) => { clearTimeout(rec); rec = setTimeout(connect, ms); };

  function connect() {
    cleanup();
    ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
    ws.on("message", (raw) => {
      let p; try { p = JSON.parse(raw); } catch { return; }
      const { op, d, s, t } = p;
      if (s != null) lastSeq = s;
      if (op === 10) {
        acked = true;
        hb = setInterval(() => { if (!acked) { try { ws.terminate(); } catch {} return; } acked = false; send({ op: 1, d: lastSeq }); }, d.heartbeat_interval);
        send({ op: 2, d: { token: TOKEN, intents: INTENTS, properties: { os: "linux", browser: "pulseboost", device: "pulseboost" } } });
      } else if (op === 11) { acked = true; }
      else if (op === 7) { try { ws.close(); } catch {} }
      else if (op === 9) { cleanup(); reconnect(2000 + Math.random() * 3000); }
      else if (op === 0) {
        if (t === "READY") { botId = d.user?.id; console.log("[tickets] support DM connecté ✓"); }
        else if (t === "MESSAGE_CREATE") onUserDM(d);
        else if (t === "MESSAGE_DELETE") onDelete(d);
        else if (t === "MESSAGE_UPDATE") onUpdate(d);
      }
    });
    ws.on("close", () => { cleanup(); reconnect(); });
    ws.on("error", (e) => console.error("[tickets] ws:", e.message));
  }
  connect();
}
