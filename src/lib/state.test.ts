import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInitialState, toDayKey, type AppState } from './domain'
import {
  backupKeyFor,
  ensureCurrentDay,
  loadPersistedState,
  refreshAppState,
  saveState,
  toggleBreathState,
  toggleRhythmState,
  endRhythmState,
} from './state'
import { STORAGE_NOTICES, getStorageNotice, setStorageNotice } from './storageStatus'

const STORAGE_KEY = 'health-rhythm-web-v2'

function makeFakeStorage() {
  const data = new Map<string, string>()
  let shouldFailWrite: (key: string) => boolean = () => false

  return {
    data,
    failWritesWhen(predicate: (key: string) => boolean) {
      shouldFailWrite = predicate
    },
    getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) {
      if (shouldFailWrite(key)) {
        throw new Error('QuotaExceededError')
      }
      data.set(key, value)
    },
    removeItem: (key: string) => void data.delete(key),
  }
}

let storage: ReturnType<typeof makeFakeStorage>

beforeEach(() => {
  storage = makeFakeStorage()
  vi.stubGlobal('localStorage', storage)
  setStorageNotice(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const at = (hour: number, minute = 0, second = 0, dayOfMonth = 14) =>
  new Date(2026, 3, dayOfMonth, hour, minute, second)

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)
const secondsAfter = (date: Date, seconds: number) => new Date(date.getTime() + seconds * 1000)

function stateAt(now: Date): AppState {
  return ensureCurrentDay(createInitialState(now), now)
}

function backupKeys() {
  return [...storage.data.keys()].filter((key) => key.startsWith('health-rhythm-web-backup-'))
}

function validSavedState(now = at(10)) {
  return JSON.parse(JSON.stringify(stateAt(now))) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('loadPersistedState', () => {
  it('starts fresh with no notice when nothing is stored', () => {
    const result = loadPersistedState(at(10))

    expect(result.notice).toBeNull()
    expect(result.canPersist).toBe(true)
    expect(result.state.currentDayKey).toBe('2026-04-14')
    expect(backupKeys()).toHaveLength(0)
  })

  it('round-trips a saved state without a notice', () => {
    const state = toggleRhythmState(stateAt(at(10)), at(10))
    saveState(state)

    const result = loadPersistedState(at(10, 0, 5))

    expect(result.notice).toBeNull()
    expect(result.state.rhythm.status).toBe('running')
    expect(backupKeys()).toHaveLength(0)
  })

  it('backs up corrupt JSON, recovers, and leaves the original untouched', () => {
    storage.data.set(STORAGE_KEY, '{not valid json')

    const result = loadPersistedState(at(10))

    expect(result.notice).toBe(STORAGE_NOTICES.recovered)
    expect(result.canPersist).toBe(true)
    expect(result.state.currentDayKey).toBe('2026-04-14')
    expect(backupKeys()).toEqual([backupKeyFor('{not valid json')])
    expect(storage.data.get(backupKeys()[0])).toBe('{not valid json')
    expect(storage.data.get(STORAGE_KEY)).toBe('{not valid json')
  })

  it('treats a parseable but wrong-shaped value as unreadable', () => {
    const raw = JSON.stringify({ version: 3, library: { habits: [], exercises: [] }, rhythm: {} })
    storage.data.set(STORAGE_KEY, raw)

    const result = loadPersistedState(at(10))

    expect(result.notice).toBe(STORAGE_NOTICES.recovered)
    expect(storage.data.get(backupKeyFor(raw))).toBe(raw)
  })

  it.each(['null', '[]', '"text"', '42'])('treats stored %s as unreadable', (raw) => {
    storage.data.set(STORAGE_KEY, raw)

    expect(loadPersistedState(at(10)).notice).toBe(STORAGE_NOTICES.recovered)
    expect(storage.data.get(backupKeyFor(raw))).toBe(raw)
  })

  it('backs up a v3 state that fails during migration instead of silently wiping it', () => {
    // This shape used to throw inside migrateState and reset everything with no trace.
    const saved = validSavedState()
    delete saved.strength.routines
    const raw = JSON.stringify(saved)
    storage.data.set(STORAGE_KEY, raw)

    const result = loadPersistedState(at(10))

    expect(result.notice).toBe(STORAGE_NOTICES.recovered)
    expect(storage.data.get(backupKeyFor(raw))).toBe(raw)
  })

  it('does not overwrite unreadable data when the backup itself cannot be written', () => {
    storage.data.set(STORAGE_KEY, '{broken')
    storage.failWritesWhen((key) => key.startsWith('health-rhythm-web-backup-'))

    const result = loadPersistedState(at(10))

    expect(result.notice).toBe(STORAGE_NOTICES.unprotected)
    expect(result.canPersist).toBe(false)
    expect(storage.data.get(STORAGE_KEY)).toBe('{broken')
  })

  it('writes the same backup key when recovery runs twice (StrictMode double init)', () => {
    storage.data.set(STORAGE_KEY, '{broken')

    loadPersistedState(at(10))
    loadPersistedState(at(10))

    expect(backupKeys()).toHaveLength(1)
  })

  it('still loads an older v2 save that has no library or routines', () => {
    const saved = validSavedState()
    saved.version = 2
    delete saved.library
    delete saved.strength.routines
    delete saved.selectedTab
    storage.data.set(STORAGE_KEY, JSON.stringify(saved))

    const result = loadPersistedState(at(10))

    expect(result.notice).toBeNull()
    expect(result.state.version).toBe(3)
    expect(result.state.library.habits.length).toBeGreaterThan(0)
    expect(backupKeys()).toHaveLength(0)
  })

  it('falls back to the legacy v1 key when the current key is empty', () => {
    const saved = validSavedState()
    saved.version = 1
    delete saved.library
    storage.data.set('health-rhythm-web-v1', JSON.stringify(saved))

    const result = loadPersistedState(at(10))

    expect(result.notice).toBeNull()
    expect(result.state.version).toBe(3)
  })

  it('starts fresh without a notice when storage cannot be read at all', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('SecurityError')
      },
    })

    const result = loadPersistedState(at(10))

    expect(result.notice).toBeNull()
    expect(result.canPersist).toBe(true)
  })
})

