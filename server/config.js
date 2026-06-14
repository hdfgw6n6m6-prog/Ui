// config.js — configuration centrale de PulseBoost (alternative au .env).
//
// Édite simplement les valeurs ci-dessous, puis lance `npm start`.
//
// ⚠️ SÉCURITÉ : si ton dépôt est PUBLIC, ne mets pas de vrais secrets ici
// (SESSION_SECRET, LICENSE_PRIVATE_KEY, tokens, clé Gemini). Sur un dépôt public,
// laisse-les vides et définis-les via les variables d'environnement de ton
// hébergeur : elles ont la PRIORITÉ sur ce fichier (voir l'injection plus bas).

const config = {
  // --- Réseau / hébergeur ---
  PORT: "8787",
  PUBLIC_URL: "http://localhost:8787",      // URL publique (HTTPS en prod) du serveur
  DATA_DIR: "./data",                        // dossier PERSISTANT pour la base SQLite

  // --- Secrets ---
  SESSION_SECRET: "",                         // node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  LICENSE_PRIVATE_KEY: "",                    // npm run keygen (clé PRIVÉE hex)

  // --- IA Gemini ---
  GEMINI_API_KEY: "",
  GEMINI_MODEL: "gemini-2.0-flash",

  // --- Paiement (Stripe) : boutique sur PUBLIC_URL/buy ---
  STRIPE_SECRET_KEY: "",        // sk_live_... (ou sk_test_...)
  STRIPE_WEBHOOK_SECRET: "",    // whsec_... (endpoint webhook : PUBLIC_URL/webhook/stripe)
  CURRENCY: "eur",
  PRICE_WEEKLY: "",             // prix EN CENTIMES (ex: 299 = 2,99€). Vide = plan masqué.
  PRICE_MONTHLY: "",           // ex: 499
  PRICE_QUARTERLY: "",         // ex: 1199
  PRICE_LIFETIME: "",          // ex: 2999

  // --- Panel admin ---
  // Mot de passe du panel web : permet de se connecter SANS Discord OAuth
  // (donc ça marche en http://IP, sans HTTPS). Laisse vide pour utiliser à la
  // place le login Discord (qui, lui, exige du HTTPS).
  ADMIN_PASSWORD: "",

  // --- Discord (OAuth app + bot + effecteur + commandes admin) ---
  DISCORD_CLIENT_ID: "",
  DISCORD_CLIENT_SECRET: "",
  DISCORD_BOT_TOKEN: "",
  DISCORD_GUILD_ID: "",
  DISCORD_PRO_ROLE_ID: "",
  DISCORD_LOG_CHANNEL_ID: "",
  ADMIN_DISCORD_IDS: "",                      // IDs Discord admin, séparés par des virgules
};

// Injecte dans process.env SANS écraser une variable d'environnement déjà définie
// (donc l'env de l'hébergeur reste prioritaire sur ce fichier).
for (const [k, v] of Object.entries(config)) {
  if (v !== "" && v != null && process.env[k] === undefined) process.env[k] = String(v);
}

export default config;
