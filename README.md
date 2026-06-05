# 🏋️ Exercise Tracker

A phone-first PWA for flexibly logging your workouts, with gentle cadence nudges
and **your Google Sheet as the source of truth**. Fork it, point it at your own
sheet, and you have a personal training tracker in minutes — no database, no
backend to run.

- **Flexible** — log any exercise, any time, multiple sessions a day.
- **Gentle, never blocking** — reminds you when something's overdue, warns (but
  never stops you) when you repeat too soon or exceed a weekly-only exercise.
- **Recommendations on tap** — shows your sets/reps/weight + a form cue so you
  don't look it up; prefills your *last* numbers so you know what to beat.
- **Motivation** — a weekly summary and 📈 progress callouts when you beat a lift.
- **Your data** — everything lives in a Google Sheet you own and can chart/edit.
- **Installable** — add to your home screen; light, fast, fun.

> Built with Next.js + TypeScript. Deploys free on Vercel.

## Try it in 30 seconds (demo mode)

No accounts, no setup — runs on sample data out of the box:

```bash
git clone https://github.com/rickychangster/exercise-tracker
cd exercise-tracker
npm install
npm run dev      # http://localhost:3000
```

Logs in demo mode are in-memory (reset on restart). To make it *yours*, connect
a Google Sheet → see **[docs/SETUP.md](docs/SETUP.md)**.

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frickychangster%2Fexercise-tracker&env=ACCESS_PASSPHRASE,APP_TIMEZONE&envDescription=Set%20a%20passphrase%20to%20protect%20your%20tracker.%20Add%20your%20backend%20vars%20after%20deploy.)

Then follow **[docs/SETUP.md](docs/SETUP.md)** to connect your sheet. You pick one
of two backends:

| Backend | Setup effort | Notes |
|---|---|---|
| **Apps Script** (recommended for hobbyists) | Easiest — **no Google Cloud** | Paste one script into your sheet, deploy as a web app, paste the URL. |
| **Service account** (Google Sheets API) | A few Google Cloud steps | More "standard"; good if you already use GCP. |

## Security

By default a fork is reachable by anyone with the URL. Set an **`ACCESS_PASSPHRASE`**
env var and the app gates every page and API behind a passphrase (cookie-based).
Leave it blank only for the local demo. See [docs/SETUP.md](docs/SETUP.md#security).

## How the nudges work

Each exercise in your `config` sheet defines its own cadence:

| field | meaning |
|---|---|
| `minRestDays` | warn if you log it again sooner than this |
| `overdueDays` | flag as **overdue** if not done within this many days |
| `weeklyOnly`  | warn if done more than once in a rolling 7 days (e.g. long runs) |

All warnings are **advisory** — you can always log anyway.

## Scripts

```bash
npm run dev     # local dev (demo data unless a backend is configured)
npm test        # unit tests (cadence engine + weekly summary)
npm run build   # production build
```

## Docs

- [docs/SETUP.md](docs/SETUP.md) — connect your sheet + deploy (start here)
- [docs/BRIEF.md](docs/BRIEF.md) — 1-page product brief
- [docs/PRD.md](docs/PRD.md) · [docs/DESIGN.md](docs/DESIGN.md) — requirements & design

## License

[MIT](LICENSE) — fork it, make it yours.