describe('saveState', () => {
  it('returns true and writes the state', () => {
    expect(saveState(stateAt(at(10)))).toBe(true)
    expect(storage.data.has(STORAGE_KEY)).toBe(true)
    expect(getStorageNotice()).toBeNull()
  })

  it('reports a failed write instead of throwing, then clears the notice on recovery', () => {
    storage.failWritesWhen(() => true)

    expect(saveState(stateAt(at(10)))).toBe(false)
    expect(getStorageNotice()).toBe(STORAGE_NOTICES.saveFailed)

    storage.failWritesWhen(() => false)

    expect(saveState(stateAt(at(10)))).toBe(true)
    expect(getStorageNotice()).toBeNull()
  })

  it('does not clear an unrelated notice after a successful save', () => {
    setStorageNotice(STORAGE_NOTICES.recovered)

    saveState(stateAt(at(10)))

    expect(getStorageNotice()).toBe(STORAGE_NOTICES.recovered)
  })
})

describe('abandoned Rhythm sessions', () => {
  const start = at(10)

  function runningRhythm(minutes = 15) {
    const idle = stateAt(start)
    idle.rhythm.selectedDurationMinutes = minutes
    return toggleRhythmState(idle, start)
  }

  it('stamps lastSeenAt while the session is observed', () => {
    const state = refreshAppState(runningRhythm(), minutesAfter(start, 5))

    expect(state.rhythm.status).toBe('running')
    expect(state.rhythm.lastSeenAt).toBe(minutesAfter(start, 5).toISOString())
  })

  it('records only the observed time when the app is found long after the planned end', () => {
    const seen = refreshAppState(runningRhythm(), minutesAfter(start, 5))

    const found = refreshAppState(seen, minutesAfter(start, 180))

    expect(found.rhythm.entriesToday).toHaveLength(1)
    expect(found.rhythm.entriesToday[0].durationSeconds).toBe(300)
    expect(found.rhythm.entriesToday[0].endAt).toBe(minutesAfter(start, 5).toISOString())
    expect(found.rhythm.status).toBe('completed')
  })

  it('discards an abandoned session that was observed for less than the minimum', () => {
    const seen = refreshAppState(runningRhythm(), secondsAfter(start, 30))

    const found = refreshAppState(seen, minutesAfter(start, 180))

    expect(found.rhythm.entriesToday).toHaveLength(0)
    expect(found.rhythm.status).toBe('idle')
  })

  it('does not credit the full duration for a legacy running state with no heartbeat', () => {
    const legacy = runningRhythm()
    delete legacy.rhythm.lastSeenAt

    const found = refreshAppState(legacy, minutesAfter(start, 180))

    expect(found.rhythm.entriesToday).toHaveLength(0)
  })

  it('still records the full duration when the user returns shortly after the planned end', () => {
    const seen = refreshAppState(runningRhythm(15), minutesAfter(start, 5))

    const found = refreshAppState(seen, minutesAfter(start, 17))

    expect(found.rhythm.entriesToday).toHaveLength(1)
    expect(found.rhythm.entriesToday[0].durationSeconds).toBe(900)
  })

  it('completes normally when ticks keep arriving through the target', () => {
    let state = runningRhythm(15)
    for (let minute = 1; minute <= 15; minute += 1) {
      state = refreshAppState(state, minutesAfter(start, minute))
    }

    expect(state.rhythm.status).toBe('completed')
    expect(state.rhythm.entriesToday[0].durationSeconds).toBe(900)
  })

  it('does not treat a paused session as abandoned', () => {
    const paused = toggleRhythmState(runningRhythm(), minutesAfter(start, 5))

    const found = refreshAppState(paused, minutesAfter(start, 180))

    expect(found.rhythm.status).toBe('paused')
    expect(found.rhythm.elapsedSecondsBeforeCurrentRun).toBe(300)
    expect(found.rhythm.entriesToday).toHaveLength(0)
  })

  it('keeps manual End behaviour unchanged', () => {
    const ended = endRhythmState(runningRhythm(), minutesAfter(start, 2))

    expect(ended.rhythm.entriesToday).toHaveLength(1)
    expect(ended.rhythm.entriesToday[0].durationSeconds).toBe(120)
  })
})

