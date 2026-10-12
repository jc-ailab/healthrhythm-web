/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { rolldown } from 'rolldown'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import v2Fixture from './fixtures/v2-save.json'
import { createInitialState, fromDayKey, shiftDayKey, type AppState, type TodayTimelineEvent } from './domain'
import { buildTodayTimeline, buildHistorySummary, ensureCurrentDay, loadPersistedState, restoreStoredState, saveState, toggleHabitState, toggleStrengthExerciseState, updateMovementSessionState, deleteMovementSessionState } from './state'
import { buildExportText, parseImportText, replaceWithSafetyCopy } from './dataTransfer'
import { listBackups, pruneSafetyCopies } from './backupStore'
import { V2_STORAGE_KEY, V3_STORAGE_KEY } from './storageKeys'
import { dayRecord, dayAsState, dominoProgress, logDomino, occurrenceDay, saveBlock, saveJournal, editRecord, eventInfo, eventTimeLabel, moveBlock, validDay, type DominoBlock } from './v31'

const now = new Date('2026-10-12T21:00:00.000Z') // Tue 13 October, 08:00 Sydney.
const V3_COMMIT = '0bb80db8ed566766308b48426df0b5f9bbee7aa6'
let oldV3: { loadPersistedState(now: Date): ReturnType<typeof loadPersistedState>; saveState: typeof saveState }
let data: Map<string, string>, writes: string[], failedKey: string | null
const priorTZ = process.env.TZ
beforeAll(async () => {
  process.env.TZ = 'Australia/Sydney'
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'hr-real-v3-')), 'source')
  const output = path.join(path.dirname(root), 'v3.mjs')
  const repo = process.cwd()
  const build = await rolldown({ input: path.join(root, 'src/lib/state.ts'), platform: 'node', plugins: [{
    name: 'verbatim-v3',
    resolveId(source, importer) {
      if (source === 'react') return path.join(repo, 'node_modules/react/index.js')
      if (source.startsWith(root)) return source
      if (importer?.startsWith(root) && source.startsWith('.')) return path.resolve(path.dirname(importer), source) + '.ts'
    },
    load(id) { if (id.startsWith(root)) return execFileSync('git', ['show', `${V3_COMMIT}:${path.relative(root, id)}`], { cwd: repo, encoding: 'utf8' }) },
  }] })
  await build.write({ file: output, format: 'esm' }); await build.close()
  oldV3 = await import(/* @vite-ignore */ pathToFileURL(output).href)
})
afterAll(() => { if (priorTZ === undefined) delete process.env.TZ; else process.env.TZ = priorTZ })
beforeEach(() => {
  data = new Map(); writes = []; failedKey = null
  vi.stubGlobal('localStorage', {
    get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) { writes.push(key); if (key === failedKey || failedKey === 'backup' && key.includes('backup-')) throw new Error('quota'); data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  })
})
afterEach(() => vi.unstubAllGlobals())
const fresh = () => ensureCurrentDay(createInitialState(now), now)
const block = (state: AppState, name: string) => state.library.dominoBlocks!.find((item) => item.name === name)!
const timeline = (state: AppState, day = state.currentDayKey) => buildTodayTimeline(dayAsState(state, day), state.library.habits, [])
const one = (state: AppState, kind: TodayTimelineEvent['kind']) => timeline(state).find((event) => event.kind === kind)!

