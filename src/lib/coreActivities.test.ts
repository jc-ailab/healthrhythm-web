import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FOUNDATION_ITEMS,
  MOVEMENT_MAX_MINUTES,
  createInitialState,
  parseMovementMinutes,
  type AppState,
  type DayRecord,
  type MovementSessionDraft,
} from './domain'
import {
  addMovementSessionState,
  backupKeyFor,
  buildDailyHistorySummary,
  buildHistorySummary,
  buildTodayTimeline,
  currentIntervalDayKeys,
  deleteMovementSessionState,
  ensureCurrentDay,
  loadPersistedState,
  movementDefaultsFor,
  saveState,
  toggleFoundationItemState,
  updateMovementSessionState,
} from './state'
import { STORAGE_NOTICES, resetStorageStatus } from './storageStatus'

const STORAGE_KEY = 'health-rhythm-web-v2'

let storage: Map<string, string>

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  })
  resetStorageStatus()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Wednesday 2026-04-15; its week runs Monday 04-13 … Sunday 04-19.
const at = (hour: number, minute = 0, dayOfMonth = 15) => new Date(2026, 3, dayOfMonth, hour, minute)

function stateAt(now: Date): AppState {
  return ensureCurrentDay(createInitialState(now), now)
}

const swim: MovementSessionDraft = { typeId: 'swimming', durationMinutes: 40, intensity: 'moderate', note: ' 自由泳 ' }

function pastRecord(dayKey: string, overrides: Partial<DayRecord> = {}): DayRecord {
  return {
    dayKey,
    rhythmEntries: [],
    breathSessions: [],
    strengthCompletedExerciseIds: [],
    strengthLastUpdatedAt: null,
    habits: {},
    foundation: {},
    movementSessions: [],
    ...overrides,
  }
}

/** A JSON save as written before foundation/movement existed. */
function preFeatureSave(version: 1 | 2 | 3) {
  const saved = JSON.parse(JSON.stringify(stateAt(at(10)))) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  saved.version = version
  delete saved.today.foundationCompletedAt
  delete saved.today.movementSessions
  saved.today.completionTimesByHabitId = { earlySleep: at(9).toISOString() }
  saved.history = [
    {
      dayKey: '2026-04-14',
      rhythmEntries: [{ id: 'r1', startAt: at(8, 0, 14).toISOString(), endAt: at(8, 15, 14).toISOString(), durationSeconds: 900 }],
      breathSessions: [],
      strengthCompletedExerciseIds: ['routine-a-dead-bug'],
      strengthLastUpdatedAt: at(9, 0, 14).toISOString(),
      habits: { mindfulEating: at(12, 0, 14).toISOString() },
    },
  ]
  if (version !== 3) {
    delete saved.library
    delete saved.strength.routines
    delete saved.selectedTab
  }
  return saved
}

