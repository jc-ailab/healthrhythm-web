/// <reference types="node" />
// Executes the production source graph verbatim from Git, not an approximation of V2.
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { rolldown } from 'rolldown'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import v2Fixture from './fixtures/v2-save.json'
import { type AppState } from './domain'
import { loadPersistedState, saveState, toggleHabitState, ensureCurrentDay } from './state'
import { buildExportText, parseImportText, replaceWithSafetyCopy } from './dataTransfer'
import { listBackups, BACKUP_KEY_PREFIX, pruneSafetyCopies } from './backupStore'
import { CONFLICT_NOTICE, PersistenceSession } from './persistence'
import { resetStorageStatus } from './storageStatus'
import { V1_STORAGE_KEY, V2_STORAGE_KEY, V3_STORAGE_KEY } from './storageKeys'

const PRODUCTION_V2 = 'e5a514e75dac70d8aae94d5b7f0f0b886ec0b8b8'
const now = new Date(2026, 3, 15, 12)
const nextDay = new Date(2026, 3, 16, 8)
let realV2: {
  loadPersistedState(now: Date): { state: AppState; canPersist: boolean; notice: unknown }
  saveState(state: AppState): boolean
}
let data: Map<string, string>
let failWrite: (key: string) => boolean
let failRead: (key: string) => boolean
let wrongReadBack: boolean
let canonicalWritten: boolean
let writes: string[]

beforeAll(async () => {
  const repo = process.cwd()
  const virtualRoot = path.join(mkdtempSync(path.join(tmpdir(), 'hr-real-v2-')), 'source')
  const output = path.join(path.dirname(virtualRoot), 'production-v2.mjs')
  const build = await rolldown({
    input: path.join(virtualRoot, 'src/lib/state.ts'), platform: 'node',
    plugins: [{
      name: 'verbatim-production-v2',
      resolveId(source, importer) {
        if (source === 'react') return path.join(repo, 'node_modules/react/index.js')
        if (source.startsWith(virtualRoot)) return source
        if (importer?.startsWith(virtualRoot) && source.startsWith('.')) {
          return path.resolve(path.dirname(importer), source) + '.ts'
        }
      },
      load(id) {
        if (id.startsWith(virtualRoot)) {
          return execFileSync('git', ['show', `${PRODUCTION_V2}:${path.relative(virtualRoot, id)}`], { cwd: repo, encoding: 'utf8' })
        }
      },
    }],
  })
  await build.write({ file: output, format: 'esm' })
  await build.close()
  realV2 = await import(/* @vite-ignore */ pathToFileURL(output).href)
})

beforeEach(() => {
  data = new Map()
  failWrite = () => false
  failRead = () => false
  wrongReadBack = false
  canonicalWritten = false
  writes = []
  vi.stubGlobal('localStorage', {
    get length() { return data.size },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem(key: string) {
      if (failRead(key)) throw new Error('SecurityError')
      if (wrongReadBack && canonicalWritten && key === V3_STORAGE_KEY) return '{read-back-corrupted}'
      return data.get(key) ?? null
    },
    setItem(key: string, raw: string) {
      writes.push(key)
      if (failWrite(key)) throw new Error('QuotaExceededError')
      data.set(key, raw)
      if (key === V3_STORAGE_KEY) canonicalWritten = true
    },
    removeItem: (key: string) => { data.delete(key) },
  })
  resetStorageStatus()
})
afterEach(() => vi.unstubAllGlobals())
const seedV2 = () => {
  const raw = JSON.stringify(v2Fixture)
  data.set(V2_STORAGE_KEY, raw)
  return raw
}
const canonical = () => JSON.parse(data.get(V3_STORAGE_KEY)!) as AppState
const capture = (state: AppState, hour: number) => toggleHabitState(state, 'mindfulEating', new Date(2026, 3, 15, hour))

