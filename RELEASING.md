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

### One-time setup — done ✅

This is already configured for **github.com/Bogroliakiraly/boostforge**:

1. ~~Create a GitHub repo and push this project.~~ Done — public repo, `main` branch.
2. ~~Replace `OWNER/REPO` in two places.~~ Done in `src-tauri/tauri.conf.json` (`plugins.updater.endpoints`) and `website/i18n.js` (`GITHUB_REPO`).
3. ~~Add two repository secrets.~~ Done — `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are set under Settings → Secrets and variables → Actions.
4. The marketing site is published via GitHub Pages from the `gh-pages` branch (root) — see § 3 below for how that branch is kept in sync.

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

A static, trilingual (EN/HU/DE) site, developed in `website/` on `main`. Live at:

**https://bogroliakiraly.github.io/boostforge/**

GitHub Pages only serves from a branch root (not an arbitrary subfolder), so
the published copy lives on a separate **`gh-pages`** branch containing just
that folder's contents. After editing anything under `website/` on `main`,
republish with:

```bash
git subtree split --prefix website -b gh-pages-update
git push origin gh-pages-update:gh-pages --force
git branch -D gh-pages-update
```

Still need to set: `BUY_URL` in `website/i18n.js` once you have a real Stripe
Payment Link — until then the "Get Pro" button explains that purchases aren't
open yet instead of linking somewhere broken.

The "Download" button points at your GitHub Releases `/latest`, so it always
serves the newest installer once you've tagged at least one release.

---

## What you still need to provide

| System        | You provide                                  |
| ------------- | -------------------------------------------- |
| Auto-update   | A GitHub repo + the two Actions secrets      |
| Payments      | A Stripe account + Payment Link + webhook    |
| Website host  | GitHub Pages (free) or any static host       |

Everything else — signing, verification, the trial, the update UI, the build
pipeline — is already implemented.
