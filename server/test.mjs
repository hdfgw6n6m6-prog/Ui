// test.mjs — test d'intégration auto-suffisant : lance le serveur, exerce TOUS
// les endpoints (admin + client) avec assertions, puis nettoie.   Lancer : npm test
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const SS = "test_" + crypto.randomBytes(8).toString("hex");
const DATA_DIR = path.join(os.tmpdir(), "pb-test-" + Date.now());
const PRIV = crypto.generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("hex");

let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { console.log("  ✓ " + l); pass++; } else { console.log("  ✗ " + l); fail++; } };
const appSession = (id, name) => {
  const body = Buffer.from(JSON.stringify({ kind: "app", id, name, exp: Date.now() + 3600000 })).toString("base64url");
  return body + "." + crypto.createHmac("sha256", SS).update(body).digest("base64url");
};
const jpost = (p, b, c) => fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json", ...(c ? { Cookie: c } : {}) }, body: JSON.stringify(b) });
const jget = (p, c) => fetch(BASE + p, { headers: c ? { Cookie: c } : {} });

const env = { ...process.env, SESSION_SECRET: SS, ADMIN_PASSWORD: "adminpw", PORT: String(PORT), DATA_DIR, LICENSE_PRIVATE_KEY: PRIV, DISCORD_BOT_TOKEN: "", GEMINI_API_KEY: "" };
fs.rmSync(DATA_DIR, { recursive: true, force: true });
const srv = spawn("node", ["server.js"], { cwd: __dirname, env });
srv.stderr.on("data", (d) => process.stderr.write(d));

