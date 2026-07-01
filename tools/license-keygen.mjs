#!/usr/bin/env node
/**
 * Generates the Ed25519 key pair used to sign Tyverix license keys.
 *
 *   node tools/license-keygen.mjs
 *
 * Outputs:
 *   - tools/license-private.pem   (KEEP SECRET — used to sign license keys)
 *   - prints the raw 32-byte public key as base64url, to embed in the Rust app
 *     (src-tauri/src/commands/license.rs -> LICENSE_PUBLIC_KEY).
 *
 * Run this ONCE. If you regenerate it, every previously issued key stops working.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const privPath = join(here, "license-private.pem");

if (existsSync(privPath)) {
  console.error(
    "Refusing to overwrite existing tools/license-private.pem.\n" +
      "Delete it first if you really want a new key pair.",
  );
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

writeFileSync(
  privPath,
  privateKey.export({ type: "pkcs8", format: "pem" }),
  { mode: 0o600 },
);

// The raw 32-byte public key lives in the JWK "x" field (base64url).
const jwk = publicKey.export({ format: "jwk" });
console.log("\nLicense key pair generated.");
console.log("Private key saved to: tools/license-private.pem  (keep secret!)\n");
console.log("Embed this public key in src-tauri/src/commands/license.rs:");
console.log("LICENSE_PUBLIC_KEY = \"" + jwk.x + "\"\n");
