import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import v2Fixture from './fixtures/v2-save.json'
import { buildExportText, EXPORT_FORMAT, parseImportText } from './dataTransfer'
import { monthDayKeys, weekDayKeys, type AppState } from './domain'
import { addMovementSessionState, buildHistorySummary, buildTodayTimeline, endRhythmState, toggleFoundationItemState, toggleHabitState, toggleRhythmState, useHealthRhythmApp } from './state'
import { dayAsState, dayRecord, editRecord } from './v31'
import { recordGroupForDay } from './groups'
import { resetStorageStatus } from './storageStatus'

// Exercise the actual view-model callbacks and derived summaries in Node. Effects are
// disabled: no browser, timers/audio or real persistence runs in this view-state harness.
const hooks = vi.hoisted(() => ({
  values: [] as unknown[], cursor: 0,
  useState<T>(initial: T | (() => T)) {
    const index = this.cursor++
    if (!(index in this.values)) this.values[index] = typeof initial === 'function' ? (initial as () => T)() : initial
    return [this.values[index] as T, (next: T | ((current: T) => T)) => {
      this.values[index] = typeof next === 'function' ? (next as (current: T) => T)(this.values[index] as T) : next
    }] as const
  },
}))
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useState: <T>(initial: T | (() => T)) => hooks.useState(initial),
  useRef: <T>(initial: T) => hooks.useState({ current: initial })[0],
  useMemo: <T>(calculate: () => T) => calculate(),
  useEffect: () => {},
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
}))

const now = new Date('2026-10-12T21:30:00Z') // Sydney 13 October; fixture records are in April.
const priorTZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'Australia/Sydney' })
afterAll(() => { if (priorTZ === undefined) delete process.env.TZ; else process.env.TZ = priorTZ })
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0
  vi.useFakeTimers(); vi.setSystemTime(now)
  resetStorageStatus()
})
afterEach(() => vi.useRealTimers())

function render() {
  hooks.cursor = 0
  // eslint-disable-next-line react-hooks/rules-of-hooks -- Synchronous hook harness with mocked React hooks above.
  return useHealthRhythmApp()
}
function imported(text = JSON.stringify(v2Fixture), at = now): AppState {
  const result = parseImportText(text, at)
  if (!result.ok) throw new Error(result.error)
  return result.state
}
function mount(state = imported()) {
  render().replaceAppState(state)
  return render()
}
function totals(summary: ReturnType<typeof buildHistorySummary>) {
  return {
    movements: summary.movementSessionsCount, minutes: summary.movementTotalMinutes,
    foundation: summary.foundationCompletedCount, habits: summary.habitCompletionsCount,
    captures: summary.habitCapturesCount, strength: summary.strengthCompletionsCount,
  }
}