async function run() {
  console.log("=== ADMIN (mot de passe) ===");
  const auth = await fetch(BASE + "/admin/auth", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "password=adminpw", redirect: "manual" });
  const cookie = (auth.headers.get("set-cookie") || "").split(";")[0];
  ok(auth.status === 302 && cookie.startsWith("pb_admin="), "login -> cookie");
  ok((await jget("/admin/api/stats")).status === 401, "sans cookie -> 401");
  ok((await fetch(BASE + "/panel", { redirect: "manual" })).status === 302, "/panel non connecté -> redirige");
  const panelHtml = await (await jget("/panel", cookie)).text();
  ok(/\.hide\{display:none!important\}/.test(panelHtml), "panel: .hide est prioritaire (modale cachée par défaut)");
  ok(panelHtml.includes('id="modal" class="modal hide"'), "panel: modale masquée au départ");

  console.log("=== CLÉS ===");
  const st = await (await jget("/admin/api/stats", cookie)).json();
  ok(typeof st.keys === "number", "stats champs");
  const gen = await (await jpost("/admin/api/keys", { plan: "monthly", qty: 2 }, cookie)).json();
  ok(gen.keys?.length === 2 && /^PB-/.test(gen.keys[0]), "génère 2 clés");
  const life = await (await jpost("/admin/api/keys", { plan: "lifetime", qty: 1 }, cookie)).json();
  const allKeys = await (await jget("/admin/api/keys", cookie)).json();
  ok(allKeys.length === 3, "liste 3 clés");
  ok(allKeys.find((k) => k.key === life.keys[0])?.days === 0, "lifetime -> days=0");

  console.log("=== ANALYTICS / CHURN / LOGS / ALERTES / FLAGS / BLACKLIST ===");
  const an = await (await jget("/admin/api/analytics", cookie)).json();
  ok(an && "dau" in an && Array.isArray(an.planMix), "analytics structuré");
  const ch = await (await jget("/admin/api/churn", cookie)).json();
  ok(ch && Array.isArray(ch.expiring) && Array.isArray(ch.reasons), "churn structuré");
  ok(Array.isArray(await (await jget("/admin/api/logs", cookie)).json()), "logs = tableau");
  ok(Array.isArray(await (await jget("/admin/api/alerts", cookie)).json()), "alertes = tableau");
  const flags = await (await jget("/admin/api/flags", cookie)).json();
  ok(flags.length >= 4 && flags.some((f) => f.name === "ai_chat"), "flags seedés");
  await jpost("/admin/api/flags", { name: "ai_chat", enabled: 0, scope: "pro" }, cookie);
  ok((await (await jget("/admin/api/flags", cookie)).json()).find((f) => f.name === "ai_chat").enabled === 0, "flag désactivable");
  await jpost("/admin/api/flags", { name: "ai_chat", enabled: 1, scope: "pro" }, cookie);
  await jpost("/admin/api/blacklist", { hwid: "deadbeefcafe", reason: "test" }, cookie);
  ok((await (await jget("/admin/api/blacklist", cookie)).json()).some((b) => b.hwid === "deadbeefcafe"), "blacklist add");
  ok((await (await jpost("/admin/api/unblacklist", { hwid: "deadbeefcafe" }, cookie)).json()).removed === 1, "blacklist remove");

  console.log("=== CLIENT (redeem / entitlement / telemetry / churn) ===");
  const sess = appSession("111", "Tester");
  const freeKey = gen.keys[1];
  ok((await (await jpost("/v1/redeem", { session: sess, key: freeKey })).json()).ok === true, "redeem");
  ok((await jpost("/v1/redeem", { session: appSession("222", "Autre"), key: freeKey })).status === 403, "anti-partage de clé");
  const ent = await (await jpost("/v1/entitlement", { session: sess, hwid: "hw111" })).json();
  ok(ent.pro === true && typeof ent.token === "string" && ent.token.includes("."), "entitlement pro + token signé");
  ok((await (await jpost("/v1/telemetry", { session: sess, hwid: "hw111", events: [{ type: "scan" }], snapshot: { score: 80, hw: { cpu: { name: "X" } } } })).json()).ok === true, "telemetry");
  ok((await (await jpost("/v1/churn_feedback", { session: sess, reason: "Trop cher", comment: "<b>x</b>" })).json()).ok === true, "churn_feedback");
  ok((await jpost("/v1/entitlement", { session: "forged.token", hwid: "x" })).status === 401, "session forgée -> 401");

  console.log("=== FICHE UTILISATEUR + ACTIONS ===");
  const db = new Database(path.join(DATA_DIR, "pulseboost.db"));
  db.prepare("INSERT OR IGNORE INTO users (discord_id,username,email,email_verified,last_login) VALUES (?,?,?,1,datetime('now'))").run("111", "Tester", "tester@example.com");
  db.close();
  ok((await (await jget("/admin/api/users", cookie)).json()).some((u) => u.discord_id === "111"), "utilisateur listé");
  const ud = await (await jget("/admin/api/user?discord_id=111", cookie)).json();
  ok(ud.user && ud.usage && ud.avatar && Array.isArray(ud.connections) && Array.isArray(ud.ips), "fiche complète");
  ok(ud.devices.some((d) => d.hwid === "hw111"), "appareil (entitlement)");
  ok(ud.snapshot?.score === 80, "snapshot (telemetry)");
  const mem = await (await jget("/admin/api/members", cookie)).json();
  ok(mem && Array.isArray(mem.members) && "total" in mem && "configured" in mem, "membres serveur: endpoint OK");
  ok(ud.user.email === "tester@example.com", "fiche: email présent");
  const emails = await (await jget("/admin/api/emails", cookie)).json();
  ok(emails.some((e) => e.discord_id === "111" && e.email === "tester@example.com"), "export emails: collecté et listé");
  ok((await (await jpost("/admin/api/ban", { discord_id: "111", banned: 1 }, cookie)).json()).ok === true, "ban");
  ok((await jpost("/v1/entitlement", { session: sess, hwid: "hw111" })).status === 403, "banni -> entitlement 403");
  await jpost("/admin/api/ban", { discord_id: "111", banned: 0 }, cookie);
  ok((await (await jpost("/admin/api/command", { discord_id: "111", type: "alert", payload: "hi" }, cookie)).json()).queued === true, "commande admin");
  ok("sent" in (await (await jpost("/admin/api/dm", { discord_id: "111", message: "t" }, cookie)).json()), "dm endpoint");

  console.log("=== OPTIONS (annonce / réglages / cadeau Pro / RGPD / broadcast) ===");
  const ann = await (await jget("/v1/announcement")).json();
  ok(ann && "message" in ann && "version" in ann && "download_url" in ann, "annonce publique");
  await jpost("/admin/api/settings", { announcement: "Promo!", latest_version: "1.0.0", download_url: "https://x/y" }, cookie);
  const set2 = await (await jget("/admin/api/settings", cookie)).json();
  ok(set2.announcement === "Promo!" && set2.latest_version === "1.0.0", "réglages enregistrés");
  ok((await (await jget("/v1/announcement")).json()).message === "Promo!", "annonce propagée");
  const gr = await (await jpost("/admin/api/grant", { discord_id: "111", plan: "monthly" }, cookie)).json();
  ok(gr.ok === true && /^PB-/.test(gr.key), "grant -> clé Pro offerte");
  ok((await (await jpost("/admin/api/forget_email", { discord_id: "111" }, cookie)).json()).ok === true, "RGPD: forget_email");
  ok((await (await jget("/admin/api/user?discord_id=111", cookie)).json()).user.email === null, "email effacé");
  ok((await (await jpost("/admin/api/broadcast", { message: "Coucou", channel: "app" }, cookie)).json()).count >= 1, "broadcast in-app");

  console.log("=== IA sans clé Gemini (échec propre) ===");
  ok([502, 403].includes((await jpost("/v1/analyze", { session: sess, hwid: "hw111", scan: { cpu: {} }, locale: "fr" })).status), "analyze -> 502/403");
  ok([502, 403].includes((await jpost("/v1/chat", { session: sess, hwid: "hw111", messages: [{ role: "user", content: "hi" }] })).status), "chat -> 502/403");
}

// Attendre que le serveur soit prêt, lancer, nettoyer.
const ready = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error("démarrage serveur trop long")), 10000);
  srv.stdout.on("data", (d) => { if (String(d).includes("server pret")) { clearTimeout(t); res(); } });
});
try {
  await ready;
  await run();
  console.log(`\n=== RÉSULTAT : ${pass} OK, ${fail} échec(s) ===`);
} catch (e) {
  console.error("ERREUR test:", e.message); fail++;
} finally {
  srv.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}
