# HealthRhythm Web

Chinese-first personal health routine app. V3.1 is a local incremental candidate based on the V3 Preview commit `0bb80db`; records remain in browser storage.

## V3.1 local candidate — Domino, backdating and notes

This branch extends V3 without changing its six-tab architecture. No V3.1 push, PR update or deployment has been performed. Draft PR #7 and open PR #6 remain unchanged.

- 晨间多米诺: 虔信时刻 → 晨习 → 无压 → 金刚功, with independent completions and live progress. 金刚功 reuses `jingang` and its existing preset/custom duration mechanism; its session appears once in the timeline and counts once in movement statistics.
- 睡前多米诺: 断网 → 洗漱 → 泡脚 → 睡前轻阅读 → 早睡. 泡脚/早睡 reuse `foot-soak`/`earlySleep`. Tuesday morning's review has occurrence date Monday and assigned date Tuesday, with unknown occurrence time and Tuesday's actual recording timestamp. Choosing an earlier review date derives its preceding night in the same way.
- Habit shows compact collapsible modules, then 日常习惯 and 其他运动. Existing normal single/multiple capture and duration behavior remains available; fallback ordering/visibility controls are retained. Management adds modules, edits names/date rules/visibility, reorders blocks/items, removes memberships and moves existing activities into a block. An activity has one current presentation home. Definitions/history are never deleted by membership changes.
- Expanded Today/History timeline rows expose 编辑记录 / 添加备注. Occurrence date, optional local time, exact/approximate/unknown precision, assigned statistics date, movement duration and optional note can be corrected. IDs and original recording timestamps are retained. Moving a single completion into a day already holding that completion is refused rather than silently merging records. Rhythm/Breath measured durations remain intact; their dates/times/notes can be corrected.
- ＋ 今日随记 stays collapsed until requested. Notes are associated with the selected local date, are editable in the timeline and survive refresh/history/export/import. No mood scales, photos, tags or interpretation are added.

### Schema 5 and preservation

Canonical storage and locking remain `health-rhythm-web-v3` and the existing origin-scoped Web Lock. V2/v1 keys are never written or deleted. Schema 4 is upgraded only after source validation and an independently verified verbatim `before-migration` backup, followed by canonical write/read-back validation. Any failure disables recording. Existing schema 5 is authoritative; corrupt data never triggers replacement from V2. Import supports schemas 1–5; JSON export format stays version 1. No dependency changes are included.

New fields:

- `library.dominoBlocks`: stable block IDs, names, ordered habit/activity IDs, assignment rule and hidden flag.
- Optional `captureIds` alongside existing timestamp arrays, in Today/day records: assigns stable IDs to legacy captures once and preserves those IDs when an entry moves between dates. Original capture timestamps are not rewritten. Existing habit/exercise/movement/session IDs remain unchanged.
- Optional `recordDetails` keyed by timeline record ID: `occurredDate`, nullable `occurredTime`, `precision`, `assignedDate`, `recordedAt` and optional `note`. Dates/times are local calendar values, not fabricated ISO instants. `recordedAt` is actual capture time for new logs; it can be null for older timed sessions whose recording moment was never stored. New completed timers separately record their actual observation time.
- Optional `journals`: stable entry ID, text and original recording timestamp.
- Optional `dominoSnapshots`: day-level grouping definitions captured on the first module log. History uses these snapshots, not current memberships/names/rules, to report historical progress. Existing V3 history is not retroactively assigned new module snapshots.

Default module seeding happens once when definitions are absent; an intentionally empty block array, custom block order and hidden preferences persist. Known existing stable IDs are reused. Custom items that merely share a display name are preserved and not automatically guessed. A conflicting reserved new ID without matching built-in provenance gets a deterministic suffixed default ID; the original remains intact. Use 管理模块 to select the preferred existing item and remove the unused default membership, then hide the unused definition if desired. User-customized names and pre-existing habit/exercise/routine ordering are retained.

Date arithmetic uses local calendar noon plus `setDate`, never a 24-hour ISO subtraction. This supports Sydney DST transitions and month/year/leap-year boundaries. Backdated morning logs also default to unknown occurrence time; today's clock is not copied into a past activity. Approximate times remain marked 约. Date-only bedtime rows say 昨晚 · 时间未指定; data-entry time is secondary and explicitly labeled. Legacy habit/movement/strength timestamps are shown as 录入 times, not silently promoted to measured occurrence times. Old Rhythm/Breath session start times remain measured occurrence times.

Validation rejects invalid extensions, duplicate capture IDs, dangling metadata and inconsistent current-day history mirrors before synchronization could discard records. Single completions, foundation completions and the existing strength aggregate retain their original scoped timeline IDs. Multi-captures gain explicit stable IDs because V3's transient array-index row IDs were not persistent event identities.

Real `0bb80db` regressions demonstrate that an already-open V3 writer fails its snapshot comparison after migration and a freshly opened V3 refuses schema 5. Real V2 loader regressions continue to prove that old-key writes cannot affect canonical V3. Current V3.1 stale-tab protection and import-generation guards remain active. Rolling code back to V3 leaves schema 5 read-only; retain a schema 5 off-device export and upgrade again to regain normal use. Never downgrade or feed new fields to an old loader. Data already lost before earlier fixes cannot be reconstructed.

