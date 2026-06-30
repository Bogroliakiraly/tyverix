// BoostForge — admin-only license issuer (Supabase Edge Function, Deno).
//
// Mints an Ed25519-signed Pro key (identical format to tools/sign-license.mjs),
// stores it in the `licenses` table via the service-role key, and returns it.
// The signing private key lives only in this function's secrets, so it never
// ships in the desktop app or the website.
//
// Deploy:   supabase functions deploy issue-license --no-verify-jwt
// Secrets:  supabase secrets set ADMIN_TOKEN=...  LICENSE_PRIVATE_KEY="$(cat tools/license-private.pem)"
//           (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.)
//
// Request:  POST { email, days, tier? }  with header  x-admin-token: <ADMIN_TOKEN>
// Response: { key, email, tier, issued, expires, days }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

async function signKey(payload: Record<string, string>): Promise<string> {
  const pem = Deno.env.get("LICENSE_PRIVATE_KEY");
  if (!pem) throw new Error("LICENSE_PRIVATE_KEY secret is not set");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(pem),
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const enc = new TextEncoder();
  const payloadB64 = b64url(enc.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "Ed25519" }, key, enc.encode(payloadB64)),
  );
  return `${payloadB64}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // --- Admin auth ----------------------------------------------------------
  const adminToken = Deno.env.get("ADMIN_TOKEN");
  if (!adminToken) return json({ error: "Server not configured (ADMIN_TOKEN)" }, 500);
  if (req.headers.get("x-admin-token") !== adminToken) {
    return json({ error: "Unauthorized" }, 401);
  }

  // --- Input ---------------------------------------------------------------
  let body: { email?: string; days?: number; tier?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const email = (body.email ?? "").trim().toLowerCase();
  const days = Math.floor(Number(body.days));
  const tier = (body.tier ?? "pro").trim() || "pro";
  if (!email || !email.includes("@")) return json({ error: "Valid email required" }, 400);
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    return json({ error: "days must be between 1 and 3650" }, 400);
  }

  // --- Build + sign --------------------------------------------------------
  const now = new Date();
  const issued = now.toISOString().slice(0, 10);
  const expires = new Date(now.getTime() + days * 86400_000).toISOString().slice(0, 10);
  const payload = { id: crypto.randomUUID(), email, tier, issued, expires };

  let licenseKey: string;
  try {
    licenseKey = await signKey(payload);
  } catch (e) {
    return json({ error: `Signing failed: ${e instanceof Error ? e.message : e}` }, 500);
  }

  // --- Persist (service role bypasses RLS) ---------------------------------
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { error } = await supabase.from("licenses").insert({
    email,
    tier,
    license_key: licenseKey,
    issued,
    expires,
    days,
  });
  if (error) return json({ error: `Could not store license: ${error.message}` }, 500);

  return json({ key: licenseKey, email, tier, issued, expires, days });
});