describe('imported V2 records through the History view model', () => {
  it.each([
    ['bare V2 save', JSON.stringify(v2Fixture)],
    ['V2 JSON export', JSON.stringify({ format: EXPORT_FORMAT, formatVersion: 1, stateVersion: 3, exportedAt: v2Fixture.today.movementSessions[0].loggedAt, state: v2Fixture })],
  ])('selecting a historical day aligns its week/month instead of showing empty current periods (%s)', (_name, text) => {
    const state = imported(text), before = structuredClone(state)
    let app = mount(state)
    expect(app.historyNavigation.week.key).toBe('2026-10-12')
    expect(totals(app.historyWeekSummary).movements).toBe(0)
    expect(totals(app.historyMonthSummary).movements).toBe(0)

    app.setSelectedHistoryDayKey('2026-04-15'); app = render()
    expect(app.historyDailySummary(app.selectedHistoryDayKey)).toMatchObject({ movementTotalMinutes: 25, mindfulEatingCaptureCount: 1 })
    expect(buildTodayTimeline(dayAsState(state, app.selectedHistoryDayKey), state.library.habits, []).some((event) => event.id === 'movement-v2-movement-existing')).toBe(true)
    expect(app.historyNavigation.week.key).toBe('2026-04-13')
    expect(app.historyNavigation.month.key).toBe('2026-04')
    for (const summary of [app.historyWeekSummary, app.historyMonthSummary]) {
      expect(totals(summary)).toEqual({ movements: 2, minutes: 60, foundation: 2, habits: 2, captures: 1, strength: 3 })
      expect(summary.movementByType.find((item) => item.typeId === 'swimming')).toMatchObject({ sessionsCount: 1, totalMinutes: 35 })
      expect(summary.movementByType.find((item) => item.typeId === 'jingang')).toMatchObject({ sessionsCount: 1, totalMinutes: 25 })
      expect(summary.groups).toEqual([]) // Legacy items are not guessed into group sessions.
    }
    expect(state).toEqual(before) // Viewing statistics never rewrites imported records.
  })

  it('uses the same date semantics for day arrows, Today reset and the picker', () => {
    let app = mount()
    app.setSelectedHistoryDayKey('2026-04-30'); app = render()
    app.stepHistoryPeriod('day', 1); app = render()
    expect(app.selectedHistoryDayKey).toBe('2026-05-01')
    expect(app.historyNavigation.month.key).toBe('2026-05')
    expect(app.historyNavigation.week.key).toBe('2026-04-27')
    app.resetHistoryPeriod('day'); app = render()
    expect(app.selectedHistoryDayKey).toBe('2026-10-13')
    expect(app.historyNavigation.week.key).toBe('2026-10-12')
    expect(app.historyNavigation.month.key).toBe('2026-10')
  })

  it('still allows separate week/month browsing, but a new day selection realigns both', () => {
    let app = mount()
    app.setSelectedHistoryDayKey('2026-04-15'); app = render()
    app.stepHistoryPeriod('month', 1); app = render()
    expect(app.historyNavigation.month.key).toBe('2026-05')
    expect(app.historyNavigation.week.key).toBe('2026-04-13')
    expect(app.selectedHistoryDayKey).toBe('2026-04-15')
    app.resetHistoryPeriod('week'); app = render()
    expect(app.historyNavigation.week.key).toBe('2026-10-12')
    app.setSelectedHistoryDayKey('2026-04-14'); app = render()
    expect(app.historyNavigation.week.key).toBe('2026-04-13')
    expect(app.historyNavigation.month.key).toBe('2026-04')
    const navigation = structuredClone(app.historyNavigation)
    app.setSelectedHistoryDayKey(''); app = render()
    expect(app.historyNavigation).toEqual(navigation)
  })

  it('clamps future picker dates consistently for all three views', () => {
    let app = mount()
    app.setSelectedHistoryDayKey('2027-01-01'); app = render()
    expect(app.selectedHistoryDayKey).toBe('2026-10-13')
    expect(app.historyNavigation.week.key).toBe('2026-10-12')
    expect(app.historyNavigation.month.key).toBe('2026-10')
  })

  it('keeps rapid day navigation consistent across a year boundary', () => {
    let app = mount()
    app.setSelectedHistoryDayKey('2025-12-30'); app = render()
    app.stepHistoryPeriod('day', 1)
    app.stepHistoryPeriod('day', 1) // Both taps before a render must count.
    app = render()
    expect(app.selectedHistoryDayKey).toBe('2026-01-01')
    expect(app.historyNavigation.week.key).toBe('2025-12-29')
    expect(app.historyNavigation.month.key).toBe('2026-01')
  })

  it('preserves imported daily and period statistics through a complete schema-6 JSON round trip', () => {
    const state = imported(), restored = imported(buildExportText(state, now))
    expect(restored.version).toBe(6)
    expect(restored.history).toEqual(state.history)
    expect(restored.library).toEqual(state.library)
    expect(dayRecord(restored, '2026-04-15').movementSessions[0].loggedAt).toBe(v2Fixture.today.movementSessions[0].loggedAt)
    for (const candidate of [state, restored]) {
      let app = mount(candidate)
      app.setSelectedHistoryDayKey('2026-04-15'); app = render()
      expect(totals(app.historyWeekSummary)).toEqual({ movements: 2, minutes: 60, foundation: 2, habits: 2, captures: 1, strength: 3 })
      expect(totals(app.historyMonthSummary)).toEqual(totals(buildHistorySummary(state.history, monthDayKeys('2026-04'), state.currentDayKey)))
      expect(app.historyDailySummary('2026-04-14').movementTotalMinutes).toBe(35)
      expect(app.historyWeekSummary).toEqual(buildHistorySummary(state.history, weekDayKeys('2026-04-13'), state.currentDayKey))
    }
  })

  it('legacy timer entries and historical repeated captures use the same imported period path', () => {
    const startAt = '2026-04-13T22:00:00.000Z', endAt = '2026-04-13T22:05:00.000Z'
    const source = { ...v2Fixture, history: v2Fixture.history.map((day) => ({ ...day,
      rhythmEntries: [{ id: 'v2-rhythm', startAt, endAt, durationSeconds: 300 }],
      breathSessions: [{ id: 'v2-breath', startAt, endAt, totalDurationSeconds: 300, mode: 'fourSevenEight', pattern: { inhale: 4, hold: 7, exhale: 8, endHold: 0 }, completedRounds: 5 }],
      habitEvents: { mindfulEating: [startAt, endAt] },
    })) }
    const state = imported(JSON.stringify(source)), before = structuredClone(state)
    let app = mount(state)
    app.setSelectedHistoryDayKey('2026-04-14'); app = render()
    expect(app.historyDailySummary(app.selectedHistoryDayKey)).toMatchObject({ rhythmTotalMinutes: 5, breathSessionsCount: 1, breathRoundsCount: 5, mindfulEatingCaptureCount: 2 })
    for (const summary of [app.historyWeekSummary, app.historyMonthSummary]) {
      expect(summary).toMatchObject({ totalRhythmMinutes: 5, rhythmDaysCount: 1, breathSessionsCount: 1, mindfulEatingDaysCount: 2, habitCapturesCount: 3 })
      expect(summary.items).toEqual(expect.arrayContaining([{ key: 'rhythm:rhythm', count: 1 }, { key: 'breath:breath', count: 1 }, { key: 'habit:mindfulEating', count: 3 }]))
    }
    expect(dayRecord(state, '2026-04-14').rhythmEntries).toEqual(source.history[0].rhythmEntries)
    expect(dayRecord(state, '2026-04-14').breathSessions).toEqual(source.history[0].breathSessions)
    expect(imported(buildExportText(state, now)).history).toEqual(state.history)
    expect(state).toEqual(before)
  })

  it('new independent records still contribute without changing imported history', () => {
    let state = imported()
    const historical = structuredClone(state.history.filter((day) => day.dayKey < state.currentDayKey))
    state = addMovementSessionState(state, { typeId: 'swimming', durationMinutes: 20 }, now)
    state = toggleHabitState(toggleHabitState(state, 'mindfulEating', now), 'mindfulEating', new Date(now.getTime() + 1000))
    state = toggleFoundationItemState(state, 'lowerBack', now)
    state = endRhythmState(toggleRhythmState(state, now), new Date(now.getTime() + 900_000))
    const app = mount(state)
    expect(app.historyDailySummary(app.selectedHistoryDayKey)).toMatchObject({ movementTotalMinutes: 20, mindfulEatingCaptureCount: 2, rhythmTotalMinutes: 15 })
    for (const summary of [app.historyWeekSummary, app.historyMonthSummary]) {
      expect(totals(summary)).toEqual({ movements: 1, minutes: 20, foundation: 1, habits: 1, captures: 2, strength: 1 })
      expect(summary.totalRhythmMinutes).toBe(15)
      expect(summary.items).toEqual(expect.arrayContaining([{ key: 'habit:mindfulEating', count: 2 }, { key: 'habit:swimming', count: 1 }, { key: 'exercise:lowerBack', count: 1 }]))
    }
    expect(state.history.filter((day) => day.dayKey < state.currentDayKey)).toEqual(historical)
  })

  it('backdated imported movement uses its assigned date, keeping occurrence and recording data intact', () => {
    const original = imported(), event = buildTodayTimeline(dayAsState(original, '2026-04-15'), original.library.habits, []).find((entry) => entry.id === 'movement-v2-movement-existing')!
    const state = editRecord(original, '2026-04-15', event, { occurredDate: '2026-03-30', occurredTime: '14:00', precision: 'approximate', assignedDate: '2026-03-31', recordedAt: null, note: '补记' })
    expect(state).not.toBe(original)
    const record = dayRecord(state, '2026-03-31')
    expect(record.movementSessions[0]).toEqual(v2Fixture.today.movementSessions[0])
    expect(record.recordDetails![event.id]).toMatchObject({ occurredDate: '2026-03-30', occurredTime: '14:00', precision: 'approximate', assignedDate: '2026-03-31', recordedAt: v2Fixture.today.movementSessions[0].loggedAt })
    let app = mount(state)
    app.setSelectedHistoryDayKey('2026-03-31'); app = render()
    expect(app.historyDailySummary(app.selectedHistoryDayKey).movementTotalMinutes).toBe(25)
    for (const summary of [app.historyWeekSummary, app.historyMonthSummary]) expect(summary).toMatchObject({ movementSessionsCount: 1, movementTotalMinutes: 25 })
    app.setSelectedHistoryDayKey('2026-04-15'); app = render()
    for (const summary of [app.historyWeekSummary, app.historyMonthSummary]) expect(summary).toMatchObject({ movementSessionsCount: 1, movementTotalMinutes: 35 })
    expect(imported(buildExportText(state, now)).history).toEqual(state.history)
  })

  it.each([
    ['2026-01-01', '2025-12-31'],
    ['2026-03-01', '2026-02-28'],
    ['2026-04-05', '2026-04-04'], // Sydney DST ends (25-hour calendar day).
    ['2026-10-04', '2026-10-03'], // Sydney DST starts (23-hour calendar day).
  ])('bedtime review on %s counts the assigned day, not the previous night %s', (review, occurrence) => {
    let state = recordGroupForDay(imported(), 'domino-bedtime', review, null, 'habit:foot-soak', now)
    const session = dayRecord(state, review).groupSessions![0]
    state = recordGroupForDay(state, 'domino-bedtime', review, session.id, 'habit:earlySleep', now)
    expect(dayRecord(state, review).groupSessions![0].info).toMatchObject({ occurredDate: occurrence, occurredTime: null, precision: 'unknown', assignedDate: review, recordedAt: now.toISOString() })
    let app = mount(state)
    app.setSelectedHistoryDayKey(review); app = render()
    expect(app.historyDailySummary(review).earlySleepCompleted).toBe(true)
    for (const [index, summary] of [app.historyWeekSummary, app.historyMonthSummary].entries()) {
      expect(summary.groups).toEqual([expect.objectContaining({ id: 'domino-bedtime', sessions: 1, completedItems: 2 })])
      const days = index === 0 ? weekDayKeys(app.historyNavigation.week.key) : monthDayKeys(app.historyNavigation.month.key)
      const previous = buildHistorySummary(imported().history, days).items.find((item) => item.key === 'habit:earlySleep')?.count ?? 0
      expect(summary.items).toEqual(expect.arrayContaining([{ key: 'habit:foot-soak', count: 1 }, { key: 'habit:earlySleep', count: previous + 1 }]))
    }
    expect(buildHistorySummary(state.history, [occurrence]).groups).toEqual([])
    expect(buildTodayTimeline(dayAsState(state, review), state.library.habits, []).filter((entry) => entry.kind === 'group')).toHaveLength(1)
    expect(imported(buildExportText(state, now)).history).toEqual(state.history)
  })

  it('mixed group children count once alongside independent captures/movement, including schema-6 restore', () => {
    let state = addMovementSessionState(imported(), { typeId: 'swimming', durationMinutes: 20 }, now)
    state = toggleHabitState(state, 'mindfulEating', now)
    state = recordGroupForDay(state, 'domino-morning', state.currentDayKey, null, 'habit:jingang', now, { typeId: 'jingang', durationMinutes: 15 })
    const morning = state.today.groupSessions![0]
    state = recordGroupForDay(state, 'domino-morning', state.currentDayKey, morning.id, 'habit:domino-faith', now)
    state = recordGroupForDay(state, 'group-core-trio', state.currentDayKey, null, 'exercise:lowerAbs', now)
    const core = state.today.groupSessions!.find((entry) => entry.groupId === 'group-core-trio')!
    state = recordGroupForDay(state, 'group-core-trio', state.currentDayKey, core.id, 'exercise:pelvicFloor', now)
    const unchanged = structuredClone(state), restored = imported(buildExportText(state, now))
    expect(restored.history).toEqual(state.history)
    for (const candidate of [state, restored]) {
      const app = mount(candidate)
      expect(app.todayTimeline.filter((entry) => entry.kind === 'group')).toHaveLength(2)
      expect(app.todayTimeline.filter((entry) => entry.kind === 'movement')).toHaveLength(1)
      for (const summary of [app.historyWeekSummary, app.historyMonthSummary]) {
        expect(totals(summary)).toEqual({ movements: 2, minutes: 35, foundation: 2, habits: 2, captures: 2, strength: 2 })
        expect(summary.groups).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'domino-morning', sessions: 1, completedItems: 2 }),
          expect.objectContaining({ id: 'group-core-trio', sessions: 1, completedItems: 2 }),
        ]))
        expect(summary.items).toEqual(expect.arrayContaining([
          { key: 'habit:jingang', count: 1 }, { key: 'habit:swimming', count: 1 },
          { key: 'exercise:lowerAbs', count: 1 }, { key: 'exercise:pelvicFloor', count: 1 },
        ]))
      }
    }
    expect(state).toEqual(unchanged)
  })
})
