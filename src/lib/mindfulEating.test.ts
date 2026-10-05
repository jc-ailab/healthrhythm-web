import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildExportText, parseImportText } from './dataTransfer'
import { createInitialState, monthDayKeys, weekDayKeys, weekStartDayKey, type AppState } from './domain'
import {
  buildDailyHistorySummary,
  buildHistorySummary,
  ensureCurrentDay,
  loadPersistedState,
  saveState,
  toggleHabitState,
} from './state'
import { resetStorageStatus } from './storageStatus'

// Every step goes through the real Today tap (toggleHabitState) and the real day change
// (ensureCurrentDay); nothing writes history records directly.

const STORAGE_KEY = 'health-rhythm-web-v2'

let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    get length() {
      return storage.size
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  })
  resetStorageStatus()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Tuesday 2026-04-14 and Wednesday 04-15 share the week of Monday 04-13 and the month of April.
const tue = (hour: number, minute = 0) => new Date(2026, 3, 14, hour, minute)
const wed = (hour: number, minute = 0) => new Date(2026, 3, 15, hour, minute)

/** What the app does when Today's habit chip is tapped. */
const tap = (state: AppState, habitId: string, at: Date) => toggleHabitState(ensureCurrentDay(state, at), habitId, at)

const recordFor = (state: AppState, dayKey: string) => state.history.find((record) => record.dayKey === dayKey)!
const weekOf = (state: AppState, dayKey: string) =>
  buildHistorySummary(state.history, weekDayKeys(weekStartDayKey(dayKey)), state.currentDayKey)
const monthOf = (state: AppState, monthKey: string) =>
  buildHistorySummary(state.history, monthDayKeys(monthKey), state.currentDayKey)

function startOnTuesday() {
  return ensureCurrentDay(createInitialState(tue(7)), tue(7))
}

describe('Mindful eating captures in History', () => {
  it('counts the day as done in same-day History after one tap', () => {
    const state = tap(startOnTuesday(), 'mindfulEating', tue(12, 30))

    const day = buildDailyHistorySummary(recordFor(state, '2026-04-14'), [])
    expect(day.mindfulEatingCompleted).toBe(true)
    expect(day.mindfulEatingCaptureCount).toBe(1)
    expect(weekOf(state, '2026-04-14').mindfulEatingDaysCount).toBe(1)
  })

  it('keeps several same-day captures as separate captures but one day', () => {
    let state = startOnTuesday()
    state = tap(state, 'mindfulEating', tue(8))
    state = tap(state, 'mindfulEating', tue(12, 30))
    state = tap(state, 'mindfulEating', tue(19))

    expect(recordFor(state, '2026-04-14').habitEvents.mindfulEating).toEqual([
      tue(8).toISOString(),
      tue(12, 30).toISOString(),
      tue(19).toISOString(),
    ])
    expect(buildDailyHistorySummary(recordFor(state, '2026-04-14'), []).mindfulEatingCaptureCount).toBe(3)
    expect(weekOf(state, '2026-04-14').mindfulEatingDaysCount).toBe(1)
    expect(monthOf(state, '2026-04').mindfulEatingDaysCount).toBe(1)
  })

  it('preserves the old day’s captures across midnight and starts the new day empty', () => {
    let state = startOnTuesday()
    state = tap(state, 'mindfulEating', tue(8))
    state = tap(state, 'mindfulEating', tue(19))

    state = ensureCurrentDay(state, wed(7))

    expect(state.today.eventsByHabitId).toEqual({})
    expect(recordFor(state, '2026-04-14').habitEvents.mindfulEating).toEqual([tue(8).toISOString(), tue(19).toISOString()])
    expect(buildDailyHistorySummary(recordFor(state, '2026-04-14'), [])).toMatchObject({
      mindfulEatingCompleted: true,
      mindfulEatingCaptureCount: 2,
    })
    expect(buildDailyHistorySummary(recordFor(state, '2026-04-15'), []).mindfulEatingCompleted).toBe(false)
  })

  it('still counts the old day in weekly and monthly totals after rollover, without double counting', () => {
    let state = tap(startOnTuesday(), 'mindfulEating', tue(12))
    state = ensureCurrentDay(state, wed(7))
    expect(weekOf(state, '2026-04-15').mindfulEatingDaysCount).toBe(1)
    expect(monthOf(state, '2026-04').mindfulEatingDaysCount).toBe(1)

    state = tap(state, 'mindfulEating', wed(12))
    state = tap(state, 'mindfulEating', wed(18))

    expect(weekOf(state, '2026-04-15').mindfulEatingDaysCount).toBe(2)
    expect(monthOf(state, '2026-04').mindfulEatingDaysCount).toBe(2)
  })

  it('survives a save and reload on the next day', () => {
    let state = tap(startOnTuesday(), 'mindfulEating', tue(12))
    saveState(state)

    state = loadPersistedState(wed(7)).state

    expect(recordFor(state, '2026-04-14').habitEvents.mindfulEating).toEqual([tue(12).toISOString()])
    expect(weekOf(state, '2026-04-15').mindfulEatingDaysCount).toBe(1)
  })

  it('keeps historical captures in an export made after rollover, and through import', () => {
    let state = tap(startOnTuesday(), 'mindfulEating', tue(12))
    state = ensureCurrentDay(state, wed(7))

    const exported = JSON.parse(buildExportText(state, wed(8)))
    const exportedDay = exported.state.history.find((record: { dayKey: string }) => record.dayKey === '2026-04-14')
    expect(exportedDay.habitEvents.mindfulEating).toEqual([tue(12).toISOString()])

    const imported = parseImportText(JSON.stringify(exported), wed(8))
    expect(imported.ok).toBe(true)
    if (imported.ok) {
      expect(weekOf(imported.state, '2026-04-15').mindfulEatingDaysCount).toBe(1)
    }
  })
})