### Validation and remaining acceptance

- `npm run build`: PASS; `npm run lint`: PASS.
- `npm test`: **277 tests PASS, 10 files**. Includes 40 V3.1 model regressions, three compact-component rendering cases, all prior V3/V2 isolation regressions, real V3 writer behavior, schema 4 preservation, Sydney DST/boundaries, backdating, partial progress, notes/journals, stable IDs, sorting/moving memberships and complete JSON import/restore round trips.
- `npm audit --omit=dev`: **0 vulnerabilities**. Package files/lockfile unchanged. Development-tool audit findings are outside this feature scope.
- All data tests use synthetic in-memory storage; no production or existing browser storage was accessed, reset or deleted.
- **Not yet verified:** actual browser geometry at 320px/390px/430px, physical iPhone forms/touch, file saving/import, audio/background behavior. Browser connection was unavailable; this is not claimed as a visual or iPhone pass. CSS constrains native fields and long rows, and compact server rendering is tested, but those are not a substitute for viewport checks.
- CSV analysis export is deferred. No drag-and-drop dependency was added; accessible up/down ordering is available.

Before a controlled Preview update: review this local branch, reconnect the browser and check the three widths, then obtain explicit publication approval. Use a copy of an off-device V3 backup on a separate Preview origin. Keep PR #7 Draft and PR #6 open; do not merge/deploy Production during acceptance.

Short iPhone checklist:
1. Import a copied schema 4 backup; verify old records/custom items and the two initial blocks without duplicate 金刚功.
2. Complete any two morning items; log 金刚功 with a custom duration and check one timeline row/one movement total.
3. Review last night and an earlier night; verify occurrence date, assigned date, unknown time and unchanged recording timestamp.
4. Edit swimming time/date/duration, approximate time and note; check its ID and daily/weekly/monthly statistics.
5. Add/edit a journal on a selected day; refresh, export/import/restore, and compare every note and record.
6. Reorder/move/hide modules/items, inspect prior-day progress snapshots and test two-tab conflicts.
7. Check 320px/390px/430px, no horizontal overflow, collapsed rows and optional-time controls.

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

- Product V2 uses internal schema 3 under `health-rhythm-web-v2`. V3 keeps **schema 4** and now exclusively persists to **`health-rhythm-web-v3`**. Keys are centralized in `src/lib/storageKeys.ts`; v2/v1 are read-only migration sources.
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
- Initial V3 implementation: **203 tests PASS, 7 files**. The storage-isolation fix adds real-production-loader and multi-tab regression coverage; see the release verification below.
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
- Keep V3 exports and the pre-migration backup. V2 cannot read the isolated V3 key and cannot represent all V3 fields. Rolling code back to V2 leaves canonical V3 records intact but invisible to V2; never feed a schema 4 export to the old loader. Reintroducing V3 resumes its canonical save rather than importing later V2 changes.
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


## V3 storage isolation and recovery — 2026-10-12

The old production loader at `e5a514e75dac70d8aae94d5b7f0f0b886ec0b8b8` accepts schema 4 under the V2 key and writes schema 3 back, losing V3 fields. An already-open V2 tab can also replace that shared save with stale state. The fix isolates V3 from those writers without modifying their storage.

### Deterministic first-run source policy

1. If `health-rhythm-web-v3` **exists**, it is authoritative. Load and deeply validate schema 4, preserving all IDs, captures, sessions, definitions, routines and preferences. Never compare dates to select another save and never re-import V2. Empty, corrupt, unsupported or unreadable canonical data blocks recording; it is never silently replaced.
2. Only if V3 is absent, read `health-rhythm-web-v2`. A schema 4 snapshot left by pre-fix V3 is a recovery source and is preserved as schema 4. Otherwise validate and migrate supported schemas 1–3 with the existing migration functions. If V2 is present but invalid, block; do not fall back past it.
3. Only if both V3 and V2 are absent, consider `health-rhythm-web-v1`. Only if all three are absent, initialize V3 defaults.
4. For every legacy migration, store the exact source bytes in an independent `before-migration` backup and verify read-back **before** writing V3. Write the canonical schema 4 snapshot, read it back, verify exact bytes and validate it again, then enable persistence. V3 never writes or deletes either legacy key. The original remains untouched even when it already contains schema 4.

All initialization, saves and confirmed imports/restores acquire the same exclusive, origin-scoped Web Lock. iPhone requires Safari 15.4+ and a secure context (HTTPS; localhost also works). Missing/rejected locking, storage reads/writes, backup verification, parsing, migration or canonical read-back failures leave recording disabled with a persistent Chinese recovery notice. An empty display preview is never made writable after failure. Download the original raw data in 管理 before recovery; it may contain malformed JSON and must be kept for repair. When an unreadable original has been backed up and verified, an explicitly previewed/confirmed valid import or restore can recover it; the replacement transaction protects the raw original again. Permission/quota/write failures require fixing storage and refreshing, not automatic retries. A write followed by a failed read-back may already exist on disk; the app reports uncertainty and stops saving rather than falsely reporting cancellation.

