/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { rolldown } from 'rolldown'
import legacyFixture from './fixtures/v2-save.json'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInitialState, shiftDayKey, fromDayKey, type AppState } from './domain'
import { ensureCurrentDay, loadPersistedState, saveState, buildTodayTimeline, buildHistorySummary, toggleRhythmState, endRhythmState, toggleBreathState, toggleStrengthExerciseState, toggleFoundationItemState, deleteMovementSessionState } from './state'
import { parseImportText, buildExportText, replaceWithSafetyCopy } from './dataTransfer'
import { listBackups } from './backupStore'
import { V3_STORAGE_KEY, V2_STORAGE_KEY } from './storageKeys'
import { dayRecord, dayAsState, logDomino, saveJournal, editRecord, eventTimeLabel } from './v31'
import { saveGroup, moveGroup, newGroupSession, logGroupItem, editGroupSession, findGroupSession, groupProgress, effectiveGroupInfo, itemStatistics, groupStatistics, recordGroupForDay, seedGroups, legacyDominoProgress, launchGroupItem, validateGroups, type GroupTemplate, type GroupRef } from './groups'

const now = new Date('2026-10-12T21:30:00Z') // Sydney 13 October 08:30.
const V31 = 'feff59340757c298aaa13e0bdb72df0f60804a40'
let prior: { loadPersistedState: typeof loadPersistedState; saveState: typeof saveState; toggleHabitState: typeof import('./state').toggleHabitState; replaceWithSafetyCopy: typeof replaceWithSafetyCopy }
let data: Map<string, string>, writes: string[], failWrite: string | null, failRead: string | null, wrongReadback: boolean
const priorTZ = process.env.TZ
beforeAll(async () => {
  process.env.TZ = 'Australia/Sydney'
  const root = path.join(mkdtempSync(path.join(tmpdir(), 'hr-real-v31-')), 'source'), bridge = path.join(root, 'bridge.ts')
  const output = path.join(path.dirname(root), 'v31.mjs'), repo = process.cwd()
  const build = await rolldown({ input: bridge, platform: 'node', plugins: [{ name: 'real-v31-source', resolveId(source, importer) {
    if (source === 'react') return path.join(repo, 'node_modules/react/index.js')
    if (source.startsWith(root)) return source
    if (importer?.startsWith(root) && source.startsWith('.')) return path.resolve(path.dirname(importer), source) + '.ts'
  }, load(id) {
    if (id === bridge) return "export * from './src/lib/state'; export * from './src/lib/dataTransfer'"
    if (id.startsWith(root)) return execFileSync('git', ['show', `${V31}:${path.relative(root, id)}`], { cwd: repo, encoding: 'utf8' })
  } }] })
  await build.write({ file: output, format: 'esm' }); await build.close()
  prior = await import(/* @vite-ignore */ pathToFileURL(output).href)
})
afterAll(() => { if (priorTZ === undefined) delete process.env.TZ; else process.env.TZ = priorTZ })
beforeEach(() => {
  data = new Map(); writes = []; failWrite = null; failRead = null; wrongReadback = false
  vi.stubGlobal('localStorage', { get length() { return data.size }, key: (index: number) => [...data.keys()][index] ?? null,
    getItem(key: string) { if (key === failRead) throw new Error('denied'); if (wrongReadback && key === V3_STORAGE_KEY && writes.includes(key)) return '{broken-readback}'; return data.get(key) ?? null },
    setItem(key: string, value: string) { if (key === failWrite || failWrite === 'backup' && key.includes('backup-')) throw new Error('quota'); writes.push(key); data.set(key, value) }, removeItem(key: string) { data.delete(key) },
  })
})
afterEach(() => vi.unstubAllGlobals())
const fresh = () => ensureCurrentDay(createInitialState(now), now)
const group = (state: AppState, id = 'domino-morning') => state.library.groups!.find((group) => group.id === id)!
const session = (state: AppState, id = 'domino-morning', day = state.currentDayKey) => dayRecord(state, day).groupSessions!.filter((entry) => entry.groupId === id).at(-1)!
const start = (state: AppState, id = 'domino-morning', day = state.currentDayKey) => newGroupSession(state, id, day, now)
const tick = (state: AppState, key: string, id = 'domino-morning', undo = false) => logGroupItem(state, session(state, id).id, key, now, undefined, undo)
const timeline = (state: AppState, day = state.currentDayKey) => buildTodayTimeline(dayAsState(state, day), state.library.habits, [])
const template = (items: GroupRef[] = [{ kind: 'habit', id: 'foot-soak' }]): GroupTemplate => ({ id: 'custom-group', name: '我的组合', items, assignment: 'manual', location: 'habit', hidden: false, enabled: true })

