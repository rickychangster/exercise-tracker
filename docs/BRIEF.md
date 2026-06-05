# Product Brief — Flexible Exercise Tracker (1-pager)

**Date:** 2026-06-04 · **Related:** [PRD.md](./PRD.md), [DESIGN.md](./DESIGN.md)

---

## The ask (in the user's words)
> An online exercise tracker. Given a set of exercises, stay flexible about which
> one I do today — possibly across multiple sessions (morning + afternoon).
> Remind me if I haven't done an exercise in **5 days**. Warn (don't block) if I
> do one with only **1 day of rest**. Some exercises (running, rucking) are
> preferably **once a week** — warn, don't block. Save everything to a **Google
> Sheet**.

## The problem
Rigid workout apps prescribe *what* to do *when*. This user rotates a varied mix
on their own schedule and wants **gentle accountability, not a program** —
nudges when something goes stale, soft warnings when they overdo it, and zero
hard blocks. They also want to **own their data** in a Google Sheet they can
edit and chart directly.

## What we're building
A phone-first **PWA** to log any exercise in under 5 seconds, multiple times a
day. A home dashboard shows what's **overdue**, **resting**, or **ready**. At log
time, non-blocking warnings fire for insufficient rest or weekly-cadence overuse.
**Cadence rules are configured per exercise** in the Sheet, which is the single
source of truth.

## Key decisions — why / why not

| Decision | Why | Why not the alternative |
|---|---|---|
| **Mobile PWA** | Logging happens at the gym/trail; installable, one codebase, no app store. | Native = real push + more build/store overhead, not needed for in-app-only reminders. Desktop-only = wrong moment-of-use. |
| **In-app reminders only** | Simplest reliable build; warnings naturally belong at log time; no notification infra. | Email/push need a scheduled job + permissions; deferrable until the core loop proves useful. |
| **Google Sheet as source of truth** | User owns/edits/charts data directly; zero DB infra; fits personal scale. | A real DB is faster/robust but adds infra and a sync layer the user explicitly didn't ask for. |
| **Per-exercise rule config** | Running/rucking (weekly) differ from squats (daily-ish); thresholds live in the Sheet, no redeploys. | Global rules are simpler but can't express the user's own running/rucking exception. |
| **Next.js + Sheets API on Vercel** | Strong PWA support, free hosting, keeps Google credentials + cadence logic server-side. | Apps Script avoids hosting but has clunky dev and a weaker PWA story. |

## Cadence logic (the heart)
- **Overdue:** not logged within an exercise's `overdueDays` (default 5; 7 for running/rucking).
- **Rest warning:** logging again when `gap < minRestDays` — same-day re-log warns, fully allowed.
- **Weekly warning:** `weeklyOnly` exercises logged again within a trailing 7 days.
- **Never blocks** — a confirm dialog is the only gate.

## Assumptions
Single user, single Google account/Sheet · personal data volume (Sheets is fast
enough) · online when logging (v1) · user's local time zone defines "a day."

## Open questions
1. Offline logging needed for no-signal gyms/trails? (deferred to v1.1)
2. Confirm local time zone for day boundaries.
3. Free-form notes enough for v1, or typed quantities (km/reps) now?
4. Auth: Google sign-in locked to owner email (proposed) vs. shared passphrase?

## Out of scope (v1)
Push/email reminders · in-app charts (use Sheets) · programmed progressions
(sets/reps/RPE) · multi-user/social.

## Success looks like
Log in < 5s · overdue nudges actually pull stale exercises back into rotation ·
no intended log ever lost to an app error · all data living in the user's Sheet.
