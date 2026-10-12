import v2Fixture from './fixtures/v2-save.json'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExportText, parseImportText } from './dataTransfer'
import { listBackups, pruneSafetyCopies } from './backupStore'
import { createInitialState, FOUNDATION_ITEMS, formatDurationMinutes, type AppState, type HabitDefinition } from './domain'
import { addMovementSessionState, buildDailyHistorySummary, buildHistorySummary, buildTodayTimeline, ensureCurrentDay, loadPersistedState, restoreStoredState, saveState, toggleHabitState, toggleStrengthExerciseState, resolveStrengthRoutines } from './state'
import { completedHabitIds, coreExercises, habitMode, moveHabit, exercisePrescription } from './v3'
import { resetStorageStatus } from './storageStatus'

const now = new Date(2026, 3, 15, 12)
const tomorrow = new Date(2026, 3, 16, 8)
const key = 'health-rhythm-web-v2'
// Synthetic fixture generated from e5a514e's actual V2 defaults; contains no personal data.
const v2 = () => JSON.parse(JSON.stringify(v2Fixture))
let storage: Map<string, string>
beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    get length() { return storage.size }, key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (id: string) => storage.get(id) ?? null,
    setItem: (id: string, value: string) => { storage.set(id, value) },
    removeItem: (id: string) => { storage.delete(id) },
  })
  resetStorageStatus()
})
afterEach(() => vi.unstubAllGlobals())
const fresh = () => ensureCurrentDay(createInitialState(now), now)
const habit = (state: AppState, id: string) => state.library.habits.find((item) => item.id === id)!

describe('V3 safe migration', () => {
  it('preserves V2 records, IDs, custom text, routines, and leading item order', () => {
    const old = v2()
    const state = restoreStoredState(old, now)
    expect(state.version).toBe(5)
    expect(state.today).toMatchObject(old.today)
    expect(state.strength.completedExerciseIds).toEqual(old.strength.completedExerciseIds)
    expect(state.library.habits.slice(0, old.library.habits.length).map((item) => item.id)).toEqual(old.library.habits.map((item: HabitDefinition) => item.id))
    expect(habit(state, 'custom-habit-existing')).toEqual(old.library.habits[0])
    expect(habit(state, 'earlySleep').name).toBe('我的早睡')
    expect(state.library.exercises[0].suggestedVolume).toBe('我自己的次数')
    expect(state.strength.routines.find((routine) => routine.id === 'custom-routine-existing')).toEqual(old.strength.routines.at(-1))
    expect(state.history.find((record) => record.dayKey === '2026-04-14')).toEqual({ ...old.history[0], habitEvents: {} })
    expect(habit(state, 'mindfulEating').name).toBe('正念饮食')
    expect(restoreStoredState(state, now)).toEqual(state)
  })
  it.each([1, 2])('keeps custom libraries even when a legacy save reports version %i', (version) => {
    const old = v2(); old.version = version
    delete old.strength.routines
    const state = restoreStoredState(old, now)
    expect(habit(state, 'custom-habit-existing').name).toBe('我的习惯')
    expect(state.library.exercises.some((item) => item.id === 'custom-exercise-existing')).toBe(true)
    expect(state.strength.routines).toHaveLength(2)
  })
  it('does not translate customised built-in names that happen to match another shipped name', () => {
    const old = v2(); old.library.habits.find((item: HabitDefinition) => item.id === 'mindfulEating').name = 'Walking'
    expect(habit(restoreStoredState(old, now), 'mindfulEating').name).toBe('Walking')
  })
  it('saves the original bytes once before migration and retains them through backup pruning', async () => {
    const raw = JSON.stringify(v2()); storage.set(key, raw)
    await loadPersistedState(now); await loadPersistedState(now)
    expect(storage.get(key)).toBe(raw)
    expect(listBackups()).toHaveLength(1)
    expect(listBackups()[0].raw).toBe(raw)
    expect(listBackups()[0].meta?.reason).toBe('before-migration')
    pruneSafetyCopies(0, [])
    expect(listBackups()[0].raw).toBe(raw)
  })
  it('blocks persistence if a migration safety copy cannot be saved', async () => {
    const raw = JSON.stringify(v2()); storage.set(key, raw)
    vi.stubGlobal('localStorage', { getItem: (id: string) => storage.get(id) ?? null, setItem: () => { throw new Error('quota') } })
    const loaded = await loadPersistedState(now)
    expect(loaded.state.today.movementSessions[0].id).toBe('v2-movement-existing')
    expect(loaded.canPersist).toBe(false)
    expect(storage.get(key)).toBe(raw)
  })
  it('does not write over a newer schema', async () => {
    const future = v2(); future.version = 99; const raw = JSON.stringify(future); storage.set(key, raw)
    expect((await loadPersistedState(now)).canPersist).toBe(false)
    expect(storage.get(key)).toBe(raw)
  })
  it('preserves names edited back to English after migration', () => {
    const state = fresh()
    habit(state, 'mindfulEating').name = 'Mindful eating'
    expect(habit(restoreStoredState(state, now), 'mindfulEating').name).toBe('Mindful eating')
  })
  it.each(['group', 'recordingMode', 'frequency'] as const)('rejects invalid imported habit %s metadata', (field) => {
    const state = fresh()
    const invalid = JSON.parse(JSON.stringify(state))
    invalid.library.habits[0][field] = 'invalid-value'
    expect(parseImportText(JSON.stringify(invalid), now).ok).toBe(false)
  })
  it('gives new users Chinese habits, duration activities and the actual foundation definitions', () => {
    const state = fresh()
    expect(state.selectedTab).toBe('today')
    for (const id of ['jingang', 'walking', 'swimming', 'yoga', 'zumba', 'pilates']) {
      expect(habitMode(habit(state, id))).toBe('duration')
      expect(habit(state, id).showOnToday).toBe(true)
    }
    expect(coreExercises(state.library.exercises).map((exercise) => exercise.id)).toEqual(FOUNDATION_ITEMS.map((item) => item.id))
    expect(new Set(state.library.habits.map((item) => item.id)).size).toBe(state.library.habits.length)
  })
})

