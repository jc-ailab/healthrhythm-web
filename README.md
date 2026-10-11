# HealthRhythm Web

Chinese-first personal health routine app. V3 is a local review candidate; records remain in browser storage.

## Stack

- React
- TypeScript
- Vite
- Local browser storage only

## Included

- 今日: compact review dashboard, distinct completed habits/captures, expandable chronological timeline
- 节律: fixed 180 BPM, duration presets, start/pause/resume/end, audio and tab-specific history
- 呼吸: preset/custom patterns, rounds, countdown, phase cues and tab-specific history
- 力量: independent daily core exercises, existing/custom routines, routine prescriptions and temporary exercises
- 习惯: 每日习惯 / 日常运动 / 其他活动; single completion, repeated captures or quick/custom duration
- 历史: daily, weekly and monthly review including custom habits, captures, movement and unique exercise completions
- 管理: a header entry, with the existing habit/exercise/routine editors and 数据与备份
- Phone ordering: accessible up/down buttons, group selection and visibility controls; saved array order persists
- Exercises can be marked 尝试中, assigned to core/multiple routines, and given technique notes and prescriptions

## Deferred

- Reminders
- Cloud sync
- Accounts
- Charts or analytics

## Run locally

```bash
npm ci
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
- Export regularly from 管理 → 数据与备份. Browser storage can be evicted. A preview URL, Safari and a Home Screen app may have separate storage; move a copy with export/import instead of expecting data to appear automatically.
- Mobile browser audio may still require a direct user tap before cue or metronome sounds are allowed to play.

## V3 review handoff — 2026-10-11

Objective: working mobile V3 candidate without changing production or discarding V2 data.

Repository intake: both the parent SwiftUI repository and nested web repository were clean. Local web `main` was 14 commits behind. Fresh fetch confirmed `origin/main = e5a514e` (PR #5 merged). `feature/healthrhythm-v3` starts there; PR #6 (`643c4be`, OPEN at intake) is integrated as local cherry-pick `37c1ee3`, preserving its author and functionality. Neither main branch was merged, and nothing was pushed or deployed.

### Data contract

- Product V2 already used internal schema 3. V3 uses **schema 4**, keeping `health-rhythm-web-v2` and the legacy v1 fallback key.
- Habits add optional `group`, `recordingMode` and `frequency`. Display order is the existing `library.habits` array; IDs remain unchanged. Existing hidden/enabled choices and custom text survive migration. Missing shipped activities are appended; saves never auto-sort an established array.
- Exercises add optional `dailyCore`, `trying` and `foundationId`. The actual source has **four** foundation items: 下腹核心, 腰背稳定, 盆底肌, 脊柱活动. Their original IDs/definitions are reused in the library and bridged to the existing foundation completion maps. No prescriptions were invented; edit them in 管理. Choose which items belong in core with the core toggle.
- Core/routines/temporary additions reference one exercise definition and share one daily completion state. Routine overrides remain separate from library defaults. Temporary lists are view state, cleared when leaving/changing routines; their completed exercise IDs remain in daily records.
- PR #6's `DayRecord.habitEvents` archives capture timestamps, defaults absent older values to `{}`, and preserves them in exports. A habit completed via an old toggle plus new captures counts once as a completed habit/day.
- Before the first stored-schema migration, the original JSON is backed up verbatim and read back. `before-migration` backups are protected from automatic import/restore pruning. Failure to back up/read storage blocks persistence; saves from a newer schema also block persistence.
- Import supports schemas 1–4 and the existing export format version 1; replacement still requires an in-app preview/confirmation and a verified safety copy.
- Shipped text is translated only when a built-in ID's field exactly matches that ID's old shipped text. Custom names/notes are preserved; current-schema user-entered English is also preserved.

### Validation

- `npm run build`: PASS.
- `npm run lint`: PASS.
- `npm test`: **203 tests PASS, 7 files**. Includes PR #6 capture tests, migration/backup/export/import/audio/session tests and 21 V3 regression cases.
- `src/lib/fixtures/v2-save.json` is a synthetic fixture generated from `e5a514e`'s actual defaults, with representative existing sessions, user definitions and routines. It contains no real health data.
- Browser tests used only `http://127.0.0.1:5179`, with synthetic test records. No production localStorage was accessed or cleared.
- All six tabs fit 320px and 430px viewports with document scrollWidth equal to clientWidth; 390px logging/review also checked. Open routine-prescription editing was separately verified at 320px after fixing native-control overflow.
- Browser readback verified: three Mindful Eating captures across refresh/navigation; unique count of one; core partial completion; duration records in Today/History; new habit/exercise persistence; try-out/routine assignment; custom routine creation/order/override persistence; temporary core completion sharing; timeline expand/collapse; habit order/group persistence.
- Browser import of the V2 fixture completed with a safety copy; restoring that copy reproduced the original synthetic captures, core completions, custom definitions and both movement sessions. Export UI showed success; automation could not obtain the downloaded file path. Export/parse/replacement round trips passed in tests.

