// server/discord.js — EXÉCUTEUR Discord, piloté UNIQUEMENT par le panel web.
//
// POINT CLÉ DE SÉCURITÉ :
//  - Ce module n'utilise QUE l'API REST de Discord avec le token du bot.
//  - Il NE se connecte PAS au gateway, n'enregistre AUCUNE commande slash et
//    n'écoute AUCUN message. Conséquence : il est IMPOSSIBLE de lui donner un
//    ordre depuis Discord. Le bot ne fait qu'EXÉCUTER ce que le serveur lui dit,
//    et le serveur n'agit que sur ordre du panel admin (cookie admin requis).
//  - Donc : « le panel exécute via le bot, personne ne commande depuis Discord ». ✔
//
//   Env : DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DISCORD_PRO_ROLE_ID,
//         DISCORD_LOG_CHANNEL_ID (optionnel)

const API = "https://discord.com/api/v10";

async function dapi(path, method = "GET", body) {
  if (!process.env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN manquant");
  const r = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`discord ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/// Envoie un message privé à un utilisateur (ouvre le canal DM puis poste).
export async function dmUser(userId, content) {
  const ch = await dapi("/users/@me/channels", "POST", { recipient_id: userId });
  return dapi(`/channels/${ch.id}/messages`, "POST", { content });
}

/// Attribue le rôle Pro (ou tout rôle) à un membre du serveur.
export async function addRole(userId, roleId = process.env.DISCORD_PRO_ROLE_ID) {
  if (!roleId) return;
  return dapi(`/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`, "PUT");
}

/// Retire un rôle (Pro par défaut).
export async function removeRole(userId, roleId = process.env.DISCORD_PRO_ROLE_ID) {
  if (!roleId) return;
  return dapi(`/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`, "DELETE");
}

/// Poste un message dans le salon de logs (traçabilité côté Discord).
export async function postLog(content) {
  if (!process.env.DISCORD_LOG_CHANNEL_ID) return;
  return dapi(`/channels/${process.env.DISCORD_LOG_CHANNEL_ID}/messages`, "POST", { content }).catch(() => {});
}

/// Best-effort : exécute sans jamais faire planter le flux de licence si Discord répond mal.
export async function safe(fn) {
  try { return await fn(); } catch (e) { console.error("[discord]", e.message); return null; }
}
