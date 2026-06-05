# Design Doc — Flexible Exercise Tracker

**Status:** Draft v1
**Date:** 2026-06-04
**Related:** [PRD.md](./PRD.md)

---

## 1. Overview

A Next.js PWA, deployed on Vercel, that reads and writes a Google Sheet via the
Google Sheets API using a **service account**. The Sheet is the single source
of truth. All cadence logic (overdue, rest warnings, weekly warnings) is
computed server-side from log rows + per-exercise config rows. Reminders are
**in-app only** (no cron, no push, no email in v1).

```
 ┌──────────────┐    HTTPS     ┌─────────────────────┐   Sheets API    ┌──────────────┐
 │  PWA client  │ ───────────► │  Next.js API routes │ ──────────────► │ Google Sheet │
 │ (React, TS)  │ ◄─────────── │  (server, service   │ ◄────────────── │  (truth)     │
 │  next-pwa    │   JSON       │   account creds)    │   rows          │              │
 └──────────────┘              └─────────────────────┘                 └──────────────┘
```

Why this shape: keeping Sheets credentials and all cadence computation on the
server (Next.js route handlers) means the browser never holds Google
credentials, and the client stays a thin, fast UI.

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Next.js (App Router) + TypeScript** | One codebase for UI + API; great Vercel DX. |
| PWA | **next-pwa** (service worker, manifest) | Installable, "Add to Home Screen", asset caching. |
| UI | React + a light component lib (shadcn/ui or plain CSS modules) | Fast mobile UI, thumb-friendly. |
| Data store | **Google Sheets** via `googleapis` | User-owned source of truth (per PRD). |
| Auth (server→Google) | **Service account** (JWT) | No per-request OAuth dance; server-only secret. |
| Auth (user→app) | **NextAuth Google provider**, email allowlist | Only the owner can log in. |
| Hosting | **Vercel** | Free tier, serverless route handlers, env secrets. |
| Caching | In-memory + short revalidate on reads | Sheets API is rate-limited; avoid re-reading per keystroke. |

## 3. Google Sheet Schema

One spreadsheet, three tabs.

### Tab `config` — exercise definitions
| Column | Type | Notes |
|--------|------|-------|
| `name` | string | Unique exercise name (primary key). |
| `minRestDays` | int | Warn when gap < this. |
| `overdueDays` | int | Overdue when days-since > this. |
| `weeklyOnly` | bool (`yes`/`no`) | Warn if logged again within 7 days. |
| `unit` | string (optional) | e.g. `km`, `reps`, blank. |
| `category` | string (optional) | For grouping/sort. |
| `active` | bool | Hidden from logging UI when `no`. |

Example:
```
name     minRestDays overdueDays weeklyOnly unit category active
Squats   1           5           no              strength yes
Running  2           7           yes        km   cardio   yes
Rucking  3           7           yes        km   cardio   yes
```

### Tab `log` — append-only occurrences
| Column | Type | Notes |
|--------|------|-------|
| `id` | string (uuid) | Generated server-side; enables idempotent retry. |
| `exercise` | string | FK → `config.name`. |
| `timestamp` | ISO 8601 | Local-aware; default now, user-editable. |
| `date` | `YYYY-MM-DD` | Denormalized local day for fast grouping. |
| `quantity` | number (optional) | In the exercise's `unit`. |
| `note` | string (optional) | Free text. |

Append-only: edits/deletes are done by the user in Sheets directly if needed.

### Tab `meta` (optional)
Single row: `timezone`, `schemaVersion`. Lets day-boundary logic and migrations
be data-driven.

## 4. Cadence Engine

Pure function, server-side, unit-testable. Input: today (in user TZ), exercise
config, that exercise's sorted log timestamps. Output: status + warnings.

```ts
type Status = 'overdue' | 'dueSoon' | 'resting' | 'ready';

interface ExerciseState {
  exercise: string;
  lastDone: string | null;   // ISO, or null if never
  daysSince: number | null;
  status: Status;
}

// Computed at LOG time (pre-write check):
interface LogWarnings {
  restWarning: boolean;   // gap < minRestDays
  weeklyWarning: boolean; // weeklyOnly && logged within trailing 7 days
}
```

**Status derivation (dashboard):**
```
daysSince = floor( (startOfToday - startOfDay(lastDone)) / 1 day )   // calendar days
if lastDone == null            -> overdue
else if daysSince >  overdueDays      -> overdue
else if daysSince >= overdueDays - 1  -> dueSoon
else if daysSince <  minRestDays      -> resting
else                                  -> ready
```

**Warnings (at log time):**
```
gap = daysSince of most recent prior log (calendar days)
restWarning   = gap < minRestDays
weeklyWarning = weeklyOnly && (any prior log within trailing 7 calendar days)
```

Day boundaries use the `meta.timezone` (default: device/local). All comparisons
are on **calendar day** count, matching the PRD's "days of rest" wording.

Edge cases:
- **First-ever log:** no warnings; status was `overdue` (never done).
- **Multiple same-day logs:** gap = 0 → `restWarning` true when `minRestDays ≥ 1`
  (this is the "done already with only 1 day of rest" nudge). Still allowed.