describe('V3 persistence and logging', () => {
  it('persists within-group ordering, group moves, frequency and visibility through refresh', async () => {
    let state = fresh()
    state = { ...state, library: { ...state.library, habits: moveHabit(state.library.habits, 'earlySleep', 'up') } }
    state.library.habits = state.library.habits.map((item) => item.id === 'walking' ? { ...item, group: '其他活动', frequency: 'weekly', showOnToday: false } : item)
    const ids = state.library.habits.map((item) => item.id)
    await saveState(state)
    const loaded = (await loadPersistedState(now)).state
    expect(loaded.library.habits.map((item) => item.id)).toEqual(ids)
    expect(ids.indexOf('earlySleep')).toBeLessThan(ids.indexOf('mindfulEating'))
    expect(habit(loaded, 'walking')).toMatchObject({ group: '其他活动', frequency: 'weekly', showOnToday: false })
  })
  it('supports custom multi-capture habits across navigation, refresh, midnight and export/import', async () => {
    let state = fresh()
    state.library.habits.push({ id: 'custom-capture', name: '自定义记录', category: '', note: '', enabled: true, showOnToday: true, recordingMode: 'captures' })
    for (let i = 0; i < 3; i++) state = toggleHabitState(state, 'custom-capture', new Date(now.getTime() + i * 1000))
    state.selectedTab = 'history'; await saveState(state)
    state = (await loadPersistedState(now)).state
    expect(state.today.eventsByHabitId['custom-capture']).toHaveLength(3)
    expect(completedHabitIds(state.today.completionTimesByHabitId, state.today.eventsByHabitId)).toEqual(['custom-capture'])
    state = ensureCurrentDay(state, tomorrow)
    const record = state.history.find((day) => day.dayKey === '2026-04-15')!
    expect(record.habitEvents['custom-capture']).toHaveLength(3)
    expect(state.today.eventsByHabitId).toEqual({})
    expect(buildDailyHistorySummary(record, []).habitRecords).toContainEqual({ id: 'custom-capture', captures: 3, completed: false })
    const result = parseImportText(buildExportText(state, tomorrow), tomorrow)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state).toEqual(state)
  })
  it('keeps captures in the timeline after hiding an item or changing its recording mode', () => {
    const state = toggleHabitState(fresh(), 'mindfulEating', now)
    state.library.habits = state.library.habits.map((item) => item.id === 'mindfulEating' ? { ...item, showOnToday: false, enabled: false, recordingMode: 'single' } : item)
    expect(buildTodayTimeline(state, [], []).filter((event) => event.kind === 'habit')).toHaveLength(1)
  })
  it('retains old single completions alongside captures and counts a unique habit only once', () => {
    let state = fresh(); state.today.completionTimesByHabitId.mindfulEating = now.toISOString()
    state = toggleHabitState(state, 'mindfulEating', now)
    expect(completedHabitIds(state.today.completionTimesByHabitId, state.today.eventsByHabitId)).toEqual(['mindfulEating'])
    const summary = buildHistorySummary(state.history, [state.currentDayKey])
    expect(summary.habitCompletionsCount).toBe(1)
    expect(summary.habitCapturesCount).toBe(1)
  })
  it('logs a custom duration activity once with its name in Today and its duration in History', async () => {
    let state = fresh()
    state.library.habits.push({ id: 'custom-duration', name: '我的活动', category: '', note: '', enabled: true, showOnToday: true, recordingMode: 'duration' })
    state = addMovementSessionState(state, { typeId: 'custom-duration', durationMinutes: 22 }, now)
    expect(state.today.movementSessions).toHaveLength(1)
    expect(buildTodayTimeline(state, [], [])).toContainEqual(expect.objectContaining({ title: '我的活动', summary: '22 分钟' }))
    expect(buildDailyHistorySummary(state.history[0], []).movementTotalMinutes).toBe(22)
    await saveState(state)
    expect((await loadPersistedState(now)).state.today.movementSessions).toEqual(state.today.movementSessions)
  })
  it('records partial core completion through the original foundation path with no duplicate strength record', () => {
    let state = toggleStrengthExerciseState(fresh(), 'lowerAbs', now)
    state = toggleStrengthExerciseState(state, 'pelvicFloor', now)
    expect(Object.keys(state.today.foundationCompletedAt)).toHaveLength(2)
    expect(state.strength.completedExerciseIds).toEqual([])
    expect(buildDailyHistorySummary(state.history[0], []).strengthSummary).toBe('2 项')
    expect(buildTodayTimeline(state, [], []).filter((event) => event.kind === 'strength')).toHaveLength(2)
    state = toggleStrengthExerciseState(state, 'lowerAbs', now)
    expect(Object.keys(state.today.foundationCompletedAt)).toEqual(['pelvicFloor'])
  })
  it('shares completion for an exercise in core and multiple routines and preserves all definitions on refresh', async () => {
    let state = fresh()
    const id = 'routine-a-glute-bridge'
    state.library.exercises = state.library.exercises.map((exercise) => exercise.id === id ? { ...exercise, dailyCore: true, trying: true } : exercise)
    state.strength.routines[1] = { ...state.strength.routines[1], exercises: [...state.strength.routines[1].exercises, { exerciseId: id }] }
    state = toggleStrengthExerciseState(state, id, now)
    expect(state.strength.completedExerciseIds).toEqual([id])
    expect(buildHistorySummary(state.history, [state.currentDayKey]).strengthCompletionsCount).toBe(1)
    await saveState(state)
    expect((await loadPersistedState(now)).state.library.exercises.find((exercise) => exercise.id === id)).toMatchObject({ dailyCore: true, trying: true })
    state = toggleStrengthExerciseState(state, id, now)
    expect(state.strength.completedExerciseIds).toEqual([])
  })
  it('shows persisted routine overrides instead of the shared library defaults', async () => {
    const state = fresh()
    const id = 'routine-a-glute-bridge'
    state.strength.routines[0].exercises = [{ exerciseId: id, customSets: '4 组', customVolume: '6 次', customTime: '5 分钟' }]
    await saveState(state)
    const restored = (await loadPersistedState(now)).state
    const resolved = resolveStrengthRoutines(restored.library.exercises, restored.strength.routines)[0].exercises[0]
    expect(exercisePrescription(resolved)).toBe('4 组 · 6 次 · 5 分钟')
    expect(restored.library.exercises.find((exercise) => exercise.id === id)?.suggestedSets).toBe('2 组')
  })
  it('adds Rhythm elapsed seconds before rounding the summary instead of rounding every session', () => {
    const state = fresh()
    const entries = [90, 90].map((durationSeconds, i) => ({ id: `rhythm-${i}`, startAt: now.toISOString(), endAt: now.toISOString(), durationSeconds }))
    state.history[0].rhythmEntries = entries
    expect(buildDailyHistorySummary(state.history[0], []).rhythmTotalMinutes).toBe(3)
    expect(buildHistorySummary(state.history, [state.currentDayKey]).totalRhythmMinutes).toBe(3)
    expect(formatDurationMinutes(90)).toBe('1.5 分钟')
  })
})
