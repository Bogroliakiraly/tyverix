#!/usr/bin/env node
/**
 * Issues a signed BoostForge license key.
 *
 *   node tools/sign-license.mjs --email user@example.com --tier pro --days 31
 *
 * Flags:
 *   --email  buyer's email (bound into the key)
 *   --tier   "pro" (default) — the paid tier
 *   --days   validity in days from today (default 31 = one monthly cycle)
 *
 * For a monthly subscription you re-issue a new key each cycle (e.g. driven by
 * your Stripe webhook calling this script). The app validates the expiry date
 * fully offline against the embedded public key.
 */
import { sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const email = arg("email", null);
if (!email) {
  console.error("Missing --email");
  process.exit(1);
}
const tier = arg("tier", "pro");
const days = parseInt(arg("days", "31"), 10);

const now = new Date();
const expires = new Date(now.getTime() + days * 86400_000);

const payload = {
  id: randomUUID(),
  email,
  tier,
  issued: now.toISOString().slice(0, 10),
  expires: expires.toISOString().slice(0, 10),
};

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const payloadB64 = b64url(JSON.stringify(payload));
const privateKey = readFileSync(join(here, "license-private.pem"));
// Ed25519: pass null as the algorithm; sign the payload segment bytes.
const signature = sign(null, Buffer.from(payloadB64), privateKey);
const key = `${payloadB64}.${b64url(signature)}`;

console.log("\nLicense issued for", email, `(${tier}, expires ${payload.expires})\n`);
console.log(key + "\n");