### Multi-tab safety

Each V3 instance retains the exact canonical bytes it loaded as its concurrency token. Under the lock, every replacement checks that token against the current key. A mismatch freezes that instance's saves and logging and stops its timers/audio. It shows a Chinese notice to export unsaved edits and refresh. Canonical `storage` events also stop stale instances early; old-key V2 events are ignored. No automatic merging or overwrite is attempted. Imported states invalidate already queued autosaves from the prior state. React snapshots carry that generation too, so a readiness update during recovery cannot accidentally save the old empty preview before the imported snapshot reaches the UI.

This deliberately conservative policy also treats another tab's persisted navigation/settings change as a conflict. Use one active V3 logging tab; refresh other tabs before using them. Locks cannot protect against arbitrary code that ignores the protocol, external storage editing or clearing browser/site data. A blocked tab's uncommitted edits remain only in memory until exported; refreshing first discards those edits. Browser eviction, closing before an asynchronous save finishes and device loss remain local-storage risks, so retain off-device exports.

### Compatibility and rollback

Export format version 1 is unchanged; schemas 1–4, V2 exports and raw legacy backups still import via preview/confirmation and verified safety copies. Migration and unreadable backups are excluded from automatic safety-copy pruning. Existing backup keys remain readable. Normal import/restore pruning retains five recent safety copies and explicitly protects the current replacement and selected restored copy.

V2 rollback reads its unchanged old key, **not** new V3 records; it does not synchronize activity recorded since migration. Later V2 activity is not silently imported when canonical V3 exists. Preview and production origins have separate storage: export production data off-device and test a copy on Preview. Data already destroyed before this fix or before PR #6 cannot be reconstructed automatically. No schema version bump or ID rewrite is required by this fix.

### Release verification

- Build and lint pass. **234 tests pass across 8 files**, including **30 storage-isolation tests** and UI recovery gating.
- `npm audit --omit=dev`: **0 vulnerabilities**. No dependency or lockfile changes. Existing development-tool audit findings remain a separate review item.
- Real V2 regression bundles the complete production source graph directly from Git at the exact commit above, using the already-installed Rolldown. It exercises the actual loader/save functions; it does not simulate their downgrade logic. CI fetches Git history so this test remains reproducible.
- The regression demonstrates the destructive old-key schema 4→3 downgrade while asserting canonical V3 bytes remain identical. A stale V2 tab writes repeatedly before and after new V3 captures; V3 refresh and day rollover retain all captures and custom definitions.
- Independent execution with synthetic data: initial 1 capture → V3 adds a second → actual V2 writes schema 3 → V3 SHA-256 remains `2ddf5a0cc34c747b9d16e9c33d32fd4add36e9c1cd41039d808b5406a373dc30`; V3 adds a third → V2 writes again → V3 SHA-256 remains `c6661da3d9986cb3cc5965b33808d3ddf7e44bca3d4ea545526e296c370044d5`; refresh still loads 3 captures. A stale V3 save is rejected and leaves the canonical bytes unchanged.
- Native browser smoke test on isolated `http://127.0.0.1:5183`: asynchronous startup succeeds; first tab logs three captures; second tab shows the conflict notice and refuses logging; refresh loads all three; Today shows one unique habit, three captures and three timeline entries. Production browser storage was never accessed or cleared. A later native file-chooser attempt failed before import, so browser file import is not claimed as verified for this fix; automated import/restore coverage passes. Real iPhone acceptance remains required.
- Branch remains a local review candidate. No push, PR, merge or deployment is part of this fix.

### Files changed by the isolation fix

- `.github/workflows/ci.yml`
- `README.md`
- `src/App.tsx`
- `src/DataBackupSection.test.ts`
- `src/DataBackupSection.tsx`
- `src/lib/backupStore.ts`
- `src/lib/coreActivities.test.ts`
- `src/lib/dataTransfer.test.ts`
- `src/lib/dataTransfer.ts`
- `src/lib/mindfulEating.test.ts`
- `src/lib/state.test.ts`
- `src/lib/state.ts`
- `src/lib/storageStatus.ts`
- `src/lib/v3.test.ts`
- `vite.config.ts`
- `src/lib/persistence.ts`
- `src/lib/storageIsolation.test.ts`
- `src/lib/storageKeys.ts`
- `src/lib/testSetup.ts`

## V3.1 files changed

- `README.md`
- `src/App.tsx`
- `src/lib/coreActivities.test.ts`
- `src/lib/dataTransfer.test.ts`
- `src/lib/dataTransfer.ts`
- `src/lib/domain.ts`
- `src/lib/state.test.ts`
- `src/lib/state.ts`
- `src/lib/storageIsolation.test.ts`
- `src/lib/v3.test.ts`
- `src/styles.css`
- `src/V31Panels.test.ts`
- `src/V31Panels.tsx`
- `src/lib/v31.test.ts`
- `src/lib/v31.ts`
