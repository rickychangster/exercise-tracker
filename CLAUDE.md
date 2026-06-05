# CLAUDE.md

Guidance for working in this repo. Read this before making changes.

## What this is

A phone-first **PWA exercise tracker** (Next.js App Router + TypeScript, deploys
on Vercel). A **Google Sheet is the source of truth**. It's an open-source
template others fork to run their own tracker, so keep it generic and easy to
set up. Core product principle: **nudges never block** — overdue/rest/weekly
warnings are advisory only.

## Architecture (and the one rule)

- **Data facade — `src/lib/data.ts`.** Picks a backend provider from env:
  `APPS_SCRIPT_URL` → Apps Script · `SHEET_ID`+`GOOGLE_SA_KEY` → service account
  · neither → mock/demo. **Routes import data functions ONLY from `data.ts`**,
  never from a provider directly. Add a backend = add a provider + a case here.
- **Providers:** `src/lib/sheets.ts` (Google Sheets API, service account),
  `src/lib/appsscript.ts` (calls the `apps-script/Code.gs` web app),
  `src/lib/mock.ts` (in-memory demo data). Keep all three in sync with any
  provider-interface change, including `apps-script/Code.gs`.
- **Pure domain logic (unit-tested):** `src/lib/cadence.ts` (status + warnings)
  and `src/lib/summary.ts` (weekly summary + progress). Calendar-day based,
  timezone-aware. New domain logic goes here with a table-driven test.
- **Auth:** passphrase gate in `src/middleware.ts` (+ `src/app/login`,
  `src/app/api/auth`). `ACCESS_PASSPHRASE` set → gates everything; unset → open.
- **API routes:** `/api/dashboard`, `/api/config`, `/api/precheck`,
  `/api/log` (POST/PATCH/DELETE), `/api/health` (diagnostics, behind the gate).
- **UI:** `src/app/page.tsx` (client) + `globals.css` (fresh-mint light theme).

## Sheet schema (important distinction)

- **`config` tab — parsed by HEADER NAME** (order-independent), so forkers can
  reorder/rename columns. Fields: `name, minRestDays, overdueDays, weeklyOnly,
  unit, category, active, sets, reps, weight, tip`.
- **`log` tab — FIXED column order `A:H`**: `id, exercise, timestamp, date,
  weight, reps, sets, note`. Reads/writes are positional — **do not reorder**.
- **`meta` tab — key/value**, tolerant of vertical OR horizontal layout:
  `timezone, schemaVersion, displayName`.

## Domain rules

`minRestDays` = warn if logged again sooner. `overdueDays` = overdue threshold.
`weeklyOnly` = warn if done >1× in a rolling 7 days. Status ∈
`overdue | dueSoon | resting | ready`. Writes are idempotent on a
client-generated `id` (uuid).

## Commands

```bash
npm run dev      # demo data unless a backend is configured
npm test         # vitest — cadence + summary
npm run build    # also type-checks
```
Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
Vercel auto-deploys on push to `main`; **env-var changes need a redeploy**.

## Gotchas (hard-won — don't relearn these)

- **`GOOGLE_SA_KEY`** accepts raw JSON or base64; `\n` in the key is normalized.
  Most setup failures = mangled base64 → tell users to paste raw JSON.
- **`SHEET_ID`** accepts a full sheet URL (the id is auto-extracted).
- **`meta` timezone is validated** — a bad value silently falls back (it used to
  crash `Intl`). Keep that guard.
- **Verifying sheet contents:** the gviz CSV export *type-guesses* columns and
  **blanks mixed text/number cells** (e.g. a `reps` column with `12` and
  `5 km`) — it's NOT reliable. `htmlview` is a JS shell with no static data.
  Use the **xlsx export** (`/export?format=xlsx`) for ground truth.
- **Provider precedence:** `APPS_SCRIPT_URL` overrides the service account.
  Setting it on a working deployment silently switches the backend.
- **`/api/health`** is the diagnostic of record — it reports the active backend
  and where a connection fails.

## Scope guardrails / non-goals

Personal hobby tracker. **Out of scope:** in-app charts (use Sheets), programmed
progressions/RPE, multi-user/social, blocking the user. Default to the simplest
thing that satisfies the request. See `docs/` (BRIEF, PRD, DESIGN, SETUP).

## Privacy (public repo)

No personal data in the repo — no real emails or health/protocol data; ship a
generic sample. Real data lives only in the owner's private Google Sheet.
`*.local.csv` is gitignored for private configs. Don't reintroduce PII.

---

## Working style

- **Push back before coding, not after.** Surface tradeoffs and simpler alternatives; if the request has multiple readings, name them rather than picking silently. (The maintainer wants consultant pushback, not transcription.)
- **Simplicity first.** Minimum code that solves the asked problem — no speculative abstractions, config, or error handling for impossible states. Respect the product scope guardrails in `docs/DESIGN.md`.
- **Surgical diffs.** Every changed line traces to the request. Don't refactor or reformat adjacent code as a side effect. Remove orphans *your* change created; for pre-existing dead code, mention it — don't delete unasked.
- **Verify against a criterion.** Prefer "write a failing test, then make it pass" over "make it work." Pre-push still: `tsc --noEmit && lint && build`.