describe('canonical V3 isolation and verified first-run migration', () => {
  it('preserves all V2 definitions, IDs and records, leaves V2 byte-identical and protects its backup', async () => {
    const raw = seedV2()
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(true)
    expect(canonical().version).toBe(5)
    expect(data.get(V2_STORAGE_KEY)).toBe(raw)
    expect(writes).not.toContain(V2_STORAGE_KEY)
    expect(loaded.state.today).toMatchObject(v2Fixture.today)
    expect(loaded.state.strength.completedExerciseIds).toEqual(v2Fixture.strength.completedExerciseIds)
    expect(loaded.state.strength.routines.find((routine) => routine.id === 'custom-routine-existing')).toEqual(v2Fixture.strength.routines.at(-1))
    expect(loaded.state.library.habits[0]).toEqual(v2Fixture.library.habits[0])
    expect(loaded.state.library.exercises[0].id).toBe(v2Fixture.library.exercises[0].id)
    expect(loaded.state.history.find((record) => record.dayKey === v2Fixture.history[0].dayKey)).toEqual({ ...v2Fixture.history[0], habitEvents: {} })
    expect(listBackups()[0].raw).toBe(raw)
    pruneSafetyCopies(0, [])
    expect(listBackups()[0].raw).toBe(raw)
  })
  it('recovers schema 4 stranded under V2 with captures, preferences and custom definitions intact', async () => {
    seedV2()
    const first = await loadPersistedState(now)
    const stranded = capture(first.state, 13)
    stranded.history[1].habitEvents.mindfulEating = ['2026-04-14T00:00:00.000Z', '2026-04-14T04:00:00.000Z', '2026-04-14T10:00:00.000Z']
    stranded.history[1].captureIds = { mindfulEating: ['legacy-cap-1', 'legacy-cap-2', 'legacy-cap-3'] }
    stranded.library.habits[0] = { ...stranded.library.habits[0], enabled: false, group: '其他活动', frequency: 'occasional' }
    // Simulate the pre-fix V3 installation; only synthetic storage is used.
    data.delete(V3_STORAGE_KEY)
    const raw = JSON.stringify(stranded)
    data.set(V2_STORAGE_KEY, raw)
    const recovered = await loadPersistedState(now)
    expect(recovered.canPersist).toBe(true)
    expect(recovered.state).toEqual(stranded)
    expect(data.get(V2_STORAGE_KEY)).toBe(raw)
    expect(listBackups().some((backup) => backup.raw === raw && backup.meta?.reason === 'before-migration')).toBe(true)
  })
  it('canonical wins even if V2 claims a newer day; refresh never imports again', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const updated = capture(loaded.state, 13)
    expect(await saveState(updated, loaded.session)).toBe(true)
    const expected = data.get(V3_STORAGE_KEY)
    data.set(V2_STORAGE_KEY, JSON.stringify({ ...v2Fixture, currentDayKey: '2099-12-31' }))
    const backupsBefore = listBackups()
    const refreshed = await loadPersistedState(now)
    expect(refreshed.state).toEqual(updated)
    expect(data.get(V3_STORAGE_KEY)).toBe(expected)
    expect(listBackups()).toEqual(backupsBefore)
  })
  it('uses v1 only if both V3 and V2 are absent, never changes the original v1 key', async () => {
    const raw = JSON.stringify({ ...v2Fixture, version: 1 })
    data.set(V1_STORAGE_KEY, raw)
    expect((await loadPersistedState(now)).canPersist).toBe(true)
    expect(data.get(V1_STORAGE_KEY)).toBe(raw)
    expect(data.has(V2_STORAGE_KEY)).toBe(false)
  })
  it('initializes new users in V3 without creating V2', async () => {
    expect((await loadPersistedState(now)).canPersist).toBe(true)
    expect(canonical().version).toBe(5)
    expect(data.has(V2_STORAGE_KEY)).toBe(false)
    expect(listBackups()).toHaveLength(0)
  })
  it.each(['{broken', '', 'null'])('corrupt canonical %j blocks fallback and all autosaves', async (raw) => {
    seedV2()
    data.set(V3_STORAGE_KEY, raw)
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    expect(await saveState(loaded.state, loaded.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    expect(data.get(V2_STORAGE_KEY)).toBe(JSON.stringify(v2Fixture))
    expect(listBackups().some((backup) => backup.raw === raw)).toBe(true)
  })
  it('invalid V2 blocks even when v1 is valid', async () => {
    data.set(V2_STORAGE_KEY, '{bad-v2}')
    data.set(V1_STORAGE_KEY, JSON.stringify(v2Fixture))
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    expect(data.has(V3_STORAGE_KEY)).toBe(false)
    expect(await saveState(loaded.state, loaded.session)).toBe(false)
  })
  it('backup failure blocks migration and cannot be bypassed by a later save', async () => {
    const raw = seedV2()
    failWrite = (key) => key.startsWith(BACKUP_KEY_PREFIX)
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    expect(loaded.state.today).toMatchObject(v2Fixture.today)
    failWrite = () => false
    expect(await saveState(capture(loaded.state, 13), loaded.session)).toBe(false)
    expect(data.has(V3_STORAGE_KEY)).toBe(false)
    expect(data.get(V2_STORAGE_KEY)).toBe(raw)
  })
  it('backup read-back failure blocks migration', async () => {
    seedV2()
    failRead = (key) => key.startsWith(BACKUP_KEY_PREFIX)
    expect((await loadPersistedState(now)).canPersist).toBe(false)
    expect(data.has(V3_STORAGE_KEY)).toBe(false)
  })
  it.each([V3_STORAGE_KEY, V2_STORAGE_KEY, V1_STORAGE_KEY])('read failure at %s cannot turn into an empty writable save', async (key) => {
    failRead = (id) => id === key
    const loaded = await loadPersistedState(now)
    failRead = () => false
    expect(loaded.canPersist).toBe(false)
    expect(await saveState(loaded.state, loaded.session)).toBe(false)
    expect(data.has(V3_STORAGE_KEY)).toBe(false)
  })
  it('autosave read failure blocks the session and preserves the latest canonical bytes', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const raw = data.get(V3_STORAGE_KEY)
    failRead = (key) => key === V3_STORAGE_KEY
    expect(await saveState(capture(loaded.state, 13), loaded.session)).toBe(false)
    failRead = () => false
    expect(await saveState(capture(loaded.state, 14), loaded.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('deeply malformed canonical history cannot be normalized away into a writable state', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const corrupted = structuredClone(loaded.state)
    // Deliberately violate the schema only in this synthetic test.
    Object.assign(corrupted.history[0], { habitEvents: { mindfulEating: [42] } })
    const raw = JSON.stringify(corrupted)
    data.set(V3_STORAGE_KEY, raw)
    const result = await loadPersistedState(now)
    expect(result.canPersist).toBe(false)
    expect(await saveState(result.state, result.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('standalone save and replacement cannot bypass migration when legacy data exists', async () => {
    const raw = seedV2()
    const fresh = realV2.loadPersistedState(now).state
    // Use a fresh session allowed only to bootstrap an absent, truly empty store.
    const session = new PersistenceSession(true)
    expect(await saveState(fresh, session)).toBe(false)
    expect(await replaceWithSafetyCopy(fresh, fresh, 'before-import', now, undefined, session)).toMatchObject({ ok: false })
    expect(data.has(V3_STORAGE_KEY)).toBe(false)
    expect(data.get(V2_STORAGE_KEY)).toBe(raw)
  })
  it('canonical write failure keeps the source and backup and blocks subsequent writes', async () => {
    const raw = seedV2()
    failWrite = (key) => key === V3_STORAGE_KEY
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    failWrite = () => false
    expect(await saveState(loaded.state, loaded.session)).toBe(false)
    expect(data.has(V3_STORAGE_KEY)).toBe(false)
    expect(data.get(V2_STORAGE_KEY)).toBe(raw)
    expect(listBackups()[0].raw).toBe(raw)
  })
  it('canonical read-back mismatch never enables persistence', async () => {
    seedV2()
    wrongReadBack = true
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    wrongReadBack = false
    expect(await saveState(capture(loaded.state, 13), loaded.session)).toBe(false)
    expect(canonical().today).toMatchObject(v2Fixture.today)
  })
  it('fails closed when Web Locks is absent or rejected', async () => {
    const raw = seedV2()
    for (const locks of [undefined, { request: () => Promise.reject(new Error('denied')) }]) {
      vi.stubGlobal('navigator', { locks })
      const loaded = await loadPersistedState(now)
      expect(loaded.canPersist).toBe(false)
      expect(await saveState(loaded.state, loaded.session)).toBe(false)
      expect(data.has(V3_STORAGE_KEY)).toBe(false)
      expect(data.get(V2_STORAGE_KEY)).toBe(raw)
    }
  })
  it('explicit confirmed recovery backs up corrupt original bytes instead of the empty display state', async () => {
    seedV2()
    data.set(V3_STORAGE_KEY, '{recoverable-original}')
    const loaded = await loadPersistedState(now)
    const parsed = parseImportText(JSON.stringify(v2Fixture), now)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(loaded.session.getCanRecover()).toBe(true)
    expect(await replaceWithSafetyCopy(loaded.state, parsed.state, 'before-restore', now, undefined, loaded.session)).toMatchObject({ ok: true })
    expect(canonical()).toEqual(parsed.state)
    expect(listBackups().some((backup) => backup.raw === '{recoverable-original}')).toBe(true)
    expect(await saveState(capture(parsed.state, 13), loaded.session)).toBe(true)
    expect(data.get(V2_STORAGE_KEY)).toBe(JSON.stringify(v2Fixture))
  })
  it('old V2 exports and V3 exports still round-trip without changing IDs', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const oldExport = { format: 'healthrhythm-export', formatVersion: 1, stateVersion: 3, state: v2Fixture }
    for (const raw of [JSON.stringify(oldExport), buildExportText(loaded.state, now)]) {
      const parsed = parseImportText(raw, now)
      if (!parsed.ok) throw new Error(parsed.error)
      expect(await replaceWithSafetyCopy(loaded.state, parsed.state, 'before-import', now, undefined, loaded.session)).toMatchObject({ ok: true })
      expect(canonical().library.habits[0].id).toBe(v2Fixture.library.habits[0].id)
    }
  })
})

describe('REAL e5a514e V2 writes cannot reach canonical V3', () => {
  it('demonstrates destructive schema-4 downgrade in V2 yet byte-identical V3 protection', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const state = capture(loaded.state, 13)
    expect(await saveState(state, loaded.session)).toBe(true)
    // Reproduce an existing pre-fix V3 snapshot in the old key and run the real loader.
    data.set(V2_STORAGE_KEY, JSON.stringify(state))
    const expected = data.get(V3_STORAGE_KEY)
    const old = realV2.loadPersistedState(now)
    expect(old.canPersist).toBe(true)
    expect(old.notice).toBeNull()
    expect(old.state.version).toBe(3)
    expect(old.state.library.habits.some((habit) => habit.id === 'custom-habit-existing')).toBe(false)
    expect(realV2.saveState(old.state)).toBe(true)
    expect(JSON.parse(data.get(V2_STORAGE_KEY)!).version).toBe(3)
    expect(data.get(V3_STORAGE_KEY)).toBe(expected)
    expect((await loadPersistedState(now)).state).toEqual(state)
  })
  it('already-open V2 writes twice while V3 adds captures; refresh and rollover retain every V3 capture', async () => {
    seedV2()
    const oldTab = realV2.loadPersistedState(now)
    const loaded = await loadPersistedState(now)
    const initialCount = loaded.state.today.eventsByHabitId.mindfulEating!.length
    expect(realV2.saveState(oldTab.state)).toBe(true)
    let state = capture(loaded.state, 13)
    expect(await saveState(state, loaded.session)).toBe(true)
    const protectedRaw = data.get(V3_STORAGE_KEY)
    expect(realV2.saveState(oldTab.state)).toBe(true)
    expect(data.get(V3_STORAGE_KEY)).toBe(protectedRaw)
    state = capture(state, 14)
    expect(await saveState(state, loaded.session)).toBe(true)
    const newest = data.get(V3_STORAGE_KEY)
    expect(realV2.saveState(oldTab.state)).toBe(true)
    expect(data.get(V3_STORAGE_KEY)).toBe(newest)
    const refreshed = await loadPersistedState(now)
    expect(refreshed.state.today.eventsByHabitId.mindfulEating).toHaveLength(initialCount + 2)
    const rolled = ensureCurrentDay(refreshed.state, nextDay)
    expect(await saveState(rolled, refreshed.session)).toBe(true)
    expect(realV2.saveState(oldTab.state)).toBe(true)
    const afterDayChange = await loadPersistedState(nextDay)
    expect(afterDayChange.state.history.find((record) => record.dayKey === '2026-04-15')!.habitEvents.mindfulEating).toHaveLength(initialCount + 2)
    expect(afterDayChange.state.library.habits.some((habit) => habit.id === 'custom-habit-existing')).toBe(true)
  })
})

describe('V3 tab conflicts use a locked snapshot comparison', () => {
  it('second stale V3 tab cannot overwrite newer captures, even without a storage event', async () => {
    seedV2()
    const first = await loadPersistedState(now, new PersistenceSession())
    const second = await loadPersistedState(now, new PersistenceSession())
    expect(await saveState(capture(first.state, 13), first.session)).toBe(true)
    const newest = data.get(V3_STORAGE_KEY)
    expect(await saveState(capture(second.state, 14), second.session)).toBe(false)
    expect(second.session.notice).toEqual(CONFLICT_NOTICE)
    expect(second.session.getCanPersist()).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(newest)
    expect(await replaceWithSafetyCopy(second.state, second.state, 'before-import', now, undefined, second.session)).toMatchObject({ ok: false })
    expect(data.get(V3_STORAGE_KEY)).toBe(newest)
  })
  it('truly concurrent tab saves serialize: one wins and one stops without losing the winner', async () => {
    seedV2()
    const [first, second] = await Promise.all([loadPersistedState(now), loadPersistedState(now)])
    const a = capture(first.state, 13)
    const b = capture(second.state, 14)
    const results = await Promise.all([saveState(a, first.session), saveState(b, second.session)])
    expect(results).toEqual([true, false])
    expect(canonical()).toEqual(a)
    expect(listBackups()).toHaveLength(1)
  })
  it('storage events stop stale canonical writers but old-version events cannot interfere', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    loaded.session.observeStorage({ key: V2_STORAGE_KEY, newValue: 'old-tab-write' })
    expect(loaded.session.getCanPersist()).toBe(true)
    loaded.session.observeStorage({ key: V3_STORAGE_KEY, newValue: 'another-v3-save' })
    expect(loaded.session.getCanPersist()).toBe(false)
    expect(await saveState(loaded.state, loaded.session)).toBe(false)
  })
  it('a queued same-tab autosave cannot revert an explicitly imported state', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const imported = capture(loaded.state, 13)
    const results = await Promise.all([
      replaceWithSafetyCopy(loaded.state, imported, 'before-import', now, undefined, loaded.session),
      saveState(loaded.state, loaded.session),
    ])
    expect(results[0]).toMatchObject({ ok: true })
    expect(results[1]).toBe(false)
    expect(canonical()).toEqual(imported)
  })
  it('a React snapshot from before recovery cannot save after readiness changes', async () => {
    seedV2()
    data.set(V3_STORAGE_KEY, '{corrupt-original}')
    const loaded = await loadPersistedState(now)
    const oldGeneration = loaded.session.generation
    const parsed = parseImportText(JSON.stringify(v2Fixture), now)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(await replaceWithSafetyCopy(loaded.state, parsed.state, 'before-restore', now, undefined, loaded.session)).toMatchObject({ ok: true })
    expect(loaded.session.getCanPersist()).toBe(true)
    // Simulates an effect flushed before onReplace updates React's state snapshot.
    expect(await saveState(loaded.state, loaded.session, oldGeneration)).toBe(false)
    expect(canonical()).toEqual(parsed.state)
    expect(await saveState(parsed.state, loaded.session, loaded.session.generation)).toBe(true)
  })
  it('same-tab queued captures keep order and do not create duplicate records', async () => {
    seedV2()
    const loaded = await loadPersistedState(now)
    const first = capture(loaded.state, 13)
    const second = capture(first, 14)
    expect(await Promise.all([saveState(first, loaded.session), saveState(second, loaded.session)])).toEqual([true, true])
    expect(canonical()).toEqual(second)
    expect(canonical().history.find((record) => record.dayKey === '2026-04-15')!.habitEvents.mindfulEating).toEqual(second.today.eventsByHabitId.mindfulEating)
  })
})