### Remaining review and release decisions

- Touch drag-and-drop is not implemented; the requested accessible up/down fallback is implemented. Frequency is metadata only. No reminders/targets/cloud sync added.
- Actual iPhone Safari audio, background timer behaviour and saving/reopening exported files need physical-device acceptance. Browser emulation is not that verification.
- Captures discarded by V2 before PR #6 cannot be reconstructed from absent data.
- Dependency installation reported 10 existing audit findings (7 high); the lockfile was unchanged. Review these before a production release. Local Node 23.10.0 is outside Vitest 5's declared engine range even though the checks passed; use a supported Node 24 environment for review/CI.
- Keep V3 exports and the pre-migration backup. **Do not blindly roll back to the old V2 code on a browser holding schema 4**: old loaders are not forward compatible. A rollback must separately preserve V3 records and use an approved compatible data-restoration plan.
- Human decisions: review the four source core items (membership is editable), approve any push/PR/preview, and separately approve main merge/production deployment.

Recommended next step: review the local branch and test on iPhone. After explicit approval, export production V2 data off-device; handle PR #6 first if desired, then rebase V3 on the new main without reapplying its capture patch; rerun build/lint/tests. Push only when approved and create a review PR (which may trigger Vercel preview). Validate a **copy** of the backup on the preview origin. After a separate production approval, merge/deploy the reviewed commit with Vercel root at this web repository, build `npm run build`, output `dist`. Keep the production origin stable so browser records remain accessible.

### iPhone acceptance checklist

1. Save a V2 export to Files before opening the candidate with existing data.
2. Check all six tabs, no sideways scrolling, and core membership/prescriptions in 管理.
3. Capture 正念饮食 three times; switch tabs, refresh, then check History after a day change.
4. Record preset/custom durations, partially complete core, edit/select a routine and try a temporary exercise.
5. Reorder/move/hide habits; add a custom habit/exercise; refresh and verify persistence.
6. Check Rhythm/Breath sound unlock, pause/resume/end and elapsed logging on Safari; save/reopen an export and test importing a copy.

### Exact web files changed from e5a514e (including PR #6)

- `README.md`
- `index.html`
- `src/App.tsx`
- `src/DataBackupSection.tsx`
- `src/ErrorBoundary.tsx`
- `src/lib/backupStore.ts`
- `src/lib/coreActivities.test.ts`
- `src/lib/dataTransfer.test.ts`
- `src/lib/dataTransfer.ts`
- `src/lib/domain.ts`
- `src/lib/fixtures/v2-save.json`
- `src/lib/mindfulEating.test.ts`
- `src/lib/state.test.ts`
- `src/lib/state.ts`
- `src/lib/storageStatus.ts`
- `src/lib/v3.test.ts`
- `src/lib/v3.ts`
- `src/styles.css`
