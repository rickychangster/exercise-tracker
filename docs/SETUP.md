# Setup Guide

Get your own Exercise Tracker running, connected to a Google Sheet you own.
Three parts: **(1)** the sheet, **(2)** a backend, **(3)** deploy + protect.

---

## 1. Make your sheet

The fastest way is to copy the ready-made template (tabs, headers, sample rows
all set up):

> **📋 [Click here to copy the template sheet →](https://docs.google.com/spreadsheets/d/1UyFSa-XbwTxpOsPBRSQRy8QN2Dmcnp6A2v4HuLQYgoU/copy)**
> This opens Google's "Make a copy" dialog and drops a copy in your Drive.
> Then edit the `config` tab to your own exercises.

Prefer to build it by hand? Create a spreadsheet with **three tabs**
(names lowercase, exact): `config`, `log`, `meta`.

### `config` tab — your exercises (header row required)
Headers (any order — parsed by name): `name`, `minRestDays`, `overdueDays`,
`weeklyOnly`, `unit`, `category`, `active`, `sets`, `reps`, `weight`, `tip`.

Quickest fill: **File → Import →** upload `docs/config-seed.csv` → *Replace
current sheet*. Then edit to taste.

| field | meaning |
|---|---|
| `name` | exercise name (unique) |
| `minRestDays` | warn if logged again sooner than this (`0` = never warn) |
| `overdueDays` | mark **overdue** after this many days |
| `weeklyOnly` | `yes`/`no` — warn if done more than once per 7 days |
| `unit`, `category` | optional; `category` drives the filter chips + emoji |
| `active` | `no` hides it from the app |
| `sets`/`reps`/`weight`/`tip` | recommendation shown on the card |

### `log` tab — keep these headers in this order
`id`, `exercise`, `timestamp`, `date`, `weight`, `reps`, `sets`, `note`.
Leave the rows empty; the app appends.

### `meta` tab — optional personalization
Either layout works (vertical key|value, or headers+values):

| timezone | schemaVersion | displayName |
|---|---|---|
| America/Los_Angeles | 1 | Alex |

`displayName` shows as “Hi Alex 👋”. `timezone` sets your day boundaries.

---

## 2. Pick a backend

### Option A — Apps Script (no Google Cloud) ✅ easiest

> ℹ️ **Community-tested.** This path is newer than the service-account one. If
> you hit a snag, please [open an issue](https://github.com/rickychangster/exercise-tracker/issues)
> with your `/api/health` output — it helps everyone.

1. In your sheet: **Extensions → Apps Script**.
2. Delete the stub, paste all of [`apps-script/Code.gs`](../apps-script/Code.gs), **Save**.
3. *(Optional, recommended)* **Project Settings → Script Properties →** add
   `TOKEN` = a long random string.
4. **Deploy → New deployment → Web app:** *Execute as* **Me**, *Who has access*
   **Anyone** → **Deploy** → authorize → copy the **`/exec` URL**.
5. Set app env vars:
   - `APPS_SCRIPT_URL` = that `/exec` URL
   - `APPS_SCRIPT_TOKEN` = the same `TOKEN` (if you set one)

> "Anyone" means anyone with the unguessable URL can call the script. The
> `TOKEN` + your app's `ACCESS_PASSPHRASE` keep it private.

### Option B — Service account (Google Sheets API)

1. [Google Cloud Console](https://console.cloud.google.com) → create/select a project.
2. **APIs & Services → Library →** enable **Google Sheets API**.
3. **Credentials → Create credentials → Service account** → create (no roles).
4. Open it → **Keys → Add key → Create new key → JSON** → downloads a file.
5. Copy the service account **email** (`…@….iam.gserviceaccount.com`).
6. In your sheet → **Share** → paste that email → **Editor**.
7. Set app env vars:
   - `SHEET_ID` = the id from the sheet URL (a full URL works too)
   - `GOOGLE_SA_KEY` = the JSON key — **paste the raw JSON** (simplest) or its base64

---

## 3. Deploy & protect

1. Push your fork to GitHub, **Import** it in [Vercel](https://vercel.com/new)
   (or use the Deploy button in the README).
2. **Settings → Environment Variables** — add:
   - `ACCESS_PASSPHRASE` = a passphrase (protects the whole app) ← **do this**
   - your backend vars from step 2
   - `APP_TIMEZONE` (optional; the `meta` tab overrides it)
3. **Redeploy** (env vars only apply to new deploys).

### Security
- With `ACCESS_PASSPHRASE` set, every page/API requires the passphrase (stored
  as an httpOnly cookie). Without it, the app is **open to anyone with the URL**.
- Never commit secrets. `.env`, `*.local.csv`, and service-account JSON are
  gitignored. Keep keys in Vercel env vars only.

---

## Verify & troubleshoot

Visit **`/api/health`** (it's behind your passphrase) — it reports which backend
is active and where a connection fails.

Hard-won gotchas:

| Symptom | Cause / fix |
|---|---|
| `GOOGLE_SA_KEY ... not valid JSON` | The base64 got mangled. **Paste the raw JSON** instead, or re-encode with `base64 < key.json \| tr -d '\n'`. |
| `Requested entity was not found` (404) | `SHEET_ID` wrong — you pasted the whole URL with extra junk, or the wrong id. (Full URLs are auto-handled; check for typos.) |
| Dashboard 500, `Invalid time zone` | A `meta` cell was misread. Make sure the `meta` tab has clear `timezone`/`displayName` keys. |
| Exercises missing | Their `active` column is `no` or blank. Set it to `yes`. |
| Apps Script returns `{error: unauthorized}` | `APPS_SCRIPT_TOKEN` doesn't match the script's `TOKEN` property. |
| Everything works but shows sample data | No backend configured — you're in demo mode. Set Option A or B vars and redeploy. |