describe('versioned migration with real V3 writer protection', () => {
  it('backs up real schema 4 canonical bytes and preserves every original field and customization', async () => {
    data.set(V2_STORAGE_KEY, JSON.stringify(v2Fixture))
    const old = await oldV3.loadPersistedState(now)
    expect(old.state.version).toBe(4)
    old.state.library.habits[0].name = '我的习惯名称'
    old.state.library.habits.reverse()
    expect(await oldV3.saveState(old.state, old.session)).toBe(true)
    const raw = data.get(V3_STORAGE_KEY)!
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(true)
    expect(loaded.state.version).toBe(5)
    expect(loaded.state.today).toMatchObject(old.state.today)
    expect(loaded.state.strength).toEqual(old.state.strength)
    expect(loaded.state.rhythm).toEqual(old.state.rhythm)
    expect(loaded.state.breath).toEqual(old.state.breath)
    expect(loaded.state.library.exercises).toEqual(old.state.library.exercises)
    expect(loaded.state.library.habits.slice(0, old.state.library.habits.length)).toEqual(old.state.library.habits)
    expect(loaded.state.history).toMatchObject(old.state.history)
    expect(listBackups().some((backup) => backup.raw === raw && backup.meta?.reason === 'before-migration')).toBe(true)
    pruneSafetyCopies(0, [])
    expect(listBackups().some((backup) => backup.raw === raw)).toBe(true)
    expect(writes.filter((key) => key === V2_STORAGE_KEY)).toHaveLength(0)
    expect((await loadPersistedState(now)).state.library.dominoBlocks).toEqual(loaded.state.library.dominoBlocks)
  })
  it('REAL already-open V3 cannot overwrite schema 5 and a fresh old V3 refuses to persist it', async () => {
    const old = await oldV3.loadPersistedState(now)
    const migrated = await loadPersistedState(now)
    const state = saveJournal(migrated.state, '2026-10-13', '新随记不会被旧版覆盖', now)
    expect(await saveState(state, migrated.session)).toBe(true)
    const raw = data.get(V3_STORAGE_KEY)
    expect(await oldV3.saveState(old.state, old.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    const reopened = await oldV3.loadPersistedState(now)
    expect(reopened.canPersist).toBe(false)
    expect(await oldV3.saveState(reopened.state, reopened.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('backup failure leaves schema 4 canonical unchanged and no subsequent autosave can bypass it', async () => {
    await oldV3.loadPersistedState(now)
    const raw = data.get(V3_STORAGE_KEY)
    failedKey = 'backup'
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    failedKey = null
    expect(await saveState(loaded.state, loaded.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('rejects malformed schema 5 extensions and retains canonical bytes', async () => {
    const state = fresh(); state.library.dominoBlocks![0].assignment = 'invalid' as DominoBlock['assignment']
    const raw = JSON.stringify(state); data.set(V3_STORAGE_KEY, raw)
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    expect(parseImportText(raw, now).ok).toBe(false)
  })
})

describe('Domino records use the existing habit and movement structures', () => {
  it('seeds exact names and order once, using jingang, foot-soak and earlySleep identities', () => {
    const state = fresh()
    expect(block(state, '晨间多米诺').itemIds.map((id) => state.library.habits.find((habit) => habit.id === id)!.name)).toEqual(['虔信时刻', '晨习', '无压', '金刚功'])
    expect(block(state, '睡前多米诺').itemIds.map((id) => state.library.habits.find((habit) => habit.id === id)!.name)).toEqual(['断网', '洗漱', '泡脚', '睡前轻阅读', '早睡'])
    expect(state.library.habits.filter((habit) => habit.id === 'jingang')).toHaveLength(1)
    expect(restoreStoredState(state, now)).toEqual(state)
  })
  it('morning supports independent partial completion and duration contributes once', () => {
    let state = fresh(); const morning = block(state, '晨间多米诺')
    state = logDomino(state, 'domino-wuya', state.currentDayKey, morning, now)
    state = logDomino(state, 'jingang', state.currentDayKey, morning, now, { typeId: 'jingang', durationMinutes: 30 })
    expect(dominoProgress(dayRecord(state, state.currentDayKey), morning)).toBe(2)
    expect(timeline(state).filter((event) => event.kind === 'movement')).toHaveLength(1)
    expect(state.today.movementSessions).toHaveLength(1)
    expect(buildHistorySummary(state.history, [state.currentDayKey], state.currentDayKey).movementTotalMinutes).toBe(30)
    expect(one(state, 'movement').info?.occurredDate).toBe('2026-10-13')
  })
  it('Tuesday morning reviews Monday night with unknown time and actual recording timestamp', () => {
    let state = fresh(); const bedtime = block(state, '睡前多米诺')
    state = logDomino(state, 'foot-soak', '2026-10-13', bedtime, now)
    state = logDomino(state, 'earlySleep', '2026-10-13', bedtime, now)
    expect(dominoProgress(dayRecord(state, '2026-10-13'), bedtime)).toBe(2)
    const event = timeline(state).find((item) => item.title === '泡脚')!
    expect(event.info).toMatchObject({ occurredDate: '2026-10-12', occurredTime: null, assignedDate: '2026-10-13', recordedAt: now.toISOString(), precision: 'unknown' })
    expect(eventTimeLabel(event)).toBe('昨晚 · 时间未指定')
    expect(dayRecord(state, '2026-10-12').habits['foot-soak']).toBeUndefined()
  })
  it('Wednesday can select Tuesday review to record Monday night without touching Wednesday totals', () => {
    const wed = new Date('2026-10-13T21:00:00Z')
    let state = ensureCurrentDay(fresh(), wed)
    state = logDomino(state, 'foot-soak', '2026-10-13', block(state, '睡前多米诺'), wed)
    expect(state.today.completionTimesByHabitId['foot-soak']).toBeUndefined()
    const event = timeline(state, '2026-10-13')[0]
    expect(event.info).toMatchObject({ occurredDate: '2026-10-12', assignedDate: '2026-10-13', recordedAt: wed.toISOString() })
  })
  it.each([['2027-01-01', '2026-12-31'], ['2026-03-01', '2026-02-28'], ['2024-03-01', '2024-02-29'], ['2026-10-05', '2026-10-04'], ['2026-04-06', '2026-04-05'], ['2026-10-04', '2026-10-03'], ['2026-04-05', '2026-04-04']])('previous night for %s is %s, using calendar arithmetic including Sydney DST', (assigned, occurred) => {
    expect(occurrenceDay(block(fresh(), '睡前多米诺'), assigned)).toBe(occurred)
    expect(shiftDayKey(occurred, 1)).toBe(assigned)
  })
  it('Sydney calendar-day shifts cross 23-hour and 25-hour elapsed intervals without changing the intended date', () => {
    const elapsed = (day: string) => (fromDayKey(day).getTime() - fromDayKey(shiftDayKey(day, -1)).getTime()) / 3600000
    expect(elapsed('2026-10-04')).toBe(23)
    expect(elapsed('2026-04-05')).toBe(25)
  })
  it('preserves custom definitions and ambiguous names instead of guessing their identity', () => {
    const original = fresh()
    original.library.habits.push({ id: 'my-ambiguous-faith', name: '虔信时刻', note: '自定义', category: '我的', enabled: true, showOnToday: true })
    const state = restoreStoredState(original, now)
    expect(state.library.habits.find((habit) => habit.id === 'my-ambiguous-faith')).toEqual(original.library.habits.at(-1))
    expect(block(state, '晨间多米诺').itemIds[0]).toBe('domino-faith')
  })
  it('moving yoga into morning preserves its definition and all recorded movement IDs', () => {
    let state = fresh()
    state = logDomino(state, 'yoga', state.currentDayKey, undefined, now, { typeId: 'yoga', durationMinutes: 45 })
    const id = state.today.movementSessions[0].id
    const habit = state.library.habits.find((item) => item.id === 'yoga')
    state = saveBlock(state, { ...block(state, '晨间多米诺'), itemIds: [...block(state, '晨间多米诺').itemIds, 'yoga'] })
    expect(state.library.habits.find((item) => item.id === 'yoga')).toEqual(habit)
    expect(state.today.movementSessions[0].id).toBe(id)
    expect(dominoProgress(dayRecord(state, state.currentDayKey), block(state, '晨间多米诺'))).toBe(1)
  })
  it('historical module definitions are not reinterpreted after moving an item or renaming', () => {
    let state = fresh(); const old = block(state, '晨间多米诺')
    state = logDomino(state, 'domino-faith', state.currentDayKey, old, now)
    state = ensureCurrentDay(state, new Date('2026-10-13T21:00:00Z'))
    state = saveBlock(state, { ...block(state, '睡前多米诺'), itemIds: ['domino-faith'] })
    state = saveBlock(state, { ...block(state, '晨间多米诺'), name: '我的晨间' })
    const history = dayRecord(state, '2026-10-13')
    expect(history.dominoSnapshots![0].name).toBe('晨间多米诺')
    expect(history.dominoSnapshots![0].itemIds).toEqual(old.itemIds)
    expect(dominoProgress(history, history.dominoSnapshots![0])).toBe(1)
  })
  it('empty/custom/hidden modules stay configured and do not reseed on refresh', () => {
    let state = fresh()
    state.library.dominoBlocks = []
    state = saveBlock(state, { id: 'my-block', name: '我的模块', hidden: true, assignment: 'same-day', itemIds: ['yoga'] })
    expect(restoreStoredState(state, now).library.dominoBlocks).toEqual(state.library.dominoBlocks)
  })
  it('manual item and module ordering survive persistence without touching IDs', async () => {
    let state = fresh()
    state = saveBlock(state, { ...block(state, '晨间多米诺'), itemIds: [...block(state, '晨间多米诺').itemIds].reverse() })
    state = moveBlock(state, 'domino-bedtime', -1)
    expect(await saveState(state)).toBe(true)
    expect((await loadPersistedState(now)).state.library.dominoBlocks).toEqual(state.library.dominoBlocks)
  })
})

describe('time corrections, notes, journals and assigned-date statistics', () => {
  it('movement editing preserves the session ID and recording time, changes assigned statistics and duration once', () => {
    let state = fresh()
    state = logDomino(state, 'swimming', state.currentDayKey, undefined, now, { typeId: 'swimming', durationMinutes: 30, note: '原备注' })
    const event = one(state, 'movement'), id = state.today.movementSessions[0].id
    state = editRecord(state, state.currentDayKey, event, { ...eventInfo(event), occurredDate: '2026-10-11', occurredTime: '15:30', precision: 'approximate', assignedDate: '2026-10-11', durationMinutes: 45, note: '游了10圈' })
    expect(state.today.movementSessions).toHaveLength(0)
    expect(dayRecord(state, '2026-10-11').movementSessions[0]).toMatchObject({ id, loggedAt: now.toISOString(), durationMinutes: 45, note: '游了10圈' })
    const edited = timeline(state, '2026-10-11')[0]
    expect(edited.id).toBe(event.id)
    expect(edited.info?.recordedAt).toBe(now.toISOString())
    expect(eventTimeLabel(edited)).toBe('约 15:30')
    expect(buildHistorySummary(state.history, ['2026-10-11'], state.currentDayKey).movementTotalMinutes).toBe(45)
  })
  it('capture moves keep stable IDs including two captures with the same recording timestamp', () => {
    let state = toggleHabitState(toggleHabitState(fresh(), 'mindfulEating', now), 'mindfulEating', now)
    const before = timeline(state), moving = before[0]
    expect(before[0].id).not.toBe(before[1].id)
    state = editRecord(state, state.currentDayKey, moving, { ...eventInfo(moving), occurredDate: '2026-10-11', occurredTime: null, precision: 'unknown', assignedDate: '2026-10-11', note: '早餐补记' })
    expect(timeline(state)[0].id).toBe(before[1].id)
    expect(timeline(state, '2026-10-11')[0].id).toBe(moving.id)
    expect(dayRecord(state, '2026-10-11').habitEvents.mindfulEating).toEqual([now.toISOString()])
    expect(buildHistorySummary(state.history, ['2026-10-11', '2026-10-13'], state.currentDayKey).habitCapturesCount).toBe(2)
  })
  it('single completion correction and undo preserve independent records and do not merge collisions', () => {
    let state = logDomino(fresh(), 'earlySleep', '2026-10-13', undefined, now)
    const event = one(state, 'habit')
    state = logDomino(state, 'earlySleep', '2026-10-12', undefined, now)
    const before = JSON.stringify(state)
    expect(editRecord(state, '2026-10-13', event, { ...eventInfo(event), assignedDate: '2026-10-12' })).toBe(state)
    expect(JSON.stringify(state)).toBe(before)
    state = logDomino(state, 'earlySleep', '2026-10-12', undefined, now) // Explicit undo.
    state = editRecord(state, '2026-10-13', event, { ...eventInfo(event), assignedDate: '2026-10-12', occurredDate: '2026-10-11', occurredTime: null, precision: 'unknown' })
    expect(timeline(state, '2026-10-12')[0].id).toBe(event.id)
    expect(state.today.completionTimesByHabitId.earlySleep).toBeUndefined()
  })
  it('backdated morning logging does not invent a past time from the current recording clock', () => {
    const state = logDomino(fresh(), 'domino-faith', '2026-10-11', block(fresh(), '晨间多米诺'), now)
    expect(timeline(state, '2026-10-11')[0].info).toMatchObject({ occurredDate: '2026-10-11', occurredTime: null, precision: 'unknown', assignedDate: '2026-10-11', recordedAt: now.toISOString() })
  })
  it('existing movement editor updates the same note and deletion removes metadata safely', () => {
    let state = logDomino(fresh(), 'jingang', '2026-10-13', block(fresh(), '晨间多米诺'), now, { typeId: 'jingang', durationMinutes: 15 })
    const id = state.today.movementSessions[0].id
    state = updateMovementSessionState(state, state.currentDayKey, id, { typeId: 'jingang', durationMinutes: 30, note: '订正备注' })
    expect(one(state, 'movement').info?.note).toBe('订正备注')
    state = deleteMovementSessionState(state, state.currentDayKey, id)
    expect(timeline(state)).toHaveLength(0)
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(true)
  })
  it('strength notes survive partial completion changes and clear safely on explicit undo', () => {
    let state = fresh()
    const ids = state.library.exercises.filter((item) => !item.foundationId).slice(0, 2).map((item) => item.id)
    state = toggleStrengthExerciseState(state, ids[0], now)
    const event = one(state, 'strength')
    state = editRecord(state, state.currentDayKey, event, { ...eventInfo(event), note: '训练备注' })
    state = toggleStrengthExerciseState(state, ids[1], new Date(now.getTime() + 1000))
    expect(one(state, 'strength').id).toBe(event.id)
    expect(one(state, 'strength').info?.note).toBe('训练备注')
    state = toggleStrengthExerciseState(toggleStrengthExerciseState(state, ids[0], now), ids[1], now)
    expect(timeline(state)).toHaveLength(0)
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(true)
  })
  it('reserved ID collisions preserve originals and seed a deterministic separate default', () => {
    const old = JSON.parse(JSON.stringify(fresh()))
    old.version = 4; delete old.library.dominoBlocks
    old.library.habits = old.library.habits.filter((habit: {id:string}) => !habit.id.startsWith('domino-'))
    old.library.habits.push({ id: 'domino-faith', name: '我的其他习惯', category: '我的', enabled: true, showOnToday: true, note: '保留' })
    const state = restoreStoredState(old, now)
    expect(state.library.habits.find((habit) => habit.id === 'domino-faith')!.name).toBe('我的其他习惯')
    expect(block(state, '晨间多米诺').itemIds[0]).toBe('domino-faith-v31-1')
    expect(restoreStoredState(state, now)).toEqual(state)
  })
  it('legacy timestamps are labeled as recording time and are not invented occurrence measurements', () => {
    const state = fresh()
    state.today.completionTimesByHabitId.earlySleep = now.toISOString()
    const event = one(state, 'habit')
    expect(eventTimeLabel(event)).toContain('录入')
    expect(eventInfo(event)).toMatchObject({ occurredTime: null, precision: 'unknown', recordedAt: now.toISOString() })
  })
  it('date-only events do not render recording time as occurrence time', () => {
    const state = logDomino(fresh(), 'foot-soak', '2026-10-13', block(fresh(), '睡前多米诺'), now)
    const event = one(state, 'habit')
    expect(eventTimeLabel(event)).toBe('昨晚 · 时间未指定')
    expect(eventTimeLabel(event)).not.toContain('08:00')
  })
  it('notes and the daily journal survive navigation, refresh and rollover', async () => {
    let state = logDomino(fresh(), 'jingang', '2026-10-13', block(fresh(), '晨间多米诺'), now, { typeId: 'jingang', durationMinutes: 15 })
    const event = one(state, 'movement')
    state = editRecord(state, '2026-10-13', event, { ...eventInfo(event), note: '今天第三式比较熟练' })
    state = saveJournal(state, '2026-10-13', '晨间节律比较顺畅', now)
    const journal = one(state, 'journal')
    state = saveJournal(state, '2026-10-13', '修改后的随记', now, journal.id.replace('journal-', ''))
    expect(timeline(state).filter((item) => item.kind === 'journal')).toHaveLength(1)
    expect(await saveState(state)).toBe(true)
    const refreshed = await loadPersistedState(now)
    expect(timeline(refreshed.state).find((item) => item.kind === 'movement')!.info?.note).toBe('今天第三式比较熟练')
    const rolled = ensureCurrentDay(refreshed.state, new Date('2026-10-13T21:00:00Z'))
    expect(dayRecord(rolled, '2026-10-13').journals![0].text).toBe('修改后的随记')
    expect(timeline(rolled, '2026-10-13').find((item) => item.kind === 'movement')!.info?.note).toBe('今天第三式比较熟练')
    expect(rolled.today.journals).toBeUndefined()
  })
  it('backdated journal is associated with the selected date and can move without changing its ID', () => {
    let state = saveJournal(fresh(), '2026-10-11', '两天前的观察', now)
    const event = timeline(state, '2026-10-11')[0]
    state = editRecord(state, '2026-10-11', event, { ...eventInfo(event), assignedDate: '2026-10-12', note: '订正随记' })
    expect(timeline(state, '2026-10-11')).toHaveLength(0)
    expect(timeline(state, '2026-10-12')[0].id).toBe(event.id)
    expect(dayRecord(state, '2026-10-12').journals![0]).toMatchObject({ text: '订正随记', recordedAt: now.toISOString() })
  })
  it('export/import/restore retain every new field and existing record', async () => {
    let state = logDomino(fresh(), 'foot-soak', '2026-10-13', block(fresh(), '睡前多米诺'), now)
    state = editRecord(state, state.currentDayKey, one(state, 'habit'), { ...eventInfo(one(state, 'habit')), note: '水温合适' })
    state = saveJournal(state, '2026-10-11', '观察', now)
    const parsed = parseImportText(buildExportText(state, now), now)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(JSON.parse(JSON.stringify(parsed.state))).toEqual(JSON.parse(JSON.stringify(state)))
    const live = await loadPersistedState(now)
    expect(await replaceWithSafetyCopy(live.state, parsed.state, 'before-import', now, undefined, live.session)).toMatchObject({ ok: true })
    expect(JSON.parse(JSON.stringify((await loadPersistedState(now)).state))).toEqual(JSON.parse(JSON.stringify(state)))
  })
  it('second V3.1 tab cannot overwrite newer journals or notes', async () => {
    const first = await loadPersistedState(now), second = await loadPersistedState(now)
    const updated = saveJournal(first.state, '2026-10-13', '第一页面最新内容', now)
    expect(await saveState(updated, first.session)).toBe(true)
    const raw = data.get(V3_STORAGE_KEY)
    expect(await saveState(saveJournal(second.state, '2026-10-13', '陈旧页面', now), second.session)).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it.each(['2026-02-30', '2026-13-01', '2026-00-01', 'bad'])('rejects invalid date %s without changing data', (date) => {
    expect(validDay(date)).toBe(false)
    const state = fresh()
    expect(logDomino(state, 'foot-soak', date, block(state, '睡前多米诺'), now)).toBe(state)
  })
  it('rejects an inconsistent current-day history mirror instead of losing its newer records', async () => {
    const original = fresh()
    const raw = JSON.parse(JSON.stringify(original))
    raw.history[0].habitEvents.mindfulEating = [now.toISOString()]
    data.set(V3_STORAGE_KEY, JSON.stringify(raw))
    expect((await loadPersistedState(now)).canPersist).toBe(false)
    expect(data.get(V3_STORAGE_KEY)).toBe(JSON.stringify(raw))
    expect(parseImportText(JSON.stringify(raw), now).ok).toBe(false)
  })
  it('rejects malformed note/time fields on import instead of dropping them', () => {
    const state = logDomino(fresh(), 'foot-soak', '2026-10-13', block(fresh(), '睡前多米诺'), now)
    const event = one(state, 'habit')
    Object.assign(state.today.recordDetails![event.id], { precision: 'exact', occurredTime: null })
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(false)
  })
})