describe('loading saves written before foundation and movement existed', () => {
  it.each([1, 2, 3] as const)('loads a v%s save with empty defaults and keeps all existing data', (version) => {
    const key = version === 1 ? 'health-rhythm-web-v1' : STORAGE_KEY
    storage.set(key, JSON.stringify(preFeatureSave(version)))

    const { state, notice } = loadPersistedState(at(10))

    expect(notice).toBeNull()
    expect(state.version).toBe(3)
    expect(state.today.foundationCompletedAt).toEqual({})
    expect(state.today.movementSessions).toEqual([])
    expect(state.today.completionTimesByHabitId).toEqual({ earlySleep: at(9).toISOString() })

    const yesterday = state.history.find((record) => record.dayKey === '2026-04-14')!
    expect(yesterday.rhythmEntries).toHaveLength(1)
    expect(yesterday.strengthCompletedExerciseIds).toEqual(['routine-a-dead-bug'])
    expect(yesterday.habits).toEqual({ mindfulEating: at(12, 0, 14).toISOString() })
    expect(yesterday.foundation).toEqual({})
    expect(yesterday.movementSessions).toEqual([])
    expect(storage.has(backupKeyFor(storage.get(key)!))).toBe(false)
  })

  it('renders history and weekly summaries for a migrated save without throwing', () => {
    storage.set(STORAGE_KEY, JSON.stringify(preFeatureSave(3)))
    const { state } = loadPersistedState(at(10))

    expect(() => buildHistorySummary(state.history, currentIntervalDayKeys('week', at(10)))).not.toThrow()
    for (const record of state.history) {
      expect(() => buildDailyHistorySummary(record, [])).not.toThrow()
    }
    expect(() => buildTodayTimeline(state, [], [])).not.toThrow()
  })

  it('backs up instead of loading when a new field is malformed', () => {
    const saved = JSON.parse(JSON.stringify(stateAt(at(10))))
    saved.today.movementSessions = 'not a list'
    const raw = JSON.stringify(saved)
    storage.set(STORAGE_KEY, raw)

    const result = loadPersistedState(at(10))

    expect(result.notice).toBe(STORAGE_NOTICES.recovered)
    expect(storage.get(backupKeyFor(raw))).toBe(raw)
  })

  it('backs up instead of loading when a history record has malformed sessions', () => {
    const saved = JSON.parse(JSON.stringify(stateAt(at(10))))
    saved.history.push({ ...pastRecord('2026-04-14'), movementSessions: { swim: 1 } })
    const raw = JSON.stringify(saved)
    storage.set(STORAGE_KEY, raw)

    expect(loadPersistedState(at(10)).notice).toBe(STORAGE_NOTICES.recovered)
    expect(storage.get(backupKeyFor(raw))).toBe(raw)
  })
})

describe('daily foundation items', () => {
  it('marks an item complete with a timestamp and mirrors it into today’s history record', () => {
    const state = toggleFoundationItemState(stateAt(at(10)), 'pelvicFloor', at(10, 5))

    expect(state.today.foundationCompletedAt).toEqual({ pelvicFloor: at(10, 5).toISOString() })
    expect(state.history.find((record) => record.dayKey === '2026-04-15')!.foundation).toEqual({
      pelvicFloor: at(10, 5).toISOString(),
    })
  })

  it('un-marks an item on a second tap', () => {
    let state = toggleFoundationItemState(stateAt(at(10)), 'lowerAbs', at(10))
    state = toggleFoundationItemState(state, 'lowerAbs', at(10, 1))

    expect(state.today.foundationCompletedAt).toEqual({})
  })

  it('ignores unknown item ids', () => {
    const state = stateAt(at(10))
    expect(toggleFoundationItemState(state, 'notAnItem' as never, at(10))).toBe(state)
  })

  it('persists across save and reload', () => {
    let state = stateAt(at(10))
    for (const item of FOUNDATION_ITEMS.slice(0, 3)) {
      state = toggleFoundationItemState(state, item.id, at(10))
    }
    saveState(state)

    const { state: reloaded } = loadPersistedState(at(11))

    expect(Object.keys(reloaded.today.foundationCompletedAt)).toEqual(['lowerAbs', 'lowerBack', 'pelvicFloor'])
  })

  it('keeps yesterday’s completions in history and starts today empty', () => {
    const yesterday = toggleFoundationItemState(stateAt(at(21, 0, 14)), 'spineMobility', at(21, 0, 14))

    const today = ensureCurrentDay(yesterday, at(8))

    expect(today.today.foundationCompletedAt).toEqual({})
    expect(today.history.find((record) => record.dayKey === '2026-04-14')!.foundation).toEqual({
      spineMobility: at(21, 0, 14).toISOString(),
    })
  })
})

