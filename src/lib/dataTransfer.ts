// Export, import and backup restore. Everything that replaces live data goes through
// `replaceWithSafetyCopy`, which never swaps data in before a copy of the current state is
// stored and the new state is written.

import { MOVEMENT_TYPES, toDayKey, type AppState, type DayRecord } from './domain'
import {
  buildDailyHistorySummary,
  buildHistorySummary,
  buildTodayTimeline,
  historyEarliestDayKey,
  movementDefaultsFor,
  restoreStoredState,
  saveState,
} from './state'
import { pruneSafetyCopies, readBackup, writeBackup, type BackupReason } from './backupStore'

export const EXPORT_FORMAT = 'healthrhythm-export'
export const EXPORT_FORMAT_VERSION = 1
/** Saves with these `version` values are understood by migrateState. */
const SUPPORTED_STATE_VERSIONS: readonly unknown[] = [undefined, 1, 2, 3]
// localStorage holds roughly 5 MB per site, so nothing larger could be stored anyway.
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024
export const SAFETY_COPIES_KEPT = 5

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  formatVersion: typeof EXPORT_FORMAT_VERSION
  exportedAt: string
  stateVersion: AppState['version']
  state: AppState
}

export interface DataSummary {
  recordedDaysCount: number
  firstDayKey: string | null
  lastDayKey: string | null
  movementSessionsCount: number
}

export type ParseResult =
  | { ok: true; state: AppState; exportedAt: string | null; summary: DataSummary }
  | { ok: false; error: string }

export type ReplaceResult = { ok: true; backupKey: string } | { ok: false; error: string }

export const DATA_ERRORS = {
  tooLarge: '文件太大，不是 HealthRhythm 导出的数据。',
  notJson: '文件不是有效的 JSON，无法导入。',
  unsupportedFormat: '这个文件来自更新版本的 HealthRhythm，当前版本无法读取。',
  invalid: '文件内容不完整或已损坏，无法导入。',
  backupMissing: '找不到这份备份，可能已被删除。',
  backupFailed: '无法先保存当前数据的备份（存储空间可能已满），已取消，当前数据未改变。请先删除不需要的备份。',
  saveFailed: '无法写入新数据，已取消，当前数据未改变。',
} as const

export function exportFileName(now: Date) {
  return `healthrhythm-backup-${toDayKey(now)}.json`
}

/** A self-describing copy of the full persisted state. Does not touch `state` or storage. */
export function buildExportText(state: AppState, now: Date) {
  const file: ExportFile = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    stateVersion: state.version,
    state,
  }
  return JSON.stringify(file, null, 2)
}

/**
 * Accepts an export file, or a bare saved state as found in localStorage (v1/v2/v3).
 * Returns a migrated state ready for `now`, or a user-facing reason it was rejected.
 */
export function parseImportText(text: string, now: Date): ParseResult {
  if (text.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: DATA_ERRORS.tooLarge }
  }

  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: DATA_ERRORS.notJson }
  }

  let stateValue = value
  let exportedAt: string | null = null
  if (isRecord(value) && 'format' in value) {
    if (value.format !== EXPORT_FORMAT || typeof value.formatVersion !== 'number') {
      return { ok: false, error: DATA_ERRORS.invalid }
    }
    if (value.formatVersion > EXPORT_FORMAT_VERSION) {
      return { ok: false, error: DATA_ERRORS.unsupportedFormat }
    }
    stateValue = value.state
    exportedAt = typeof value.exportedAt === 'string' ? value.exportedAt : null
  }

  if (isRecord(stateValue) && !SUPPORTED_STATE_VERSIONS.includes(stateValue.version)) {
    return { ok: false, error: DATA_ERRORS.unsupportedFormat }
  }

  let state: AppState
  try {
    state = restoreStoredState(stateValue, now)
    assertUsableState(state)
  } catch {
    return { ok: false, error: DATA_ERRORS.invalid }
  }

  return { ok: true, state, exportedAt, summary: summarizeState(state) }
}

export function parseBackup(key: string, now: Date): ParseResult {
  const raw = readBackup(key)
  return raw === null ? { ok: false, error: DATA_ERRORS.backupMissing } : parseImportText(raw, now)
}

/**
 * Stores the current state as a recovery backup, confirms it reads back intact, then writes
 * `next`. Stops before anything is replaced if either step fails. On success the caller swaps
 * `next` into memory.
 */
export function replaceWithSafetyCopy(
  current: AppState,
  next: AppState,
  reason: Extract<BackupReason, 'before-import' | 'before-restore'>,
  now: Date,
  // The backup being restored from: cleanup must never remove it as a side effect.
  restoredKey?: string,
): ReplaceResult {
  const currentRaw = JSON.stringify(current)
  const backupKey = writeBackup(currentRaw, reason, now)
  if (backupKey === null || readBackup(backupKey) !== currentRaw) {
    return { ok: false, error: DATA_ERRORS.backupFailed }
  }

  if (!saveState(next)) {
    return { ok: false, error: DATA_ERRORS.saveFailed }
  }

  pruneSafetyCopies(SAFETY_COPIES_KEPT, restoredKey ? [backupKey, restoredKey] : [backupKey])
  return { ok: true, backupKey }
}

