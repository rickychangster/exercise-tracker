# PRD — Flexible Exercise Tracker

**Status:** Draft v1
**Date:** 2026-06-04

---

## 1. Summary

A personal, phone-first web app (PWA) for logging exercises throughout the
day with full flexibility over *which* exercise is done *when*. The app nudges
the user when an exercise has gone stale (not done in N days) and warns — but
never blocks — when an exercise is repeated with too little rest, or when a
"weekly-preferred" exercise (running, rucking) is done more than once a week.

All data lives in a **Google Sheet** that the user owns, so logs can be edited,
charted, and exported directly in Sheets.

## 2. Goals & Non-Goals

### Goals
- Log an exercise in **< 5 seconds** from a phone.
- Support **multiple sessions per day** (e.g. morning + afternoon).
- Show, at a glance, what's **overdue** and what's **fine to do today**.
- **Warn** (non-blocking) on insufficient rest and on weekly-cadence overuse.
- Keep **Google Sheets as the single source of truth**.
- Make cadence rules **configurable per exercise** without code changes.

### Non-Goals (v1)
- No multi-user accounts / social features. Single user.
- No external notifications (email/push) — warnings are **in-app only**.
- No prescriptive workout *programming* (sets/reps/weight progression). We log
  occurrences and optional notes, not full training plans.
- No native iOS/Android app.
- No offline write queue (best-effort online logging; see Open Questions).

## 3. Personas & Context

**Primary (and only) user:** an individual managing their own varied training.
They do a rotating mix of exercises, sometimes splitting a day into multiple
sessions, and want gentle accountability rather than a rigid program.

Usage moment: standing in the gym, on a trail, or at home — pulls out phone,
opens installed PWA, taps the exercise, done.

## 4. Key Concepts

| Term | Definition |
|------|------------|
| **Exercise** | A named activity (e.g. Squats, Running, Rucking) with its own cadence rules. |
| **Log entry** | A single occurrence of an exercise at a timestamp, optionally with notes / quantity. |
| **Session** | An informal grouping of entries within a day (morning/afternoon). Derived, not a hard entity in v1. |
| **Rest gap** | Days elapsed since the most recent prior log of the same exercise. |
| **Overdue** | An exercise not logged within its `overdueDays` threshold. |
| **Min rest** | Minimum preferred days between sessions of an exercise. |
| **Weekly-only** | An exercise preferred at most once per rolling 7-day window. |

## 5. Functional Requirements

### 5.1 Exercise catalog (config-driven)
- The app reads an **exercise config** from a dedicated tab in the Sheet.
- Each exercise defines: `name`, `minRestDays`, `overdueDays`, `weeklyOnly`,
  and optional `active` flag, `unit`, and `category`.
- Adding/editing an exercise = editing the config tab. No deploy needed.

### 5.2 Logging
- **FR-1:** User can log any active exercise with a single tap; timestamp
  defaults to *now*.
- **FR-2:** User can adjust the timestamp (e.g. log an earlier session) and add
  an optional **note** and optional **quantity** (e.g. distance, reps).
- **FR-3:** Multiple entries for the same exercise on the same day are allowed
  (multi-session support).
- **FR-4:** Each log writes one row to the Sheet's log tab.

### 5.3 Warnings (non-blocking)
- **FR-5 (rest warning):** When logging exercise X, if the gap since X's last
  log is **< `minRestDays`**, show a warning ("Only 1 day of rest since your
  last Squats — proceed?"). User can confirm and log anyway.
- **FR-6 (weekly warning):** When logging an exercise where `weeklyOnly = true`,
  if it was already logged within the past 7 days, warn ("You already ran this
  week"). Non-blocking.
- **FR-7:** Warnings never prevent logging. A confirm/dismiss is the only gate.

### 5.4 Overdue reminders (in-app)
- **FR-8:** The home dashboard surfaces each exercise's **status**:
  - `Overdue` — last log older than `overdueDays` (or never logged).
  - `Due soon` — within 1 day of becoming overdue.
  - `Resting` — logged more recently than `minRestDays` ago.
  - `Ready` — outside min-rest and not overdue.
- **FR-9:** Overdue exercises are visually prominent (badge/sort-to-top) when
  the app is opened. No push/email in v1.

### 5.5 Dashboard & history
- **FR-10:** Home shows all active exercises with: last-done date, days since,
  current status, and a quick-log button.
- **FR-11:** A history view lists recent log entries (newest first), grouped by
  day, showing morning/afternoon sessions.
- **FR-12:** "Open in Google Sheets" link for full editing/charting.

## 6. Cadence Rules — Worked Examples

Config (in Sheet):

| name    | minRestDays | overdueDays | weeklyOnly |
|---------|-------------|-------------|------------|
| Squats  | 1           | 5           | no         |
| Running | 2           | 7           | yes        |
| Rucking | 3           | 7           | yes        |

- **Squats** last done yesterday → logging today triggers **rest warning**
  (gap 1 < minRest... actually gap 1 == minRest, see rule below). Logging the
  *same day* (gap 0) warns.
- **Running** done 3 days ago, again today → allowed silently (gap ≥ minRest),
  but if also run earlier this week → **weekly warning**.
- Any exercise untouched for `overdueDays` → **Overdue** on dashboard.

**Rest-warning rule of record:** warn when `gap < minRestDays`. With
`minRestDays = 1`, logging again the **same calendar day** (gap 0) warns;
the next day (gap 1) does not. This matches "warn if only 1 day of rest" =
"warn when you've rested *less than* the minimum."

## 7. Non-Functional Requirements
- **Performance:** dashboard loads in < 2s on mobile over typical 4G; log write
  acknowledged in < 1.5s.
- **Usability:** core log flow ≤ 2 taps; thumb-reachable controls.
- **Reliability:** a failed Sheet write surfaces a clear retry, never silently
  drops a log.
- **Security/Privacy:** single-user; access gated behind a simple auth (see
  Design). Service-account credentials never shipped to the client.
- **Data ownership:** all data resides in the user's Google Sheet.

## 8. Success Metrics
- Logging friction: time-to-log < 5s (self-observed).
- No missed-but-intended logs due to app errors.
- Overdue exercises get re-engaged (qualitative: the nudge works).

## 9. Assumptions
- Single user, single Google account / Sheet.
- Personal data volume (< ~10k rows) — Sheets is performant enough.
- Phone is online when logging (v1).

## 10. Open Questions
1. **Offline logging:** do we need a write queue for no-signal gym/trail use?
   (Deferred; v1 requires connectivity.)
2. **Time zone:** assume the user's local TZ for "day" boundaries — confirm.
3. **Quantity/units:** is a free-form note enough for v1, or do we need typed
   quantities (km, reps) now? (Design supports optional quantity; UI minimal.)
4. **Auth:** single shared passphrase vs. Google sign-in restricted to the
   owner's email? (Design proposes the latter.)

## 11. Out of Scope / Future
- Push or email reminders.
- Charts/analytics inside the app (use Sheets for now).
- Programmed progressions, supersets, RPE tracking.
- Multi-user / sharing.