describe('movement sessions', () => {
  it('creates a session with a trimmed note and mirrors it into history', () => {
    const state = addMovementSessionState(stateAt(at(10)), swim, at(10, 30))
    const [session] = state.today.movementSessions

    expect(session).toMatchObject({
      typeId: 'swimming',
      durationMinutes: 40,
      intensity: 'moderate',
      note: '自由泳',
      loggedAt: at(10, 30).toISOString(),
    })
    expect(session.id).toMatch(/^movement-/)
    expect(state.history.find((record) => record.dayKey === '2026-04-15')!.movementSessions).toEqual([session])
  })

  it('omits empty optional fields', () => {
    const state = addMovementSessionState(
      stateAt(at(10)),
      { typeId: 'yoga', durationMinutes: 30, note: '   ' },
      at(10),
    )
    const [session] = state.today.movementSessions

    expect('note' in session).toBe(false)
    expect('intensity' in session).toBe(false)
  })

  it.each([
    ['an unknown type', { ...swim, typeId: 'rowing' }],
    ['zero minutes', { ...swim, durationMinutes: 0 }],
    ['too many minutes', { ...swim, durationMinutes: MOVEMENT_MAX_MINUTES + 1 }],
    ['a non-number', { ...swim, durationMinutes: Number.NaN }],
  ])('rejects %s', (_, draft) => {
    const state = stateAt(at(10))
    expect(addMovementSessionState(state, draft, at(10))).toBe(state)
  })

  it('persists across save and reload', () => {
    saveState(addMovementSessionState(stateAt(at(10)), swim, at(10)))

    const { state } = loadPersistedState(at(11))

    expect(state.today.movementSessions).toHaveLength(1)
    expect(state.today.movementSessions[0].typeId).toBe('swimming')
  })

  it('moves to history at day change', () => {
    const yesterday = addMovementSessionState(stateAt(at(19, 0, 14)), swim, at(19, 0, 14))

    const today = ensureCurrentDay(yesterday, at(8))

    expect(today.today.movementSessions).toEqual([])
    expect(today.history.find((record) => record.dayKey === '2026-04-14')!.movementSessions).toHaveLength(1)
  })

  describe('editing', () => {
    it('updates today’s session but keeps its id and time', () => {
      const created = addMovementSessionState(stateAt(at(10)), swim, at(10))
      const original = created.today.movementSessions[0]

      const edited = updateMovementSessionState(created, '2026-04-15', original.id, {
        typeId: 'zumba',
        durationMinutes: 50,
        intensity: 'hard',
        note: '',
      })

      expect(edited.today.movementSessions).toEqual([
        { id: original.id, loggedAt: original.loggedAt, typeId: 'zumba', durationMinutes: 50, intensity: 'hard' },
      ])
      expect(edited.history.find((record) => record.dayKey === '2026-04-15')!.movementSessions).toEqual(
        edited.today.movementSessions,
      )
    })

    it('updates a past day’s session in its history record only', () => {
      let state = addMovementSessionState(stateAt(at(19, 0, 14)), swim, at(19, 0, 14))
      state = ensureCurrentDay(state, at(8))
      state = addMovementSessionState(state, { typeId: 'yoga', durationMinutes: 20 }, at(8, 30))
      const pastId = state.history.find((record) => record.dayKey === '2026-04-14')!.movementSessions[0].id

      const edited = updateMovementSessionState(state, '2026-04-14', pastId, { ...swim, durationMinutes: 25 })

      expect(edited.history.find((record) => record.dayKey === '2026-04-14')!.movementSessions[0].durationMinutes).toBe(25)
      expect(edited.today.movementSessions).toEqual(state.today.movementSessions)
    })

    it('ignores an invalid edit', () => {
      const created = addMovementSessionState(stateAt(at(10)), swim, at(10))
      const id = created.today.movementSessions[0].id

      expect(updateMovementSessionState(created, '2026-04-15', id, { ...swim, durationMinutes: -5 })).toBe(created)
      expect(
        updateMovementSessionState(created, '2026-04-15', id, { ...swim, typeId: 'rowing' }).today.movementSessions,
      ).toEqual(created.today.movementSessions)
    })

    it('keeps a retired type when the edit does not change it', () => {
      const state = stateAt(at(10))
      state.history = [
        pastRecord('2026-04-14', {
          movementSessions: [{ id: 'old', typeId: 'taichi', loggedAt: at(9, 0, 14).toISOString(), durationMinutes: 20 }],
        }),
        ...state.history,
      ]

      const edited = updateMovementSessionState(state, '2026-04-14', 'old', { typeId: 'taichi', durationMinutes: 35 })

      expect(edited.history.find((record) => record.dayKey === '2026-04-14')!.movementSessions[0]).toMatchObject({
        typeId: 'taichi',
        durationMinutes: 35,
      })
    })
  })

  describe('deleting', () => {
    it('removes only the chosen session from today', () => {
      let state = addMovementSessionState(stateAt(at(10)), swim, at(10))
      state = addMovementSessionState(state, { typeId: 'jingang', durationMinutes: 30 }, at(11))
      const [first, second] = state.today.movementSessions

      const next = deleteMovementSessionState(state, '2026-04-15', first.id)

      expect(next.today.movementSessions).toEqual([second])
      expect(next.history.find((record) => record.dayKey === '2026-04-15')!.movementSessions).toEqual([second])
    })

    it('removes a session from a past day and survives reload', () => {
      let state = addMovementSessionState(stateAt(at(19, 0, 14)), swim, at(19, 0, 14))
      state = ensureCurrentDay(state, at(8))
      const pastId = state.history.find((record) => record.dayKey === '2026-04-14')!.movementSessions[0].id

      saveState(deleteMovementSessionState(state, '2026-04-14', pastId))
      const { state: reloaded } = loadPersistedState(at(9))

      expect(reloaded.history.find((record) => record.dayKey === '2026-04-14')!.movementSessions).toEqual([])
    })

    it('is a no-op for a day with no record', () => {
      const state = stateAt(at(10))
      expect(deleteMovementSessionState(state, '2020-01-01', 'missing')).toBe(state)
    })
  })

  it('appears in the Today timeline with Chinese labels', () => {
    const state = addMovementSessionState(stateAt(at(10)), swim, at(10, 30))

    const [event] = buildTodayTimeline(state, [], []).filter((candidate) => candidate.kind === 'movement')

    expect(event).toMatchObject({ title: '游泳', summary: '40 分钟', detail: '适中 · 自由泳' })
  })

  it('pre-fills the quick log from the most recent session of that type', () => {
    let state = addMovementSessionState(stateAt(at(19, 0, 14)), { ...swim, durationMinutes: 50, intensity: 'hard' }, at(19, 0, 14))
    state = ensureCurrentDay(state, at(8))

    expect(movementDefaultsFor(state, 'swimming')).toEqual({ durationMinutes: 50, intensity: 'hard' })
    expect(movementDefaultsFor(state, 'zumba')).toEqual({ durationMinutes: 45, intensity: 'moderate' })

    state = addMovementSessionState(state, { typeId: 'swimming', durationMinutes: 20 }, at(9))
    expect(movementDefaultsFor(state, 'swimming')).toEqual({ durationMinutes: 20, intensity: 'moderate' })
  })
})

