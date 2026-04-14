# HealthRhythm Web

Lightweight web MVP for the current HealthRhythm product.

## Stack

- React
- TypeScript
- Vite
- Local browser storage only

## Included in this web MVP

- Rhythm
- Breath
- Today Timeline
- History
- Strength

## Deferred

- Library / Setup system
- Custom routine builder
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

## Production build

```bash
npm run build
```

## Deploy to Vercel

This web app can deploy to Vercel as a static Vite site without extra server code.

### Recommended settings

- Framework preset: `Vite`
- Root directory: `web`
- Build command: `npm run build`
- Output directory: `dist`

### Notes

- No SPA rewrite config is needed right now because navigation is handled inside a single page and does not use URL path routing.
- Local persistence uses browser `localStorage`, so data stays per browser/device and does not sync across devices.
- Mobile browser audio may still require a direct user tap before cue or metronome sounds are allowed to play.
