# Operating BoostForge as a product

This guide covers the three "business" systems: **auto-updates**, **licensing /
subscriptions**, and the **website**. Everything here is real and works; the
only things you must supply are your own GitHub repo and (for charging money) a
Stripe account.

---

## 1. Auto-updates

BoostForge ships with the Tauri updater wired up. The flow:

```
you push a git tag  →  GitHub Actions builds + signs  →  GitHub Release + latest.json
                                                              │
   existing installs poll latest.json on launch  ◄───────────┘
                     │
              offer "Update available" → download → verify signature → install → relaunch
```

### One-time setup

1. Create a GitHub repo and push this project.
2. Replace **`OWNER/REPO`** in two places with your `user/repo`:
   - `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`
   - `website/i18n.js` → `GITHUB_REPO`
3. Add two repository secrets (Settings → Secrets and variables → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` — paste the contents of `.tauri-keys/boostforge.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password (`boostforge-updates` by default)

> The updater **public** key is already embedded in `tauri.conf.json`. The
> **private** key in `.tauri-keys/` is gitignored — keep it safe. If you lose it,
> existing clients can never be updated again.

### Shipping an update

```bash
# bump the version in package.json AND src-tauri/tauri.conf.json (e.g. 0.1.1)
git commit -am "Release 0.1.1"
git tag v0.1.1
git push origin main --tags
```

GitHub Actions builds, signs and publishes the release with `latest.json`.
Every running client picks it up automatically.

---

## 2. Licensing & subscriptions

License keys are **Ed25519-signed tokens** verified completely offline against
the public key embedded in `src-tauri/src/commands/license.rs`. New users get a
**7-day Pro trial** automatically.

### Issue a key manually

```bash
node tools/sign-license.mjs --email buyer@example.com --tier pro --days 31
```

This prints a key the customer pastes into **Settings → Subscription**. A
monthly subscription is just a 31-day key you re-issue each cycle.

### Automating with Stripe (recommended)

1. Create a **Stripe Payment Link** (or Checkout) for a $5/month subscription.
2. Put that URL in `website/i18n.js` → `BUY_URL`.
3. Add a Stripe **webhook** on `invoice.paid` that runs `sign-license.mjs` and
   emails the key to the customer (any small serverless function works). On
   `customer.subscription.deleted` you simply stop re-issuing — the key expires
   on its own.

> The private signing key (`tools/license-private.pem`) must live only on your
> server / machine, never in the app or the repo. It is gitignored.

### Regenerating keys

`node tools/license-keygen.mjs` creates a new pair and prints the public key to
paste into `license.rs`. **Doing this invalidates every previously issued key.**

---

## 3. Website

A static, trilingual (EN/HU/DE) site in `website/`. Deploy it anywhere; GitHub
Pages is easiest:

1. Push the repo.
2. Settings → Pages → deploy from `main` / `/website` (or copy `website/` to a
   `gh-pages` branch).
3. Update `GITHUB_REPO` and `BUY_URL` in `website/i18n.js`.

The "Download" button points at your GitHub Releases `/latest`, so it always
serves the newest installer.

---

## What you still need to provide

| System        | You provide                                  |
| ------------- | -------------------------------------------- |
| Auto-update   | A GitHub repo + the two Actions secrets      |
| Payments      | A Stripe account + Payment Link + webhook    |
| Website host  | GitHub Pages (free) or any static host       |

Everything else — signing, verification, the trial, the update UI, the build
pipeline — is already implemented.