describe('parseMovementMinutes', () => {
  it.each([
    ['30', 30],
    [' 45 ', 45],
    ['12.6', 13],
    [600, 600],
    ['', null],
    ['abc', null],
    ['0', null],
    ['601', null],
  ])('parses %j as %j', (input, expected) => {
    expect(parseMovementMinutes(input)).toBe(expected)
  })
})

describe('history rendering inputs', () => {
  it('lists all four foundation items with labels and sorts sessions by time', () => {
    const record = pastRecord('2026-04-14', {
      foundation: { lowerBack: at(7, 0, 14).toISOString(), spineMobility: at(7, 5, 14).toISOString() },
      movementSessions: [
        { id: 'b', typeId: 'yoga', loggedAt: at(18, 0, 14).toISOString(), durationMinutes: 30, note: '流瑜伽' },
        { id: 'a', typeId: 'jingang', loggedAt: at(6, 30, 14).toISOString(), durationMinutes: 35, intensity: 'light' },
      ],
    })

    const summary = buildDailyHistorySummary(record, [])

    expect(summary.foundation.map((item) => [item.label, Boolean(item.completedAt)])).toEqual([
      ['下腹核心', false],
      ['腰背稳定', true],
      ['盆底肌', false],
      ['脊柱活动', true],
    ])
    expect(summary.foundationCompletedCount).toBe(2)
    expect(summary.movementSessions.map((session) => session.id)).toEqual(['a', 'b'])
    expect(summary.movementTotalMinutes).toBe(65)
  })

  it('ignores stored foundation ids that are no longer configured', () => {
    const record = pastRecord('2026-04-14', {
      foundation: { lowerAbs: at(7, 0, 14).toISOString(), retiredItem: at(7, 0, 14).toISOString() } as DayRecord['foundation'],
    })

    expect(buildDailyHistorySummary(record, []).foundationCompletedCount).toBe(1)
    expect(buildHistorySummary([record], ['2026-04-14']).foundationCompletedCount).toBe(1)
  })
})

