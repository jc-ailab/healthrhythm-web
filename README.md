# HealthRhythm Web

Lightweight web MVP for the current HealthRhythm product.

## Stack

- React
- TypeScript
- Vite
- Local browser storage only

## Included

- Rhythm: fixed 180 BPM metronome with timed sessions
- Breath: preset and custom breathing patterns with cue sounds
- Strength: routines with tappable exercises
- Today: daily foundation items (每日基础), quick movement logging (运动), habit actions and a timeline
- History: day, week and month review with navigation and summaries
- Library: habits, exercises, custom routines, and data management (数据与备份: export, import, recovery backups)

## Deferred

- Reminders
- Cloud sync
- Accounts
- Charts or analytics

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

## Checks and production build

```bash
npm run lint
npm test
npm run build
```

## Deploy to Vercel

This web app can deploy to Vercel as a static Vite site without extra server code.

### Recommended settings

- Framework preset: `Vite`
- Root directory: repository root (`package.json` is at the top level)
- Build command: `npm run build`
- Output directory: `dist`

### Notes

- No SPA rewrite config is needed right now because navigation is handled inside a single page and does not use URL path routing.
- Local persistence uses browser `localStorage`, so data stays per browser/device and does not sync across devices.
- Export regularly from Library → 数据与备份. Safari may clear a site's stored data after about 7 days without a visit; a Home Screen web app keeps its own separate storage, so move data there with export and import.
- Mobile browser audio may still require a direct user tap before cue or metronome sounds are allowed to play.