describe('older saves without habitEvents', () => {
  function oldSave(version: 1 | 2 | 3) {
    const saved = JSON.parse(JSON.stringify(ensureCurrentDay(tap(startOnTuesday(), 'earlySleep', tue(22)), wed(7))))
    saved.version = version
    for (const record of saved.history) delete record.habitEvents
    if (version !== 3) {
      delete saved.library
      delete saved.strength.routines
      delete saved.selectedTab
    }
    return saved
  }

  it.each([1, 2, 3] as const)('loads a v%s save with an empty default and keeps existing completions', (version) => {
    storage.set(version === 1 ? 'health-rhythm-web-v1' : STORAGE_KEY, JSON.stringify(oldSave(version)))

    const { state, notice } = loadPersistedState(wed(8))

    expect(notice).toBeNull()
    expect(state.history.every((record) => typeof record.habitEvents === 'object' && record.habitEvents !== null)).toBe(true)
    expect(recordFor(state, '2026-04-14').habitEvents).toEqual({})
    expect(recordFor(state, '2026-04-14').habits.earlySleep).toBe(tue(22).toISOString())
    expect(weekOf(state, '2026-04-15')).toMatchObject({ earlySleepDaysCount: 1, mindfulEatingDaysCount: 0 })
  })

  it('still counts an older toggle-style Mindful eating completion as done', () => {
    const saved = oldSave(3)
    saved.history.find((record: { dayKey: string }) => record.dayKey === '2026-04-14').habits.mindfulEating = tue(12).toISOString()
    storage.set(STORAGE_KEY, JSON.stringify(saved))

    const { state } = loadPersistedState(wed(8))

    expect(buildDailyHistorySummary(recordFor(state, '2026-04-14'), [])).toMatchObject({
      mindfulEatingCompleted: true,
      mindfulEatingCaptureCount: 0,
    })
    expect(weekOf(state, '2026-04-15').mindfulEatingDaysCount).toBe(1)
  })
})

describe('Early sleep (single-completion habit) is unchanged', () => {
  it('toggles on and off with one completion time, and is not recorded as a capture', () => {
    let state = tap(startOnTuesday(), 'earlySleep', tue(22))
    expect(state.today.completionTimesByHabitId).toEqual({ earlySleep: tue(22).toISOString() })
    expect(state.today.eventsByHabitId).toEqual({})
    expect(recordFor(state, '2026-04-14').habitEvents).toEqual({})
    expect(buildDailyHistorySummary(recordFor(state, '2026-04-14'), []).earlySleepCompleted).toBe(true)

    state = tap(state, 'earlySleep', tue(22, 5))
    expect(state.today.completionTimesByHabitId).toEqual({})
    expect(buildDailyHistorySummary(recordFor(state, '2026-04-14'), []).earlySleepCompleted).toBe(false)
  })

  it('carries into History across midnight and counts once per day', () => {
    let state = tap(startOnTuesday(), 'earlySleep', tue(22))
    state = ensureCurrentDay(state, wed(7))
    state = tap(state, 'earlySleep', wed(22))

    expect(recordFor(state, '2026-04-14').habits.earlySleep).toBe(tue(22).toISOString())
    expect(weekOf(state, '2026-04-15').earlySleepDaysCount).toBe(2)
    expect(monthOf(state, '2026-04').earlySleepDaysCount).toBe(2)
  })
})
