// keygen.js — à exécuter UNE SEULE FOIS : node keygen.js
// Génère la paire Ed25519. La clé privée reste sur le serveur (env),
// la clé publique est embarquée dans le binaire Rust (elle peut être publique).
import crypto from "node:crypto";
const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const pub = publicKey.export({ format: "der", type: "spki" }).subarray(-32); // 32 octets bruts
const priv = privateKey.export({ format: "der", type: "pkcs8" });
console.log("LICENSE_PRIVATE_KEY (env serveur, NE JAMAIS COMMIT) :");
console.log(priv.toString("hex"));
console.log("\nVERIFY_KEY_HEX (à coller dans src-tauri/src/license.rs) :");
console.log(pub.toString("hex"));
