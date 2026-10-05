import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  BACKUP_KEY_PREFIX,
  backupKeyFor,
  deleteBackup,
  listBackups,
  pruneSafetyCopies,
  readBackup,
  writeBackup,
} from './backupStore'
import {
  DATA_ERRORS,
  EXPORT_FORMAT,
  SAFETY_COPIES_KEPT,
  buildExportText,
  exportFileName,
  parseBackup,
  parseImportText,
  replaceWithSafetyCopy,
} from './dataTransfer'
import { createInitialState, type AppState } from './domain'
import {
  addMovementSessionState,
  endRhythmState,
  ensureCurrentDay,
  loadPersistedState,
  saveState,
  toggleBreathState,
  toggleFoundationItemState,
  toggleRhythmState,
} from './state'
import { resetStorageStatus } from './storageStatus'

const STORAGE_KEY = 'health-rhythm-web-v2'
const INDEX_KEY = 'health-rhythm-web-meta-backups'

function makeStorage() {
  const data = new Map<string, string>()
  let failWrite: (key: string) => boolean = () => false
  return {
    data,
    failWritesWhen(predicate: (key: string) => boolean) {
      failWrite = predicate
    },
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem(key: string, value: string) {
      if (failWrite(key)) throw new Error('QuotaExceededError')
      data.set(key, String(value))
    },
    removeItem: (key: string) => void data.delete(key),
  }
}

let storage: ReturnType<typeof makeStorage>