describe('universal templates and immutable session snapshots', () => {
  it('creates a mixed group with references and no cloned definitions', () => {
    const before = fresh(), items: GroupRef[] = [{ kind: 'habit', id: 'jingang' }, { kind: 'exercise', id: 'lowerAbs' }, { kind: 'routine', id: 'routine-a' }, { kind: 'rhythm', id: 'rhythm' }, { kind: 'breath', id: 'breath' }]
    const saved = saveGroup(before, template(items))
    expect(group(saved, 'custom-group').items).toEqual(items)
    expect(saved.library.habits).toBe(before.library.habits); expect(saved.library.exercises).toBe(before.library.exercises)
  })
  it('editing name/location/date rule/hide and item order preserves definitions', async () => {
    let state = saveGroup(fresh(), template())
    state = saveGroup(state, { ...group(state, 'custom-group'), name: '午间放松', location: 'breath', assignment: 'next-day-review', hidden: true, enabled: false, items: [{ kind: 'breath', id: 'breath' }, { kind: 'habit', id: 'foot-soak' }] })
    const loaded = await loadPersistedState(now)
    expect(await saveState(state, loaded.session)).toBe(true)
    expect(group((await loadPersistedState(now)).state, 'custom-group')).toEqual(group(state, 'custom-group'))
  })
  it('same activity belongs to multiple templates without moving or multiplying records', () => {
    const state = saveGroup(fresh(), template([{ kind: 'habit', id: 'jingang' }]))
    expect(group(state).items.some((ref) => ref.id === 'jingang')).toBe(true)
    expect(group(state, 'custom-group').items[0].id).toBe('jingang')
    expect(itemStatistics(state.history)).toHaveLength(0)
  })
  it('manual group ordering survives refresh', async () => {
    const state = moveGroup(fresh(), 'group-core-trio', -1), loaded = await loadPersistedState(now)
    await saveState(state, loaded.session)
    expect((await loadPersistedState(now)).state.library.groups).toEqual(state.library.groups)
  })
  it('old membership/name/prescriptions remain snapshotted after template edits', () => {
    let state = tick(start(fresh()), 'habit:domino-faith')
    const old = structuredClone(session(state))
    state = saveGroup(state, { ...group(state), name: '新版晨间', items: [...group(state).items, { kind: 'habit', id: 'yoga' }] })
    expect(session(state)).toEqual(old); expect(timeline(state)[0].summary).toBe('1/4')
    state = start(state); expect(session(state).items).toHaveLength(5)
  })
  it('removing/hiding a template item never deletes activity or session history', () => {
    let state = tick(start(fresh()), 'habit:domino-faith')
    const old = structuredClone(session(state))
    state = saveGroup(state, { ...group(state), hidden: true, items: [] })
    expect(session(state)).toEqual(old); expect(state.library.habits.some((item) => item.id === 'domino-faith')).toBe(true)
  })
  it('invalid and nested references cannot be saved', () => {
    const state = fresh()
    expect(saveGroup(state, template([{ kind: 'habit', id: 'missing' }]))).toBe(state)
    expect(saveGroup(state, template([{ kind: 'group', id: 'domino-morning' } as unknown as GroupRef]))).toBe(state)
  })
})
describe('autosaved executions and individual records', () => {
  it('the first tap creates one execution, following taps update it without a Save Group step', async () => {
    const loaded = await loadPersistedState(now)
    let state = recordGroupForDay(loaded.state, 'domino-morning', loaded.state.currentDayKey, null, 'habit:domino-faith', now)
    const id = session(state).id
    state = recordGroupForDay(state, 'domino-morning', state.currentDayKey, id, 'habit:domino-wuya', now)
    expect(state.today.groupSessions).toHaveLength(1); expect(groupProgress(session(state))).toBe(2)
    expect(await saveState(state, loaded.session)).toBe(true)
    expect(groupProgress(session((await loadPersistedState(now)).state))).toBe(2)
  })
  it('failed first selections cannot create phantom executions or target another group', () => {
    const state = fresh()
    expect(recordGroupForDay(state, 'missing', state.currentDayKey, null, 'habit:domino-faith', now)).toBe(state)
    expect(recordGroupForDay(state, 'domino-morning', state.currentDayKey, null, 'habit:jingang', now)).toBe(state)
    const existing = start(state, 'domino-bedtime')
    expect(recordGroupForDay(existing, 'domino-morning', existing.currentDayKey, session(existing, 'domino-bedtime').id, 'habit:foot-soak', now)).toBe(existing)
  })
  it('partial completion saves without a separate group finalize operation', async () => {
    const loaded = await loadPersistedState(now)
    const state = tick(start(loaded.state), 'habit:domino-faith')
    expect(await saveState(state, loaded.session)).toBe(true)
    const refreshed = (await loadPersistedState(now)).state
    expect(groupProgress(session(refreshed))).toBe(1); expect(timeline(refreshed)).toHaveLength(1)
    expect(dayRecord(refreshed, refreshed.currentDayKey).habitEvents['domino-faith']).toHaveLength(1)
  })
  it('unchecking updates the same execution and preserves independent completions', () => {
    let state = logDomino(fresh(), 'domino-faith', '2026-10-13', undefined, now)
    state = tick(start(state), 'habit:domino-faith'); const id = session(state).id
    state = tick(state, 'habit:domino-faith')
    expect(session(state).id).toBe(id); expect(groupProgress(session(state))).toBe(0)
    expect(state.today.completionTimesByHabitId['domino-faith']).toBe(now.toISOString())
    expect(state.today.eventsByHabitId['domino-faith']).toHaveLength(0)
  })
  it('repeated same-day executions stay separate with independent IDs and item counts', () => {
    let state = tick(start(fresh()), 'habit:domino-faith'); const first = session(state).id
    state = tick(start(state), 'habit:domino-faith')
    expect(session(state).id).not.toBe(first); expect(timeline(state)).toHaveLength(2)
    expect(groupStatistics(state.history)[0].sessions).toBe(2)
    expect(itemStatistics(state.history).find((item) => item.key === 'habit:domino-faith')!.count).toBe(2)
  })
  it('multiple captures remain multiple underlying events but one progress item', () => {
    let state = saveGroup(fresh(), template([{ kind: 'habit', id: 'mindfulEating' }]))
    state = tick(tick(start(state, 'custom-group'), 'habit:mindfulEating', 'custom-group'), 'habit:mindfulEating', 'custom-group')
    expect(groupProgress(session(state, 'custom-group'))).toBe(1)
    expect(state.today.eventsByHabitId.mindfulEating).toHaveLength(2); expect(timeline(state)).toHaveLength(1)
  })
  it('金刚功 retains duration, session ID, note and single item/movement counting', () => {
    let state = start(fresh()); const id = session(state).id
    state = logGroupItem(state, id, 'habit:jingang', now, { typeId: 'jingang', durationMinutes: 45, note: '第三式比较熟练' })
    expect(state.today.movementSessions).toHaveLength(1); expect(state.today.movementSessions[0].durationMinutes).toBe(45)
    expect(timeline(state)).toHaveLength(1); expect(timeline(state)[0].kind).toBe('group')
    const summary = buildHistorySummary(state.history, ['2026-10-13'], state.currentDayKey)
    expect(summary.movementSessionsCount).toBe(1); expect(summary.movementTotalMinutes).toBe(45)
    expect(summary.groups[0].sessions).toBe(1)
    expect(summary.items.find((item) => item.key === 'habit:jingang')!.count).toBe(1)
  })
  it('invalid duration cannot create a Boolean movement completion', () => {
    const state = start(fresh()), id = session(state).id
    expect(logGroupItem(state, id, 'habit:jingang', now)).toBe(state)
    expect(logGroupItem(state, id, 'habit:jingang', now, { typeId: 'jingang', durationMinutes: 0 })).toBe(state)
  })
  it('deleting a grouped movement safely removes its association', () => {
    let state = start(fresh())
    state = logGroupItem(state, session(state).id, 'habit:jingang', now, { typeId: 'jingang', durationMinutes: 30 })
    state = deleteMovementSessionState(state, state.currentDayKey, state.today.movementSessions[0].id)
    expect(groupProgress(session(state))).toBe(0); expect(() => validateGroups(state)).not.toThrow()
  })
  it('empty/fully undone executions are preserved but do not inflate performed counts', () => {
    let state = tick(start(fresh()), 'habit:domino-faith')
    state = tick(state, 'habit:domino-faith', 'domino-morning', true)
    expect(timeline(state)[0].summary).toBe('0/4'); expect(groupStatistics(state.history)).toHaveLength(0)
  })
})
describe('shared time and assigned local calendar dates', () => {
  it('bedtime defaults to previous evening with unknown time and actual recording time', () => {
    const state = tick(start(fresh(), 'domino-bedtime'), 'habit:foot-soak', 'domino-bedtime')
    expect(session(state, 'domino-bedtime').info).toMatchObject({ occurredDate: '2026-10-12', occurredTime: null, precision: 'unknown', assignedDate: '2026-10-13', recordedAt: now.toISOString() })
  })
  it.each([['2027-01-01', '2026-12-31'], ['2026-03-01', '2026-02-28'], ['2028-03-01', '2028-02-29'], ['2026-10-05', '2026-10-04'], ['2026-04-06', '2026-04-05']])('review %s derives calendar evening %s', (assigned, occurred) => {
    const date = fromDayKey(assigned), state = ensureCurrentDay(createInitialState(date), date)
    const saved = newGroupSession(state, 'domino-bedtime', assigned, date)
    expect(session(saved, 'domino-bedtime').info.occurredDate).toBe(occurred)
    expect(shiftDayKey(assigned, -1)).toBe(occurred)
  })
  it('Sydney DST nights span 23/25 hours without changing previous-day labels', () => {
    expect((fromDayKey('2026-10-04').getTime() - fromDayKey('2026-10-03').getTime()) / 3600000).toBe(23)
    expect((fromDayKey('2026-04-05').getTime() - fromDayKey('2026-04-04').getTime()) / 3600000).toBe(25)
  })
  it('manual/backdated execution never invents a precise time', () => {
    const state = start(saveGroup(fresh(), template()), 'custom-group', '2026-10-11')
    expect(session(state, 'custom-group', '2026-10-11').info).toMatchObject({ occurredTime: null, precision: 'unknown' })
  })
  it('one approximate occurrence time propagates to all items without rewriting recorded timestamps', () => {
    let state = tick(tick(start(fresh()), 'habit:domino-faith'), 'habit:domino-wuya')
    const before = structuredClone(state.today.eventsByHabitId), old = session(state)
    state = editGroupSession(state, old.id, { ...old.info, occurredTime: '08:15', precision: 'approximate', note: '节律很好', recordedAt: '2000-01-01T00:00:00Z' })
    for (const completion of session(state).completed) expect(effectiveGroupInfo(dayRecord(state, state.currentDayKey), completion.eventIds[0])).toMatchObject({ occurredTime: '08:15', precision: 'approximate' })
    expect(session(state).info.recordedAt).toBe(now.toISOString()); expect(state.today.eventsByHabitId).toEqual(before)
    expect(timeline(state)[0].info!.note).toBe('节律很好')
  })
  it('shared occurrence edits preserve each child actual recording moment separately', () => {
    let state = tick(start(fresh()), 'habit:domino-faith')
    const later = new Date(now.getTime() + 180000)
    state = logGroupItem(state, session(state).id, 'habit:domino-wuya', later)
    const id = session(state).completed[1].eventIds[0]
    state = editGroupSession(state, session(state).id, { ...session(state).info, occurredTime: '07:45', precision: 'approximate' })
    expect(effectiveGroupInfo(dayRecord(state, state.currentDayKey), id)).toMatchObject({ occurredTime: '07:45', recordedAt: later.toISOString() })
    expect(session(state).info.recordedAt).toBe(now.toISOString())
  })
  it('explicit item overrides survive a shared-time edit', () => {
    let state = tick(start(fresh()), 'habit:domino-faith'); const old = session(state)
    const record = dayRecord(state, state.currentDayKey), eventId = old.completed[0].eventIds[0]
    state.today.recordDetails = { [eventId]: { ...old.info, occurredTime: '07:00', precision: 'exact', note: '单项备注' } }
    state.history = state.history.map((day) => day.dayKey === record.dayKey ? { ...day, recordDetails: state.today.recordDetails } : day)
    state = editGroupSession(state, old.id, { ...old.info, occurredTime: '08:00', precision: 'approximate' })
    expect(effectiveGroupInfo(dayRecord(state, state.currentDayKey), eventId)!.occurredTime).toBe('07:00')
  })
  it('editing assigned date moves session and child records atomically preserving IDs', () => {
    let state = tick(start(fresh()), 'habit:domino-faith'); const old = structuredClone(session(state))
    state = editGroupSession(state, old.id, { ...old.info, occurredDate: '2026-10-11', occurredTime: null, precision: 'unknown', assignedDate: '2026-10-12' })
    expect(timeline(state)).toHaveLength(0); expect(timeline(state, '2026-10-12')[0].id).toBe(`group-${old.id}`)
    expect(findGroupSession(state, old.id)!.record.dayKey).toBe('2026-10-12')
    expect(dayRecord(state, '2026-10-12').captureIds!['domino-faith']).toEqual(old.completed[0].eventIds)
    expect(() => validateGroups(state)).not.toThrow()
  })
  it('manual previous-day occurrences are not mislabeled as last night and policy snapshots remain historical', () => {
    let state = tick(start(saveGroup(fresh(), template()), 'custom-group'), 'habit:foot-soak', 'custom-group')
    state = editGroupSession(state, session(state, 'custom-group').id, { ...session(state, 'custom-group').info, occurredDate: '2026-10-12', occurredTime: '08:30', precision: 'approximate' })
    expect(eventTimeLabel(timeline(state)[0])).toBe('10/12 · 约 08:30')
    state = saveGroup(state, { ...group(state, 'custom-group'), assignment: 'next-day-review' })
    expect(session(state, 'custom-group').assignment).toBe('manual')
    expect(eventTimeLabel(timeline(state)[0])).toBe('10/12 · 约 08:30')
  })
  it('known occurrence ordering wins over recordedAt, unknown times sort last within occurrence date', () => {
    let state = tick(start(fresh()), 'habit:domino-faith'); const first = session(state).id
    state = editGroupSession(state, first, { ...session(state).info, occurredTime: '10:00', precision: 'exact' })
    state = tick(start(state), 'habit:domino-faith'); const second = session(state).id
    state = editGroupSession(state, second, { ...session(state).info, occurredTime: '07:00', precision: 'approximate' })
    state = tick(start(state), 'habit:domino-faith'); const third = session(state).id
    state = editGroupSession(state, third, { ...session(state).info, occurredTime: null, precision: 'unknown' })
    expect(timeline(state).map((entry) => entry.id)).toEqual([`group-${second}`, `group-${first}`, `group-${third}`])
  })
})
describe('Core Trio and real specialised workflows', () => {
  it('Core Trio reuses exactly the three existing definitions and supports 2/3', () => {
    const original = fresh(); let state = start(original, 'group-core-trio')
    expect(group(state, 'group-core-trio').items.map((item) => item.id)).toEqual(['lowerAbs', 'lowerBack', 'pelvicFloor'])
    state = tick(tick(state, 'exercise:lowerAbs', 'group-core-trio'), 'exercise:lowerBack', 'group-core-trio')
    expect(groupProgress(session(state, 'group-core-trio'))).toBe(2)
    expect(state.library.exercises).toBe(original.library.exercises); expect(state.today.foundationCompletedAt).toEqual({})
    expect(buildHistorySummary(state.history, [state.currentDayKey]).strengthCompletionsCount).toBe(2)
    expect(timeline(state)[0].summary).toBe('2/3')
  })
  it('full Core Trio counts three exercise completions and two explicit executions count six, never an extra group item', () => {
    let state = start(fresh(), 'group-core-trio')
    for (const id of ['lowerAbs', 'lowerBack', 'pelvicFloor']) state = tick(state, `exercise:${id}`, 'group-core-trio')
    expect(groupProgress(session(state, 'group-core-trio'))).toBe(3)
    expect(buildHistorySummary(state.history, [state.currentDayKey]).strengthCompletionsCount).toBe(3)
    state = start(state, 'group-core-trio')
    for (const id of ['lowerAbs', 'lowerBack', 'pelvicFloor']) state = tick(state, `exercise:${id}`, 'group-core-trio')
    const summary = buildHistorySummary(state.history, [state.currentDayKey])
    expect(summary.strengthCompletionsCount).toBe(6); expect(summary.groups[0].sessions).toBe(2)
    expect(summary.items.find((item) => item.key === 'exercise:pelvicFloor')!.count).toBe(2)
    expect(summary.foundationDaysById.pelvicFloor).toBe(1)
  })
  it('full routine completion retains per-exercise frequencies and one routine frequency without adding a training item', () => {
    let state = start(saveGroup(fresh(), template([{ kind: 'routine', id: 'routine-a' }])), 'custom-group')
    const snapshots = session(state, 'custom-group').items[0].exercises!
    state = launchGroupItem(state, session(state, 'custom-group').id, 'routine:routine-a')
    for (const exercise of snapshots) state = toggleStrengthExerciseState(state, exercise.id, now)
    expect(groupProgress(session(state, 'custom-group'))).toBe(1)
    expect(buildHistorySummary(state.history, [state.currentDayKey]).strengthCompletionsCount).toBe(snapshots.length)
    expect(itemStatistics(state.history).find((item) => item.key === 'routine:routine-a')!.count).toBe(1)
    expect(timeline(state)).toHaveLength(1)
  })
  it('foundation history and current independent records remain intact on group undo', () => {
    let state = toggleFoundationItemState(fresh(), 'lowerAbs', now)
    state = tick(start(state, 'group-core-trio'), 'exercise:lowerAbs', 'group-core-trio')
    state = tick(state, 'exercise:lowerAbs', 'group-core-trio')
    expect(state.today.foundationCompletedAt.lowerAbs).toBe(now.toISOString()); expect(timeline(state).some((entry) => entry.id === 'foundation-lowerAbs')).toBe(true)
  })
  it('exercise prescription snapshots survive later library edits', () => {
    let state = fresh(); const exercise = state.library.exercises.find((item) => item.id === 'lowerAbs')!
    exercise.suggestedSets = '3组'; exercise.suggestedVolume = '12次'; exercise.estimatedTime = '2分钟'
    state = tick(start(state, 'group-core-trio'), 'exercise:lowerAbs', 'group-core-trio')
    state.library.exercises = state.library.exercises.map((item) => item.id === 'lowerAbs' ? { ...item, suggestedVolume: '20次' } : item)
    expect(state.today.strengthEntries![0].exercise).toMatchObject({ sets: '3组', volume: '12次', duration: '2分钟' })
  })
  it('a routine links to the existing Strength workflow and records individual partial exercises', () => {
    let state = start(saveGroup(fresh(), template([{ kind: 'routine', id: 'routine-a' }])), 'custom-group')
    state = launchGroupItem(state, session(state, 'custom-group').id, 'routine:routine-a')
    expect(state.selectedTab).toBe('strength')
    const exercise = session(state, 'custom-group').items[0].exercises![0].id
    state = toggleStrengthExerciseState(state, exercise, now)
    expect(state.today.strengthEntries).toHaveLength(1); expect(state.strength.completedExerciseIds).toHaveLength(0)
    expect(groupProgress(session(state, 'custom-group'))).toBe(0)
    expect(timeline(state)[0].summary).toBe('0/1'); expect(buildHistorySummary(state.history, [state.currentDayKey]).strengthCompletionsCount).toBe(1)
    state = toggleStrengthExerciseState(state, exercise, now)
    expect(state.today.strengthEntries).toHaveLength(0)
  })
  it('overlapping exercise/routine membership associates one actual strength record', () => {
    let state = fresh(); const exercise = state.strength.routines[0].exercises[0].exerciseId
    state = start(saveGroup(state, template([{ kind: 'exercise', id: exercise }, { kind: 'routine', id: 'routine-a' }])), 'custom-group')
    state = tick(state, `exercise:${exercise}`, 'custom-group')
    state = logGroupItem(state, session(state, 'custom-group').id, 'routine:routine-a', now, undefined, false, exercise)
    expect(state.today.strengthEntries).toHaveLength(1); expect(() => validateGroups(state)).not.toThrow()
    state = tick(state, `exercise:${exercise}`, 'custom-group', true)
    expect(state.today.strengthEntries).toHaveLength(1)
    state = tick(state, 'routine:routine-a', 'custom-group', true); expect(state.today.strengthEntries).toHaveLength(0)
  })
  it('Rhythm uses its actual timer and separate same-day executions cannot merge', () => {
    let state = start(saveGroup(fresh(), template([{ kind: 'rhythm', id: 'rhythm' }])), 'custom-group')
    state = launchGroupItem(state, session(state, 'custom-group').id, 'rhythm:rhythm')
    state = endRhythmState(toggleRhythmState(state, now), new Date(now.getTime() + 61000))
    expect(state.today.groupSessions![0].completed[0].eventIds).toEqual([`rhythm-${state.rhythm.entriesToday[0].id}`])
    expect(state.rhythm.entriesToday[0].durationSeconds).toBe(61); expect(timeline(state)).toHaveLength(1)
    const next = new Date(now.getTime() + 120000)
    state = newGroupSession(state, 'custom-group', state.currentDayKey, next)
    state = launchGroupItem(state, session(state, 'custom-group').id, 'rhythm:rhythm')
    state = endRhythmState(toggleRhythmState(state, next), new Date(next.getTime() + 61000))
    expect(state.rhythm.entriesToday).toHaveLength(2); expect(timeline(state)).toHaveLength(2)
    expect(() => validateGroups(state)).not.toThrow()
  })
  it('an independent rhythm after a grouped timer cannot merge into its child record', () => {
    let state = start(saveGroup(fresh(), template([{ kind: 'rhythm', id: 'rhythm' }])), 'custom-group')
    state = launchGroupItem(state, session(state, 'custom-group').id, 'rhythm:rhythm')
    state = endRhythmState(toggleRhythmState(state, now), new Date(now.getTime() + 61000))
    const next = new Date(now.getTime() + 120000)
    state = endRhythmState(toggleRhythmState(state, next), new Date(next.getTime() + 61000))
    expect(state.rhythm.entriesToday).toHaveLength(2); expect(timeline(state).map((entry) => entry.kind).sort()).toEqual(['group', 'rhythm'])
  })
  it('Breath keeps its pattern, rounds and countdown and associates exactly one real session', () => {
    let state = start(saveGroup(fresh(), template([{ kind: 'breath', id: 'breath' }])), 'custom-group')
    state = launchGroupItem(state, session(state, 'custom-group').id, 'breath:breath')
    state = { ...state, breath: { ...state.breath, selectedRounds: 3 } }
    state = ensureCurrentDay(toggleBreathState(state, now), new Date(now.getTime() + 60000))
    expect(state.breath.entriesToday).toHaveLength(1); expect(state.breath.entriesToday[0].completedRounds).toBe(3)
    expect(state.breath.entriesToday[0].pattern).toEqual({ inhale: 4, hold: 7, exhale: 8, endHold: 0 })
    expect(groupProgress(session(state, 'custom-group'))).toBe(1); expect(timeline(state)).toHaveLength(1)
  })
  it('running timers cannot be hijacked by another group', () => {
    const state = toggleRhythmState(start(saveGroup(fresh(), template([{ kind: 'breath', id: 'breath' }])), 'custom-group'), now)
    expect(launchGroupItem(state, session(state, 'custom-group').id, 'breath:breath')).toBe(state)
  })
})
describe('schema 5 migration, REAL prior loaders and safe persistence', () => {
  it('migrates actual V3.1 custom Domino definitions idempotently without inventing historical sessions', async () => {
    const old = await prior.loadPersistedState(now)
    old.state.library.dominoBlocks![0].name = '自定晨间'; old.state.library.dominoBlocks![0].itemIds.reverse(); old.state.library.dominoBlocks![0].hidden = true
    const withCapture = prior.toggleHabitState(old.state, 'mindfulEating', now)
    expect(await prior.saveState(withCapture, old.session)).toBe(true)
    const raw = data.get(V3_STORAGE_KEY)!, loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(true); expect(loaded.state.version).toBe(6)
    expect(group(loaded.state).name).toBe('自定晨间'); expect(group(loaded.state).items.map((ref) => ref.id)).toEqual(withCapture.library.dominoBlocks![0].itemIds)
    expect(loaded.state.today).toMatchObject(withCapture.today); expect(loaded.state.strength).toEqual(withCapture.strength)
    expect(loaded.state.library.exercises).toEqual(withCapture.library.exercises); expect(loaded.state.library.habits).toEqual(withCapture.library.habits)
    expect(loaded.state.today.groupSessions).toBeUndefined()
    expect(listBackups().some((backup) => backup.raw === raw && backup.meta?.reason === 'before-migration')).toBe(true)
    const count = listBackups().length
    expect(seedGroups(loaded.state)).toEqual(loaded.state)
    expect((await loadPersistedState(now)).state.library.groups).toEqual(loaded.state.library.groups); expect(listBackups()).toHaveLength(count)
    expect(data.has(V2_STORAGE_KEY)).toBe(false)
  })
  it('rich actual schema 5 source preserves every existing health record, definition, timestamp and note', async () => {
    const v2raw = JSON.stringify(legacyFixture)
    data.set(V2_STORAGE_KEY, v2raw)
    const old = await prior.loadPersistedState(now)
    expect(old.canPersist).toBe(true)
    const saved = prior.toggleHabitState(old.state, 'mindfulEating', now)
    expect(await prior.saveState(saved, old.session)).toBe(true)
    const raw5 = data.get(V3_STORAGE_KEY)!
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(true)
    for (const field of ['today', 'history', 'rhythm', 'breath', 'strength'] as const) expect(loaded.state[field]).toEqual(saved[field])
    expect(loaded.state.library.habits).toEqual(saved.library.habits)
    expect(loaded.state.library.exercises).toEqual(saved.library.exercises)
    expect(loaded.state.library.dominoBlocks).toEqual(saved.library.dominoBlocks)
    expect(data.get(V2_STORAGE_KEY)).toBe(v2raw)
    expect(listBackups().some((backup) => backup.raw === raw5)).toBe(true)
    expect(parseImportText(raw5, now).ok).toBe(true)
  })
  it('REAL already-open V3.1 cannot overwrite groups or subsequent records, and fresh old V3.1 refuses schema 6', async () => {
    const old = await prior.loadPersistedState(now), loaded = await loadPersistedState(now)
    let state = tick(start(loaded.state), 'habit:domino-faith')
    expect(await saveState(state, loaded.session)).toBe(true)
    let raw = data.get(V3_STORAGE_KEY)
    expect(await prior.saveState(old.state, old.session)).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    state = tick(state, 'habit:domino-wuya'); expect(await saveState(state, loaded.session)).toBe(true); raw = data.get(V3_STORAGE_KEY)
    expect(await prior.saveState(old.state, old.session)).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    const reopened = await prior.loadPersistedState(now)
    expect(reopened.canPersist).toBe(false); expect(await prior.saveState(reopened.state, reopened.session)).toBe(false)
    expect(await prior.replaceWithSafetyCopy(reopened.state, old.state, 'before-import', now, undefined, reopened.session)).toMatchObject({ ok: false })
    expect(data.get(V3_STORAGE_KEY)).toBe(raw); expect(timeline((await loadPersistedState(now)).state)[0].summary).toBe('2/4')
  })
  it('backup failure blocks migration and all later unsafe writes', async () => {
    await prior.loadPersistedState(now); const raw = data.get(V3_STORAGE_KEY); failWrite = 'backup'
    const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false); expect(await saveState(loaded.state, loaded.session)).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('read failure cannot bootstrap writable empty data', async () => {
    failRead = V3_STORAGE_KEY; const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false); expect(writes).not.toContain(V3_STORAGE_KEY)
  })
  it('write failure preserves actual schema 5 bytes and backup', async () => {
    await prior.loadPersistedState(now); const raw = data.get(V3_STORAGE_KEY); failWrite = V3_STORAGE_KEY
    expect((await loadPersistedState(now)).canPersist).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    expect(listBackups().some((backup) => backup.raw === raw)).toBe(true)
  })
  it('readback corruption blocks further persistence', async () => {
    wrongReadback = true; const loaded = await loadPersistedState(now)
    expect(loaded.canPersist).toBe(false); const raw = data.get(V3_STORAGE_KEY)
    expect(await saveState(loaded.state, loaded.session)).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('a second V3.2 tab cannot overwrite newer session changes', async () => {
    const a = await loadPersistedState(now), b = await loadPersistedState(now)
    expect(await saveState(tick(start(a.state), 'habit:domino-faith'), a.session)).toBe(true)
    const raw = data.get(V3_STORAGE_KEY)
    expect(await saveState(tick(start(b.state), 'habit:domino-wuya'), b.session)).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
  })
  it('JSON export/import/restore includes all templates, snapshots, child records, shared info and journals', async () => {
    const loaded = await loadPersistedState(now); let state = tick(start(loaded.state), 'habit:domino-faith')
    state = tick(start(state, 'group-core-trio'), 'exercise:pelvicFloor', 'group-core-trio')
    state = editGroupSession(state, session(state).id, { ...session(state).info, occurredTime: null, precision: 'unknown', note: '今日节律很好' })
    state = saveJournal(state, '2026-10-11', '两日前的观察', now)
    expect(await saveState(state, loaded.session)).toBe(true)
    const parsed = parseImportText(buildExportText(state, now), now)
    expect(parsed.ok).toBe(true); if (!parsed.ok) throw new Error(parsed.error)
    expect(JSON.parse(JSON.stringify(parsed.state))).toEqual(JSON.parse(JSON.stringify(state)))
    const live = await loadPersistedState(now)
    expect(await replaceWithSafetyCopy(live.state, parsed.state, 'before-import', now, undefined, live.session)).toMatchObject({ ok: true })
    expect(JSON.parse(JSON.stringify((await loadPersistedState(now)).state))).toEqual(JSON.parse(JSON.stringify(state)))
  })
  it('corrupt schema 6 is authoritative and never replaced by older V2 data', async () => {
    data.set(V3_STORAGE_KEY, '{recoverable-groups}'); data.set(V2_STORAGE_KEY, JSON.stringify(fresh()))
    expect((await loadPersistedState(now)).canPersist).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe('{recoverable-groups}')
  })
  it('unknown newer versions fail closed with original bytes preserved', async () => {
    const raw = JSON.stringify({ ...fresh(), version: 7 }); data.set(V3_STORAGE_KEY, raw)
    expect((await loadPersistedState(now)).canPersist).toBe(false); expect(data.get(V3_STORAGE_KEY)).toBe(raw)
    expect(parseImportText(raw, now).ok).toBe(false)
  })
  it('malformed session references are rejected before import/load synchronization', () => {
    const state = tick(start(fresh()), 'habit:domino-faith')
    state.today.groupSessions![0].completed[0].eventIds[0] = 'missing-capture'
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(false)
  })
  it('inconsistent current-day group mirror cannot discard newer sessions', () => {
    const state = tick(start(fresh()), 'habit:domino-faith')
    state.history[0] = { ...state.history[0], groupSessions: [] }
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(false)
  })
  it('deliberately empty template lists stay empty after refresh', () => {
    const state = fresh(); state.library.groups = []
    expect(seedGroups(state).library.groups).toEqual([])
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(true)
  })
  it('legacy Domino progress stays visible as independent records without fabricated sessions', () => {
    let state = fresh()
    state = logDomino(state, 'domino-faith', state.currentDayKey, state.library.dominoBlocks![0], now)
    expect(legacyDominoProgress(dayRecord(state, state.currentDayKey), 'domino-morning')).toEqual({ completed: 1, total: 4 })
    state = tick(start(state), 'habit:domino-wuya')
    expect(legacyDominoProgress(dayRecord(state, state.currentDayKey), 'domino-morning')).toEqual({ completed: 1, total: 4 })
    expect(timeline(state).map((event) => event.kind).sort()).toEqual(['group', 'habit'])
  })
  it('backdated mixed executions move all records together and round-trip with stable IDs', () => {
    let state = saveGroup(fresh(), template([{ kind: 'habit', id: 'jingang' }, { kind: 'exercise', id: 'lowerAbs' }, { kind: 'habit', id: 'earlySleep' }]))
    state = start(state, 'custom-group')
    const id = session(state, 'custom-group').id
    state = logGroupItem(state, id, 'habit:jingang', now, { typeId: 'jingang', durationMinutes: 15 })
    state = logGroupItem(state, id, 'exercise:lowerAbs', now)
    state = logGroupItem(state, id, 'habit:earlySleep', now)
    const owned = session(state, 'custom-group').completed.flatMap((entry) => entry.eventIds)
    state = editGroupSession(state, id, { ...session(state, 'custom-group').info, assignedDate: '2026-10-11', occurredDate: '2026-10-10', occurredTime: null, precision: 'unknown' })
    const record = dayRecord(state, '2026-10-11')
    expect(record.groupSessions![0].completed.flatMap((entry) => entry.eventIds)).toEqual(owned)
    expect(record.movementSessions[0].durationMinutes).toBe(15); expect(record.strengthEntries).toHaveLength(1)
    const parsed = parseImportText(buildExportText(state, now), now)
    expect(parsed.ok).toBe(true); expect(timeline(state)).toHaveLength(0); expect(timeline(state, '2026-10-11')).toHaveLength(1)
    expect(buildHistorySummary(state.history, ['2026-10-11']).items.find((item) => item.key === 'habit:earlySleep')!.count).toBe(1)
  })
  it('real timers can finish a backdated group without attributing measured session time to the review morning', () => {
    let state = newGroupSession(saveGroup(fresh(), template([{ kind: 'rhythm', id: 'rhythm' }])), 'custom-group', '2026-10-11', now)
    const id = session(state, 'custom-group', '2026-10-11').id
    state = launchGroupItem(state, id, 'rhythm:rhythm')
    state = endRhythmState(toggleRhythmState(state, now), new Date(now.getTime() + 61000))
    expect(state.rhythm.entriesToday).toHaveLength(0)
    const record = dayRecord(state, '2026-10-11')
    expect(record.rhythmEntries).toHaveLength(1); expect(record.rhythmEntries[0].startAt).toBe(now.toISOString())
    expect(record.groupSessions![0].info.occurredTime).toBeNull()
    expect(timeline(state, '2026-10-11')).toHaveLength(1); expect(() => validateGroups(state)).not.toThrow()
  })
  it('individual item edits cannot split an owned record across assigned dates', () => {
    const state = tick(start(fresh()), 'habit:domino-faith'), original = session(state)
    const id = original.completed[0].eventIds[0]
    const event = { id, title: '虔信时刻', kind: 'habit' as const, timestamp: now.toISOString(), assignedDate: state.currentDayKey, summary: '已完成', info: original.info }
    expect(editRecord(state, state.currentDayKey, event, { ...original.info, assignedDate: '2026-10-11' })).toBe(state)
    const changed = editRecord(state, state.currentDayKey, event, { ...original.info, occurredTime: '07:00', precision: 'exact', note: '单项备注' })
    expect(effectiveGroupInfo(dayRecord(changed, changed.currentDayKey), id)!.occurredTime).toBe('07:00')
    expect(() => validateGroups(changed)).not.toThrow()
  })
  it('duplicate strength IDs or ownership across distinct sessions fail import instead of multiplying counts', () => {
    let state = tick(start(fresh(), 'group-core-trio'), 'exercise:lowerAbs', 'group-core-trio')
    state = newGroupSession(state, 'group-core-trio', state.currentDayKey, now)
    const record = state.today.groupSessions!
    record[1].completed = structuredClone(record[0].completed)
    expect(parseImportText(JSON.stringify(state), now).ok).toBe(false)
    const duplicated = tick(start(fresh(), 'group-core-trio'), 'exercise:lowerAbs', 'group-core-trio')
    duplicated.today.strengthEntries!.push(structuredClone(duplicated.today.strengthEntries![0]))
    expect(parseImportText(JSON.stringify(duplicated), now).ok).toBe(false)
  })
  it('day rollover preserves past group snapshots and starts today independently', () => {
    const state = tick(start(fresh()), 'habit:domino-faith'), old = session(state)
    const tomorrow = ensureCurrentDay(state, new Date('2026-10-13T21:30:00Z'))
    expect(dayRecord(tomorrow, '2026-10-13').groupSessions![0]).toEqual(old); expect(tomorrow.today.groupSessions).toBeUndefined()
  })
})