describe('weekly aggregation', () => {
  const allFour = Object.fromEntries(FOUNDATION_ITEMS.map((item) => [item.id, at(7).toISOString()]))
  const session = (id: string, typeId: string, durationMinutes: number) => ({
    id,
    typeId,
    loggedAt: at(18).toISOString(),
    durationMinutes,
  })

  const history: DayRecord[] = [
    // Previous Sunday: outside the week, must not count.
    pastRecord('2026-04-12', { foundation: allFour, movementSessions: [session('x', 'swimming', 90)] }),
    pastRecord('2026-04-13', {
      foundation: allFour,
      movementSessions: [session('s1', 'swimming', 30), session('y1', 'yoga', 20)],
    }),
    pastRecord('2026-04-14', {
      foundation: { lowerAbs: at(7).toISOString(), pelvicFloor: at(7).toISOString() },
      movementSessions: [session('z1', 'zumba', 45), session('t1', 'taichi', 15)],
    }),
    pastRecord('2026-04-15', { foundation: { lowerAbs: at(7).toISOString() }, movementSessions: [session('s2', 'swimming', 25)] }),
  ]

  const summary = buildHistorySummary(history, currentIntervalDayKeys('week', at(10)))

  it('counts completed days per foundation item within the week', () => {
    expect(summary.foundationDaysById).toEqual({ lowerAbs: 3, lowerBack: 1, pelvicFloor: 2, spineMobility: 1 })
  })

  it('totals item-days and full days, and gives a per-day count for all seven days', () => {
    expect(summary.foundationCompletedCount).toBe(7)
    expect(summary.foundationFullDaysCount).toBe(1)
    expect(summary.foundationDailyCounts).toEqual([
      { dayKey: '2026-04-13', completedCount: 4 },
      { dayKey: '2026-04-14', completedCount: 2 },
      { dayKey: '2026-04-15', completedCount: 1 },
      { dayKey: '2026-04-16', completedCount: 0 },
      { dayKey: '2026-04-17', completedCount: 0 },
      { dayKey: '2026-04-18', completedCount: 0 },
      { dayKey: '2026-04-19', completedCount: 0 },
    ])
  })

  it('totals sessions and minutes, and breaks them down by type with zeros and retired types', () => {
    expect(summary.movementSessionsCount).toBe(5)
    expect(summary.movementTotalMinutes).toBe(135)
    expect(summary.movementByType).toEqual([
      { typeId: 'swimming', sessionsCount: 2, totalMinutes: 55 },
      { typeId: 'zumba', sessionsCount: 1, totalMinutes: 45 },
      { typeId: 'yoga', sessionsCount: 1, totalMinutes: 20 },
      { typeId: 'jingang', sessionsCount: 0, totalMinutes: 0 },
      { typeId: 'taichi', sessionsCount: 1, totalMinutes: 15 },
    ])
  })

  it('reflects an edit and a delete made through the state functions', () => {
    let state = stateAt(at(10))
    state = addMovementSessionState(state, { typeId: 'yoga', durationMinutes: 30 }, at(10))
    state = addMovementSessionState(state, { typeId: 'yoga', durationMinutes: 30 }, at(11))
    const [first, second] = state.today.movementSessions
    state = updateMovementSessionState(state, state.currentDayKey, first.id, { typeId: 'swimming', durationMinutes: 45 })
    state = deleteMovementSessionState(state, state.currentDayKey, second.id)

    const week = buildHistorySummary(state.history, currentIntervalDayKeys('week', at(10)))

    expect(week.movementSessionsCount).toBe(1)
    expect(week.movementTotalMinutes).toBe(45)
    expect(week.movementByType.find((type) => type.typeId === 'swimming')!.sessionsCount).toBe(1)
    expect(week.movementByType.find((type) => type.typeId === 'yoga')!.sessionsCount).toBe(0)
  })
})