describe('sessions across midnight', () => {
  const day1 = '2026-04-14'
  const day2 = '2026-04-15'

  function historyFor(state: AppState, dayKey: string) {
    return state.history.find((record) => record.dayKey === dayKey)
  }

  it('finalizes a running Rhythm session into the old day', () => {
    const start = at(23, 50)
    let state = toggleRhythmState(stateAt(start), start)
    state = refreshAppState(state, at(23, 58))

    state = refreshAppState(state, at(0, 1, 0, 15))

    expect(state.currentDayKey).toBe(day2)
    expect(state.rhythm.status).toBe('idle')
    expect(state.rhythm.entriesToday).toEqual([])
    const old = historyFor(state, day1)
    expect(old?.rhythmEntries).toHaveLength(1)
    expect(old?.rhythmEntries[0].durationSeconds).toBe(600)
    expect(historyFor(state, day2)?.rhythmEntries).toEqual([])
  })

  it('finalizes a paused Rhythm session that has at least the minimum time', () => {
    const start = at(23, 50)
    let state = toggleRhythmState(stateAt(start), start)
    state = toggleRhythmState(state, at(23, 55))

    state = refreshAppState(state, at(0, 10, 0, 15))

    expect(historyFor(state, day1)?.rhythmEntries[0].durationSeconds).toBe(300)
    expect(state.rhythm.status).toBe('idle')
  })

  it('drops a paused Rhythm session shorter than the minimum, like manual End', () => {
    const start = at(23, 50)
    let state = toggleRhythmState(stateAt(start), start)
    state = toggleRhythmState(state, at(23, 50, 30))

    state = refreshAppState(state, at(0, 10, 0, 15))

    expect(historyFor(state, day1)?.rhythmEntries).toEqual([])
  })

  it('uses the abandoned rule when the app is reopened the next morning', () => {
    const start = at(23, 50)
    let state = toggleRhythmState(stateAt(start), start)
    state = refreshAppState(state, at(23, 53))

    state = refreshAppState(state, at(7, 0, 0, 15))

    expect(historyFor(state, day1)?.rhythmEntries[0].durationSeconds).toBe(180)
  })

  it('finalizes a running Breath session with only the rounds completed before midnight', () => {
    const start = at(23, 59, 0)
    let state = toggleBreathState(stateAt(start), start)
    state = refreshAppState(state, at(23, 59, 30))

    // 4-7-8 is 19 s per round: 60 s before midnight is 3 rounds, 90 s would be 4.
    state = refreshAppState(state, at(0, 0, 30, 15))

    expect(state.currentDayKey).toBe(day2)
    expect(state.breath.status).toBe('idle')
    expect(state.breath.entriesToday).toEqual([])
    const sessions = historyFor(state, day1)?.breathSessions ?? []
    expect(sessions).toHaveLength(1)
    expect(sessions[0].completedRounds).toBe(3)
    expect(sessions[0].totalDurationSeconds).toBe(60)
  })

  it('leaves a normal same-day tick untouched', () => {
    const start = at(10)
    const running = toggleRhythmState(stateAt(start), start)

    const state = refreshAppState(running, minutesAfter(start, 1))

    expect(state.currentDayKey).toBe(toDayKey(start))
    expect(state.rhythm.status).toBe('running')
    expect(state.rhythm.entriesToday).toEqual([])
  })
})