export function summarizeState(state: AppState): DataSummary {
  const recorded = state.history.filter(hasContent).map((record) => record.dayKey).sort()
  return {
    recordedDaysCount: recorded.length,
    firstDayKey: recorded[0] ?? null,
    lastDayKey: recorded.at(-1) ?? null,
    movementSessionsCount: state.history.reduce((total, record) => total + record.movementSessions.length, 0),
  }
}

function hasContent(record: DayRecord) {
  return (
    record.rhythmEntries.length > 0 ||
    record.breathSessions.length > 0 ||
    record.strengthCompletedExerciseIds.length > 0 ||
    Object.keys(record.habits).length > 0 ||
    Object.keys(record.foundation).length > 0 ||
    record.movementSessions.length > 0
  )
}

// ─── Deeper validation for data from outside the app ────────────────────────
//
// restoreStoredState only checks what loading dereferences immediately. Imported files are
// less trusted, so every record the UI reads is checked too, and then the same summaries
// Today and History compute are run once: anything that would crash the UI is rejected here.

const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(field: string): never {
  throw new Error(`Imported state is invalid: ${field}`)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function checkArray(value: unknown, field: string, checkItem: (item: Record<string, unknown>) => boolean) {
  if (!Array.isArray(value)) fail(field)
  value.forEach((item, index) => {
    if (!isRecord(item) || !checkItem(item)) fail(`${field}[${index}]`)
  })
}

function checkTimestampMap(value: unknown, field: string) {
  if (!isRecord(value) || !Object.values(value).every((entry) => entry === undefined || isString(entry))) {
    fail(field)
  }
}

const isRhythmEntry = (entry: Record<string, unknown>) =>
  isString(entry.id) && isString(entry.startAt) && isString(entry.endAt) && isFiniteNumber(entry.durationSeconds)

const isBreathSession = (entry: Record<string, unknown>) =>
  isString(entry.id) &&
  isString(entry.startAt) &&
  isFiniteNumber(entry.totalDurationSeconds) &&
  isFiniteNumber(entry.completedRounds) &&
  isString(entry.mode) &&
  isRecord(entry.pattern)

const isMovementSession = (entry: Record<string, unknown>) =>
  isString(entry.id) &&
  isString(entry.typeId) &&
  isString(entry.loggedAt) &&
  isFiniteNumber(entry.durationMinutes) &&
  (entry.intensity === undefined || isString(entry.intensity)) &&
  (entry.note === undefined || isString(entry.note))

function assertUsableState(state: AppState) {
  if (!isString(state.currentDayKey) || !DAY_KEY_PATTERN.test(state.currentDayKey)) fail('currentDayKey')

  checkArray(state.rhythm.entriesToday, 'rhythm.entriesToday', isRhythmEntry)
  checkArray(state.breath.entriesToday, 'breath.entriesToday', isBreathSession)

  checkTimestampMap(state.today.completionTimesByHabitId, 'today.completionTimesByHabitId')
  checkTimestampMap(state.today.foundationCompletedAt, 'today.foundationCompletedAt')
  if (
    !isRecord(state.today.eventsByHabitId) ||
    !Object.values(state.today.eventsByHabitId).every(
      (events) => events === undefined || (Array.isArray(events) && events.every(isString)),
    )
  ) {
    fail('today.eventsByHabitId')
  }
  checkArray(state.today.movementSessions, 'today.movementSessions', isMovementSession)

  if (!state.strength.completedExerciseIds.every(isString)) fail('strength.completedExerciseIds')
  checkArray(
    state.strength.routines,
    'strength.routines',
    (routine) =>
      isString(routine.id) &&
      isString(routine.name) &&
      Array.isArray(routine.exercises) &&
      routine.exercises.every((exercise) => isRecord(exercise) && isString(exercise.exerciseId)),
  )
  checkArray(state.library.habits, 'library.habits', (habit) => isString(habit.id) && isString(habit.name))
  checkArray(state.library.exercises, 'library.exercises', (exercise) => isString(exercise.id) && isString(exercise.name))

  checkArray(state.history, 'history', (record) => {
    if (!isString(record.dayKey) || !DAY_KEY_PATTERN.test(record.dayKey)) return false
    checkArray(record.rhythmEntries, `history ${record.dayKey} rhythm`, isRhythmEntry)
    checkArray(record.breathSessions, `history ${record.dayKey} breath`, isBreathSession)
    checkArray(record.movementSessions, `history ${record.dayKey} movement`, isMovementSession)
    checkTimestampMap(record.habits, `history ${record.dayKey} habits`)
    checkTimestampMap(record.foundation, `history ${record.dayKey} foundation`)
    return Array.isArray(record.strengthCompletedExerciseIds) && record.strengthCompletedExerciseIds.every(isString)
  })

  // Run what Today and History compute, so a state that would crash rendering is rejected now.
  buildTodayTimeline(state, state.library.habits, [])
  buildHistorySummary(state.history, state.history.map((record) => record.dayKey), state.currentDayKey)
  for (const record of state.history) {
    buildDailyHistorySummary(record, [])
  }
  historyEarliestDayKey(state)
  for (const type of MOVEMENT_TYPES) {
    movementDefaultsFor(state, type.id)
  }
}