beforeEach(() => {
  storage = makeStorage()
  vi.stubGlobal('localStorage', storage)
  resetStorageStatus()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const at = (hour: number, minute = 0, dayOfMonth = 15) => new Date(2026, 3, dayOfMonth, hour, minute)
const NOW = at(12)
const snapshot = () => new Map(storage.data)
const json = (state: AppState) => JSON.stringify(state)

/** A state touching every persisted area, including foundation and all movement types. */
function richState(): AppState {
  // Yesterday (04-14): becomes a history record at the day change.
  let state = ensureCurrentDay(createInitialState(at(7, 0, 14)), at(7, 0, 14))
  state = toggleFoundationItemState(state, 'lowerAbs', at(7, 0, 14))
  state = toggleFoundationItemState(state, 'pelvicFloor', at(7, 5, 14))
  state = addMovementSessionState(state, { typeId: 'swimming', durationMinutes: 40, intensity: 'moderate', note: '自由泳 1000 米' }, at(18, 0, 14))
  state = addMovementSessionState(state, { typeId: 'jingang', durationMinutes: 35, intensity: 'light' }, at(19, 0, 14))
  state = toggleRhythmState(state, at(8, 0, 14))
  state = endRhythmState(state, at(8, 20, 14))
  state = {
    ...state,
    today: { ...state.today, completionTimesByHabitId: { earlySleep: at(21, 0, 14).toISOString() } },
    strength: { ...state.strength, completedExerciseIds: ['routine-a-dead-bug'], lastUpdatedAt: at(9, 0, 14).toISOString() },
    library: {
      ...state.library,
      habits: [...state.library.habits, { id: 'habit-custom', name: '晒太阳', category: 'Care', note: '', enabled: true, showOnToday: true }],
    },
  }
  // Today (04-15).
  state = ensureCurrentDay(state, at(7))
  for (const id of ['lowerAbs', 'lowerBack', 'pelvicFloor', 'spineMobility'] as const) {
    state = toggleFoundationItemState(state, id, at(7, 10))
  }
  state = addMovementSessionState(state, { typeId: 'zumba', durationMinutes: 45, intensity: 'hard', note: '晚课' }, at(10))
  state = addMovementSessionState(state, { typeId: 'yoga', durationMinutes: 30 }, at(11))
  state = toggleBreathState(state, at(11, 30))
  state = ensureCurrentDay(toggleBreathState(state, at(11, 31)), NOW)
  return ensureCurrentDay(state, NOW)
}

describe('export', () => {
  it('wraps the complete state with format, version and time', () => {
    const state = richState()
    const file = JSON.parse(buildExportText(state, NOW))

    expect(file).toMatchObject({ format: EXPORT_FORMAT, formatVersion: 1, stateVersion: 3, exportedAt: NOW.toISOString() })
    expect(JSON.stringify(file.state)).toBe(json(state))
    expect(Object.keys(file).sort()).toEqual(['exportedAt', 'format', 'formatVersion', 'state', 'stateVersion'])
  })

  it('contains foundation, every movement type with notes, durations and intensities, and history', () => {
    const { state } = JSON.parse(buildExportText(richState(), NOW)) as { state: AppState }
    const yesterday = state.history.find((record) => record.dayKey === '2026-04-14')!

    expect(Object.keys(state.today.foundationCompletedAt)).toHaveLength(4)
    expect(yesterday.foundation).toHaveProperty('pelvicFloor')
    const sessions = [...yesterday.movementSessions, ...state.today.movementSessions]
    expect(sessions.map((session) => session.typeId).sort()).toEqual(['jingang', 'swimming', 'yoga', 'zumba'])
    expect(sessions.find((session) => session.typeId === 'swimming')).toMatchObject({ durationMinutes: 40, intensity: 'moderate', note: '自由泳 1000 米' })
    expect(sessions.find((session) => session.typeId === 'zumba')).toMatchObject({ intensity: 'hard', note: '晚课' })
    expect(yesterday.rhythmEntries).toHaveLength(1)
    expect(yesterday.habits).toHaveProperty('earlySleep')
    expect(state.library.habits.some((habit) => habit.id === 'habit-custom')).toBe(true)
  })

  it('does not change the state or storage', () => {
    const state = richState()
    saveState(state)
    const before = json(state)
    const storageBefore = snapshot()

    buildExportText(state, NOW)

    expect(json(state)).toBe(before)
    expect(storage.data).toEqual(storageBefore)
  })

  it('names the file by local date', () => {
    expect(exportFileName(at(23, 59))).toBe('healthrhythm-backup-2026-04-15.json')
  })
})

describe('import parsing', () => {
  it('accepts a current export', () => {
    const state = richState()
    const result = parseImportText(buildExportText(state, NOW), NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(json(result.state)).toBe(json(state))
    expect(result.exportedAt).toBe(NOW.toISOString())
    expect(result.summary).toEqual({
      recordedDaysCount: 2,
      firstDayKey: '2026-04-14',
      lastDayKey: '2026-04-15',
      movementSessionsCount: 4,
    })
  })

  it.each([1, 2] as const)('migrates a bare v%s save (as stored in localStorage)', (version) => {
    const saved = JSON.parse(json(richState())) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    saved.version = version
    delete saved.library
    delete saved.strength.routines
    delete saved.selectedTab
    delete saved.today.eventsByHabitId
    delete saved.today.foundationCompletedAt
    delete saved.today.movementSessions
    for (const record of saved.history) {
      delete record.foundation
      delete record.movementSessions
    }

    const result = parseImportText(JSON.stringify(saved), NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.version).toBe(3)
    expect(result.state.library.habits.length).toBeGreaterThan(0)
    expect(result.state.today.movementSessions).toEqual([])
    expect(result.state.history.find((record) => record.dayKey === '2026-04-14')!.rhythmEntries).toHaveLength(1)
  })

  it('accepts an older save wrapped in an export file', () => {
    const saved = JSON.parse(json(richState()))
    saved.version = 2
    delete saved.library
    const file = { format: EXPORT_FORMAT, formatVersion: 1, exportedAt: NOW.toISOString(), stateVersion: 2, state: saved }

    expect(parseImportText(JSON.stringify(file), NOW).ok).toBe(true)
  })

  it.each([
    ['empty text', '', DATA_ERRORS.notJson],
    ['broken JSON', '{"format": "healthrhythm-export",', DATA_ERRORS.notJson],
    ['plain text', 'hello', DATA_ERRORS.notJson],
  ])('rejects %s as not JSON', (_, text, error) => {
    expect(parseImportText(text, NOW)).toEqual({ ok: false, error })
  })

  it('rejects a file that is too large', () => {
    expect(parseImportText(' '.repeat(5 * 1024 * 1024 + 1), NOW)).toEqual({ ok: false, error: DATA_ERRORS.tooLarge })
  })

  // History is sorted newest first; target the past day explicitly.
  const yesterdayIn = (file: Record<string, any>) => file.state.history.find((record: { dayKey: string }) => record.dayKey === '2026-04-14') // eslint-disable-line @typescript-eslint/no-explicit-any
  const exportWith = (mutate: (file: Record<string, any>) => void) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const file = JSON.parse(buildExportText(richState(), NOW))
    mutate(file)
    return JSON.stringify(file)
  }

  it.each([
    ['JSON null', 'null'],
    ['an array', '[]'],
    ['a number', '42'],
    ['an unrelated object', '{"name":"something else"}'],
    ['another app’s format', exportWith((file) => (file.format = 'other-app'))],
    ['an export without state', exportWith((file) => delete file.state)],
    ['a state without rhythm', exportWith((file) => delete file.state.rhythm)],
    ['a bad breath status', exportWith((file) => (file.state.breath.status = 'sleeping'))],
    ['history that is not a list', exportWith((file) => (file.state.history = {}))],
    ['a history record with a bad day key', exportWith((file) => (yesterdayIn(file).dayKey = 'yesterday'))],
    ['a movement session without minutes', exportWith((file) => delete yesterdayIn(file).movementSessions[0].durationMinutes)],
    ['movement minutes as text', exportWith((file) => (file.state.today.movementSessions[0].durationMinutes = '45'))],
    ['a rhythm entry without duration', exportWith((file) => delete yesterdayIn(file).rhythmEntries[0].durationSeconds)],
    ['habits that are not a list', exportWith((file) => (file.state.library.habits = 'none'))],
    ['a habit without a name', exportWith((file) => delete file.state.library.habits[0].name)],
    ['routine exercises that are not a list', exportWith((file) => (file.state.strength.routines[0].exercises = null))],
    ['foundation times that are not text', exportWith((file) => (file.state.today.foundationCompletedAt.lowerAbs = 5))],
  ])('rejects %s as invalid', (_, text) => {
    expect(parseImportText(text, NOW)).toEqual({ ok: false, error: DATA_ERRORS.invalid })
  })

  it.each([
    ['a newer export format', exportWith((file) => (file.formatVersion = 2))],
    ['a newer state version', exportWith((file) => (file.state.version = 4))],
  ])('rejects %s as unsupported', (_, text) => {
    expect(parseImportText(text, NOW)).toEqual({ ok: false, error: DATA_ERRORS.unsupportedFormat })
  })

  it('never writes to storage while parsing, valid or not', () => {
    saveState(richState())
    const before = snapshot()

    parseImportText(buildExportText(richState(), NOW), NOW)
    parseImportText('{broken', NOW)

    expect(storage.data).toEqual(before)
  })
})

describe('replacing live data', () => {
  function liveAndCandidate() {
    const live = ensureCurrentDay(createInitialState(NOW), NOW)
    saveState(live)
    const candidate = richState()
    return { live, candidate }
  }

  it('backs up the live state, then writes the new one', () => {
    const { live, candidate } = liveAndCandidate()

    const result = replaceWithSafetyCopy(live, candidate, 'before-import', NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readBackup(result.backupKey)).toBe(json(live))
    expect(storage.data.get(STORAGE_KEY)).toBe(json(candidate))
    expect(listBackups()[0].meta).toEqual({ createdAt: NOW.toISOString(), reason: 'before-import' })
    expect(json(loadPersistedState(NOW).state)).toBe(json(candidate))
  })

  it('leaves the live data untouched when the backup cannot be written', () => {
    const { live, candidate } = liveAndCandidate()
    storage.failWritesWhen((key) => key.startsWith(BACKUP_KEY_PREFIX))

    expect(replaceWithSafetyCopy(live, candidate, 'before-import', NOW)).toEqual({ ok: false, error: DATA_ERRORS.backupFailed })
    expect(storage.data.get(STORAGE_KEY)).toBe(json(live))
    expect(listBackups()).toEqual([])
  })

  it('leaves the live data untouched when the new state cannot be written, and keeps the backup', () => {
    const { live, candidate } = liveAndCandidate()
    storage.failWritesWhen((key) => key === STORAGE_KEY)

    const result = replaceWithSafetyCopy(live, candidate, 'before-import', NOW)

    expect(result).toEqual({ ok: false, error: DATA_ERRORS.saveFailed })
    expect(storage.data.get(STORAGE_KEY)).toBe(json(live))
    expect(listBackups().map((backup) => backup.raw)).toEqual([json(live)])
  })

  it('does not lose existing recovery backups when an import is rejected', () => {
    const corrupt = writeBackup('{corrupt old data', 'unreadable', at(9))!
    const before = snapshot()

    expect(parseImportText('not json', NOW).ok).toBe(false)

    expect(storage.data).toEqual(before)
    expect(readBackup(corrupt)).toBe('{corrupt old data')
  })
})

describe('recovery backups', () => {
  it('lists only backup keys, newest first, with size and origin', () => {
    saveState(richState())
    storage.data.set('unrelated-key', 'x')
    storage.data.set(`${BACKUP_KEY_PREFIX}legacy-1`, '{"from":"before metadata existed"}')
    writeBackup('{broken', 'unreadable', at(8))
    writeBackup(json(richState()), 'before-import', at(10))

    const backups = listBackups()

    expect(backups.map((backup) => backup.meta?.reason ?? null)).toEqual(['before-import', 'unreadable', null])
    expect(backups.every((backup) => backup.key.startsWith(BACKUP_KEY_PREFIX))).toBe(true)
    expect(backups.find((backup) => backup.meta?.reason === 'unreadable')!.sizeBytes).toBe(7)
    expect(backups.some((backup) => backup.key === INDEX_KEY)).toBe(false)
  })

  it('records unreadable saves found at startup as such', () => {
    storage.data.set(STORAGE_KEY, '{not valid json')

    loadPersistedState(NOW)

    expect(listBackups()).toEqual([
      expect.objectContaining({ key: backupKeyFor('{not valid json'), raw: '{not valid json', meta: expect.objectContaining({ reason: 'unreadable' }) }),
    ])
  })

  it('parses a valid backup for restore and rejects a corrupt one', () => {
    const good = writeBackup(json(richState()), 'before-import', NOW)!
    const bad = writeBackup('{"rhythm": 1', 'unreadable', NOW)!

    expect(parseBackup(good, NOW).ok).toBe(true)
    expect(parseBackup(bad, NOW)).toEqual({ ok: false, error: DATA_ERRORS.notJson })
    expect(parseBackup(`${BACKUP_KEY_PREFIX}missing`, NOW)).toEqual({ ok: false, error: DATA_ERRORS.backupMissing })
    expect(parseBackup(STORAGE_KEY, NOW)).toEqual({ ok: false, error: DATA_ERRORS.backupMissing })
  })

  it('restores a backup after saving the live state, and keeps the restored backup', () => {
    const restoredState = richState()
    const chosen = writeBackup(json(restoredState), 'before-import', at(9))!
    const live = ensureCurrentDay(createInitialState(NOW), NOW)
    saveState(live)
    const parsed = parseBackup(chosen, NOW)
    if (!parsed.ok) throw new Error(parsed.error)

    const result = replaceWithSafetyCopy(live, parsed.state, 'before-restore', NOW)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(readBackup(chosen)).toBe(json(restoredState))
    expect(readBackup(result.backupKey)).toBe(json(live))
    expect(storage.data.get(STORAGE_KEY)).toBe(json(restoredState))
  })

  it('deletes one backup without touching live data or other backups', () => {
    saveState(richState())
    const keep = writeBackup('{"a":1}', 'unreadable', at(8))!
    const remove = writeBackup('{"b":2}', 'before-import', at(9))!
    const live = storage.data.get(STORAGE_KEY)

    expect(deleteBackup(remove)).toBe(true)

    expect(readBackup(remove)).toBeNull()
    expect(readBackup(keep)).toBe('{"a":1}')
    expect(storage.data.get(STORAGE_KEY)).toBe(live)
    expect(JSON.parse(storage.data.get(INDEX_KEY)!)).not.toHaveProperty(remove)
  })

  it('refuses to delete anything that is not a backup', () => {
    saveState(richState())

    expect(deleteBackup(STORAGE_KEY)).toBe(false)
    expect(deleteBackup(INDEX_KEY)).toBe(false)
    expect(storage.data.has(STORAGE_KEY)).toBe(true)
  })

  it('stores identical content once and never downgrades its origin', () => {
    const first = writeBackup('{"same":true}', 'unreadable', at(8))
    const second = writeBackup('{"same":true}', 'before-restore', at(9))

    expect(second).toBe(first)
    expect(listBackups()).toHaveLength(1)
    expect(listBackups()[0].meta).toEqual({ createdAt: at(8).toISOString(), reason: 'unreadable' })
  })

  it('never overwrites a different backup that happens to share a key', () => {
    const raw = '{"new":true}'
    storage.data.set(backupKeyFor(raw), 'older different content')

    const key = writeBackup(raw, 'before-import', NOW)!

    expect(key).not.toBe(backupKeyFor(raw))
    expect(storage.data.get(backupKeyFor(raw))).toBe('older different content')
    expect(readBackup(key)).toBe(raw)
  })

  it('still lists backups when the metadata index is corrupt', () => {
    writeBackup('{"x":1}', 'before-import', NOW)
    storage.data.set(INDEX_KEY, '{oops')

    expect(listBackups()).toEqual([expect.objectContaining({ raw: '{"x":1}', meta: null })])
  })
})

describe('cleanup', () => {
  it(`keeps only the newest ${SAFETY_COPIES_KEPT} safety copies and never touches other backups`, () => {
    const unreadable = writeBackup('{"lost":1}', 'unreadable', at(1))!
    storage.data.set(`${BACKUP_KEY_PREFIX}legacy-1`, '{"legacy":1}')
    const copies = Array.from({ length: 7 }, (_, index) => writeBackup(`{"copy":${index}}`, 'before-import', at(2 + index))!)

    const removed = pruneSafetyCopies(SAFETY_COPIES_KEPT, [copies[6]])

    expect(removed.sort()).toEqual([copies[0], copies[1]].sort())
    expect(copies.slice(2).every((key) => readBackup(key) !== null)).toBe(true)
    expect(readBackup(unreadable)).toBe('{"lost":1}')
    expect(readBackup(`${BACKUP_KEY_PREFIX}legacy-1`)).toBe('{"legacy":1}')
  })

  it('always keeps the copy just made, even if its time sorts oldest', () => {
    const copies = Array.from({ length: 6 }, (_, index) => writeBackup(`{"copy":${index}}`, 'before-restore', at(2 + index))!)

    pruneSafetyCopies(SAFETY_COPIES_KEPT, [copies[0]])

    expect(readBackup(copies[0])).not.toBeNull()
    expect(listBackups()).toHaveLength(SAFETY_COPIES_KEPT)
  })

  it('never removes the backup that was just restored, even when it is the oldest copy', () => {
    // Five distinct, restorable states.
    const copies = Array.from({ length: SAFETY_COPIES_KEPT }, (_, index) => {
      const state = ensureCurrentDay(createInitialState(NOW), NOW)
      state.rhythm.selectedDurationMinutes = [15, 30, 45, 60, 15][index]
      state.breath.selectedRounds = index
      return writeBackup(json(state), 'before-import', at(2 + index))!
    })
    const oldest = copies[0]
    const parsed = parseBackup(oldest, NOW)
    if (!parsed.ok) throw new Error(parsed.error)

    const result = replaceWithSafetyCopy(richState(), parsed.state, 'before-restore', NOW, oldest)

    expect(result.ok).toBe(true)
    expect(readBackup(oldest)).not.toBeNull()
    if (result.ok) expect(readBackup(result.backupKey)).not.toBeNull()
  })

  it('prunes after a successful replacement, never before', () => {
    const copies = Array.from({ length: 6 }, (_, index) => writeBackup(`{"copy":${index}}`, 'before-import', at(2 + index))!)
    const live = ensureCurrentDay(createInitialState(NOW), NOW)
    storage.failWritesWhen((key) => key === STORAGE_KEY)

    replaceWithSafetyCopy(live, richState(), 'before-import', NOW)

    expect(copies.every((key) => readBackup(key) !== null)).toBe(true)
  })
})

describe('full round trip', () => {
  it('export → reset → import → restore reproduces each state exactly', () => {
    const original = richState()
    saveState(original)
    const exported = buildExportText(original, NOW)

    // Reset: storage wiped, app starts fresh.
    storage.data.clear()
    const fresh = loadPersistedState(NOW).state
    saveState(fresh)

    // Import the file.
    const imported = parseImportText(exported, NOW)
    if (!imported.ok) throw new Error(imported.error)
    const importResult = replaceWithSafetyCopy(fresh, imported.state, 'before-import', NOW)
    if (!importResult.ok) throw new Error(importResult.error)
    const afterImport = loadPersistedState(NOW).state
    expect(json(afterImport)).toBe(json(original))

    // Restore the fresh state from its automatic backup …
    const backOut = parseBackup(importResult.backupKey, NOW)
    if (!backOut.ok) throw new Error(backOut.error)
    const restoreResult = replaceWithSafetyCopy(afterImport, backOut.state, 'before-restore', NOW)
    if (!restoreResult.ok) throw new Error(restoreResult.error)
    expect(json(loadPersistedState(NOW).state)).toBe(json(fresh))

    // … and the imported data again from the copy made before that restore.
    const again = parseBackup(restoreResult.backupKey, NOW)
    if (!again.ok) throw new Error(again.error)
    replaceWithSafetyCopy(backOut.state, again.state, 'before-restore', NOW)
    const final = loadPersistedState(NOW).state
    expect(json(final)).toBe(json(original))
    expect(final.today.movementSessions.map((session) => session.note ?? null)).toEqual(['晚课', null])
  })
})
