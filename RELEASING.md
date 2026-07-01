# Operating Tyverix as a product

This guide covers the "business" systems: **auto-updates**, **accounts &
licensing** (Supabase), and the **website** (Vercel). Everything here is real
and works; the only thing left unwired is charging money automatically
(Stripe) — today, Pro is granted by issuing a signed key.

---

## 1. Auto-updates

Tyverix ships with the Tauri updater wired up. The flow:

```
you push a git tag  →  GitHub Actions builds + signs  →  GitHub Release + latest.json
                                                              │
   existing installs poll latest.json on launch  ◄───────────┘
                     │
              offer "Update available" → download → verify signature → install → relaunch
```

### One-time setup — done ✅

This is already configured for **github.com/Bogroliakiraly/tyverix**:

1. ~~Create a GitHub repo and push this project.~~ Done — public repo, `main` branch.
2. ~~Point the updater endpoint + website at the repo.~~ Done in `src-tauri/tauri.conf.json` (`plugins.updater.endpoints`) and `website/i18n.js` (`GITHUB_REPO`).
3. ~~Add two repository secrets.~~ Done — `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set under Settings → Secrets and variables → Actions.
4. The marketing site is deployed via **Vercel**, connected to this GitHub repo — see § 3 below.

> The updater **public** key is already embedded in `tauri.conf.json`. The
> **private** key in `.tauri-keys/` is gitignored — keep it safe. If you lose it,
> existing clients can never be updated again.

> **Note on the Tyverix rebrand:** the Tauri app identifier changed from
> `com.boostforge.app` to `com.tyverix.app`, and the local data folder from
> `%LOCALAPPDATA%\BoostForge` to `%LOCALAPPDATA%\Tyverix`. Existing BoostForge
> installs will **not** silently migrate — uninstall the old app and install
> the new Tyverix build fresh (license keys, sessions and settings reset once).

### Shipping an update

```bash
# bump the version in package.json AND src-tauri/tauri.conf.json (e.g. 0.1.1)
git commit -am "Release 0.1.1"
git tag v0.1.1
git push origin main --tags
```

GitHub Actions builds, signs and publishes the release with `latest.json`.
Every running client picks it up automatically. Also re-copy the freshly built
installer into `website/download/Tyverix-Setup.exe` so the site's direct
download link stays current, then push `main` (Vercel redeploys automatically).

---

## 2. Accounts & licensing

Two things stack together:

- **Offline license keys** — Ed25519-signed tokens verified completely offline
  against the public key embedded in `src-tauri/src/commands/license.rs`.
- **Supabase accounts** — registration is required to use the app (`AuthGate`).
  A **1-day free trial** starts from the account's registration date. Sessions
  persist via `tauri-plugin-store`. Anti-abuse guards (one trial per device, a
  device cap per account) live in `supabase/anti_abuse.sql` — see
  `supabase/README.md` for the full setup (schema, edge function, anti-abuse).

### Issue a key manually (CLI, no account needed)

```bash
node tools/sign-license.mjs --email buyer@example.com --tier pro --days 31
```

This prints a key the customer pastes into **Settings → Subscription**.

### Issue a key from the app (recommended — ties it to the customer's account)

Settings → **Admin · Issue license keys** (only visible when Supabase is
configured): email + number of days → generates and stores the key against
that account, so the customer can sign in and pull it automatically.

### Automating with Stripe (not yet wired up)

1. Create a **Stripe Payment Link** (or Checkout) for a subscription.
2. Put that URL in `website/i18n.js` → `BUY_URL`.
3. Add a Stripe **webhook** on `invoice.paid` that calls the `issue-license`
   edge function (same one the in-app Admin panel calls). On
   `customer.subscription.deleted` you simply stop re-issuing — the key expires
   on its own.

> The private signing key (`tools/license-private.pem`) must live only on your
> server / machine (and as the Supabase edge function's `LICENSE_PRIVATE_KEY`
> secret), never in the app or the repo. It is gitignored.

### Regenerating keys

`node tools/license-keygen.mjs` creates a new pair and prints the public key to
paste into `license.rs` (and update the edge function secret). **Doing this
invalidates every previously issued key.**

---

## 3. Website (Vercel)

A static, trilingual (EN/HU/DE) site in `website/`, deployed via **Vercel**
connected to this GitHub repo:

1. Vercel → **Add New → Project → Import** this GitHub repo.
2. Root Directory: repo root (a committed `vercel.json` at the repo root sets
   `outputDirectory: "website"`, so no manual build/output config is needed —
   Vercel serves the static files directly, no build step).
3. **Domains** → add `tyverix.com` (and `www.tyverix.com`) → Vercel shows the
   DNS records to add.
4. In Namecheap → Domain List → tyverix.com → **Advanced DNS** → add exactly
   the records Vercel showed (typically an `A` record for the apex domain and
   a `CNAME` for `www`).
5. Every push to `main` auto-deploys — no more manual `gh-pages` subtree dance.

Still need to set: `BUY_URL` in `website/i18n.js` once you have a real Stripe
Payment Link — until then the "Get Pro" button leads to the account/registration
page instead.

The "Download" button serves the installer directly from
`website/download/Tyverix-Setup.exe` (re-copy this file after each release —
see § 1).

---

## What you still need to provide

| System        | You provide                                          |
| ------------- | ----------------------------------------------------- |
| Auto-update   | A GitHub repo + the two Actions secrets               |
| Accounts      | A Supabase project (schema.sql, support.sql, anti_abuse.sql, issue-license fn) |
| Domain        | tyverix.com (Namecheap) pointed at Vercel via DNS     |
| Payments      | A Stripe account + Payment Link + webhook (not yet wired) |
| Website host  | Vercel (free tier is enough for a static site)        |

Everything else — signing, verification, the trial, device anti-abuse, the
update UI, the build pipeline — is already implemented.