- **Backdated log:** recompute against the inserted timestamp's neighbors.

## 5. API Surface (Next.js Route Handlers)

All under `/api`, all server-side, all require an authenticated owner session.

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/dashboard` | Returns each active exercise + computed `ExerciseState`. |
| `POST` | `/api/log` | Body: `{exercise, timestamp?, quantity?, note?, id?}`. Returns warnings + written row. Idempotent on `id`. |
| `GET` | `/api/precheck?exercise=&timestamp=` | Returns `LogWarnings` *before* writing, to drive the confirm dialog. |
| `GET` | `/api/history?days=14` | Recent log entries grouped by day. |
| `GET` | `/api/config` | Exercise catalog (for the log picker). |

**Logging flow (client):**
1. Tap exercise → client calls `/api/precheck`.
2. If warnings, show confirm dialog ("Only 1 day rest — log anyway?").
3. On confirm (or no warnings) → `POST /api/log` with a client-generated `id`.
4. Optimistic UI update; reconcile with response.

`precheck` + `log` both recompute from fresh data server-side; `precheck` is
advisory UX only — `log` is authoritative and re-evaluates (but never blocks).

## 6. Caching & Rate Limits

Google Sheets API has per-minute read/write quotas. Mitigations:
- Server caches the `log` and `config` reads for a short TTL (e.g. 30s) in
  module memory; invalidate on successful write.
- `precheck` reuses the cached snapshot — no extra read per keystroke.
- Writes are single `append` calls (one row), the cheapest write op.

For single-user volume this stays well within free quotas.

## 7. Auth & Security

- **User auth:** NextAuth with Google provider; `signIn` callback rejects any
  email not equal to the owner's allowlisted address. Session = HTTP-only cookie.
- **Sheets auth:** service account JSON in Vercel env (`GOOGLE_SA_KEY`,
  base64). The Sheet is *shared* with the service account's email as editor.
- Secrets never reach the client bundle (used only in route handlers).
- No PII beyond exercise logs; data stays in the user's Sheet.

Env vars:
```
GOOGLE_SA_KEY=<base64 service-account json>
SHEET_ID=<spreadsheet id>
NEXTAUTH_SECRET=...
ALLOWED_EMAIL=you@example.com
```

## 8. PWA / Offline Posture (v1)

- Installable via manifest + service worker (next-pwa).
- **App shell cached** for instant open; **API responses not** trusted offline
  in v1 (logging requires connectivity per PRD).
- A failed write shows a retry toast (idempotent via `id`, so retry is safe).
- *Future:* IndexedDB write queue that flushes when back online.

## 9. UI Sketch

```
┌─────────────────────────────┐
│  Today          Wed Jun 4   │
│  ▸ Overdue (2)              │   ← sorted to top, red
│   ● Running   8d ago  [LOG] │
│   ● Pushups   6d ago  [LOG] │
│  ▸ Ready                    │
│   ○ Squats    2d ago  [LOG] │
│  ▸ Resting                  │
│   · Deadlift  1d ago  [LOG] │   ← dim; LOG still works (warns)
│                             │
│  [ History ]  [ Sheet ↗ ]   │
└─────────────────────────────┘

Tap [LOG] on Deadlift →
┌─────────────────────────────┐
│ ⚠ Only 1 day of rest since   │
│   your last Deadlift.        │
│   Log it anyway?             │
│        [Cancel] [Log anyway] │
└─────────────────────────────┘
```

## 10. Testing

- **Unit:** cadence engine — table-driven tests over the worked examples in the
  PRD (gap 0/1/2, never-done, weekly boundary at 6/7/8 days, overdue at
  overdueDays ± 1).
- **Integration:** API routes against a stubbed Sheets client.
- **Manual:** install PWA on phone; log multi-session day; verify warnings
  appear and never block; confirm rows land in the Sheet.

## 11. Build Plan (phased)

1. **Sheet + service account** setup; `config`/`log`/`meta` tabs; share to SA.
2. **Read path:** `/api/config`, `/api/dashboard`, cadence engine + tests.
3. **Write path:** `/api/precheck`, `/api/log` with idempotent append.
4. **UI:** dashboard with status grouping, quick-log, confirm dialog.
5. **History** view + "Open in Sheets" link.
6. **Auth** (NextAuth + email allowlist) and **PWA** (manifest, SW, icons).
7. **Deploy** to Vercel; install on phone; manual test pass.

## 12. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Sheets API rate limits / latency | Short-TTL cache; single-row appends; single user. |
| Day-boundary / TZ bugs | Centralize in cadence engine; drive TZ from `meta`; unit tests. |
| Duplicate logs on retry | Client-generated `id`; server append is idempotent on `id`. |
| Service-account key leak | Server-only env; never bundled; rotate if exposed. |
| Sheets schema drift (user edits) | `schemaVersion` in `meta`; defensive parsing with clear errors. |

## 13. Deferred (post-v1)
- Offline write queue (IndexedDB) + background sync.
- Push/email reminders (would require a scheduled job — e.g. Vercel Cron).
- In-app charts; typed quantity inputs per `unit`.
- Multi-user.
