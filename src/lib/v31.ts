import type { GroupDayExtras } from './groups'
import { parseMovementMinutes, createEmptyDayRecord, shiftDayKey, toDayKey, makeLocalId, type AppState, type DayRecord, type HabitDefinition, type TodayTimelineEvent, type MovementSessionDraft } from './domain'
import { habitMode } from './v3'

export interface DominoBlock {
  id: string
  name: string
  itemIds: string[]
  assignment: 'same-day' | 'next-day-review'
  hidden: boolean
}
export interface RecordInfo {
  occurredDate: string
  occurredTime: string | null
  precision: 'exact' | 'approximate' | 'unknown'
  assignedDate: string
  recordedAt: string | null
  note?: string
}
export interface JournalEntry { id: string; text: string; recordedAt: string }
export interface DayExtras extends GroupDayExtras {
  captureIds?: Partial<Record<string, string[]>>
  recordDetails?: Record<string, RecordInfo>
  journals?: JournalEntry[]
  dominoSnapshots?: DominoBlock[]
}
export interface RecordEdit extends RecordInfo { durationMinutes?: number }

const NEW_ITEMS: [string, string][] = [
  ['domino-faith', '虔信时刻'], ['domino-morning-practice', '晨习'], ['domino-wuya', '无压'],
  ['domino-offline', '断网'], ['domino-wash', '洗漱'], ['domino-bed-reading', '睡前轻阅读'],
]
export function seedV31(state: AppState): AppState {
  const habits = [...state.library.habits]
  // Match known IDs plus built-in provenance. Ambiguous names/ID collisions stay intact.
  const seedIds: Record<string, string> = {}
  if (!state.library.dominoBlocks) {
    for (const [baseId, name] of NEW_ITEMS) {
      const existing = habits.find((habit) => habit.id === baseId)
      if (existing?.isBuiltIn && existing.name === name && existing.category === '多米诺') { seedIds[baseId] = baseId; continue }
      let id = baseId, suffix = 1
      while (habits.some((habit) => habit.id === id)) id = `${baseId}-v31-${suffix++}`
      seedIds[baseId] = id
      habits.push({ id, name, category: '多米诺', group: '每日习惯', recordingMode: 'single', frequency: 'daily', note: '', enabled: true, showOnToday: true, isBuiltIn: true })
    }
  }
  const blocks = state.library.dominoBlocks ?? [
    { id: 'domino-morning', name: '晨间多米诺', itemIds: [seedIds['domino-faith'], seedIds['domino-morning-practice'], seedIds['domino-wuya'], 'jingang'], assignment: 'same-day', hidden: false },
    { id: 'domino-bedtime', name: '睡前多米诺', itemIds: [seedIds['domino-offline'], seedIds['domino-wash'], 'foot-soak', seedIds['domino-bed-reading'], 'earlySleep'], assignment: 'next-day-review', hidden: false },
  ] satisfies DominoBlock[]
  const withIds = (events: Partial<Record<string, string[]>>, day: string, old: DayExtras['captureIds']) => {
    const ids = { ...old }
    for (const [id, captures] of Object.entries(events)) if (captures?.length) ids[id] = captures.map((_time, index) => old?.[id]?.[index] ?? `capture-${day}-${id}-${index}`)
    return Object.keys(ids).length ? ids : undefined
  }
  return {
    ...state, library: { ...state.library, habits, dominoBlocks: blocks },
    today: { ...state.today, ...(withIds(state.today.eventsByHabitId, state.currentDayKey, state.today.captureIds) ? { captureIds: withIds(state.today.eventsByHabitId, state.currentDayKey, state.today.captureIds) } : {}) },
    history: state.history.map((record) => ({ ...record, ...(withIds(record.habitEvents, record.dayKey, record.captureIds) ? { captureIds: withIds(record.habitEvents, record.dayKey, record.captureIds) } : {}) })),
  }
}
export function validDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const [year, month, date] = day.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, date))
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === date
}
export function occurrenceDay(block: DominoBlock, assigned: string) {
  // Local calendar arithmetic, never subtract milliseconds across DST.
  return block.assignment === 'next-day-review' ? shiftDayKey(assigned, -1) : assigned
}
export function dayRecord(state: AppState, day: string): DayRecord {
  if (day === state.currentDayKey) return {
    ...createEmptyDayRecord(day),
    ...(state.today.groupSessions ? { groupSessions: state.today.groupSessions } : {}),
    ...(state.today.strengthEntries ? { strengthEntries: state.today.strengthEntries } : {}),
    ...(state.today.captureIds ? { captureIds: state.today.captureIds } : {}),
    ...(state.today.recordDetails ? { recordDetails: state.today.recordDetails } : {}),
    ...(state.today.journals ? { journals: state.today.journals } : {}),
    ...(state.today.dominoSnapshots ? { dominoSnapshots: state.today.dominoSnapshots } : {}),
    movementSessions: state.today.movementSessions,
    habits: state.today.completionTimesByHabitId, habitEvents: state.today.eventsByHabitId,
    foundation: state.today.foundationCompletedAt, rhythmEntries: state.rhythm.entriesToday, breathSessions: state.breath.entriesToday,
    strengthCompletedExerciseIds: state.strength.completedExerciseIds, strengthLastUpdatedAt: state.strength.lastUpdatedAt,
  }
  return state.history.find((record) => record.dayKey === day) ?? createEmptyDayRecord(day)
}
export function putDay(state: AppState, record: DayRecord): AppState {
  const history = [...state.history.filter((day) => day.dayKey !== record.dayKey), record].sort((a, b) => b.dayKey.localeCompare(a.dayKey))
  if (record.dayKey !== state.currentDayKey) return { ...state, history }
  return { ...state, history, today: {
    ...(record.groupSessions ? { groupSessions: record.groupSessions } : {}), ...(record.strengthEntries ? { strengthEntries: record.strengthEntries } : {}),
    completionTimesByHabitId: record.habits, eventsByHabitId: record.habitEvents, foundationCompletedAt: record.foundation, movementSessions: record.movementSessions,
    ...(record.captureIds ? { captureIds: record.captureIds } : {}), ...(record.recordDetails ? { recordDetails: record.recordDetails } : {}),
    ...(record.journals ? { journals: record.journals } : {}), ...(record.dominoSnapshots ? { dominoSnapshots: record.dominoSnapshots } : {}),
  }, rhythm: { ...state.rhythm, entriesToday: record.rhythmEntries }, breath: { ...state.breath, entriesToday: record.breathSessions },
  strength: { ...state.strength, completedExerciseIds: record.strengthCompletedExerciseIds, lastUpdatedAt: record.strengthLastUpdatedAt } }
}
export function doneInDay(record: DayRecord, id: string) {
  return Boolean(record.habits[id]) || (record.habitEvents[id]?.length ?? 0) > 0 || record.movementSessions.some((session) => session.typeId === id)
}
export function dominoProgress(record: DayRecord, block: DominoBlock) {
  return block.itemIds.filter((id) => doneInDay(record, id)).length
}
export function logDomino(state: AppState, habitId: string, assigned: string, block: DominoBlock | undefined, now: Date, movement?: MovementSessionDraft): AppState {
  if (!validDay(assigned) || assigned > state.currentDayKey) return state
  const habit = state.library.habits.find((item) => item.id === habitId)
  if (!habit) return state
  const source = dayRecord(state, assigned)
  const record: DayRecord = structuredClone(source)
  const time = now.toISOString()
  const occurredDate = block ? occurrenceDay(block, assigned) : assigned
  const knownNow = occurredDate === toDayKey(now) && block?.assignment !== 'next-day-review'
  const info: RecordInfo = { occurredDate, occurredTime: knownNow ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : null, precision: knownNow ? 'exact' : 'unknown', assignedDate: assigned, recordedAt: time }
  let eventId: string
  if (movement) {
    const durationMinutes = parseMovementMinutes(movement.durationMinutes)
    if (habitMode(habit) !== 'duration' || movement.typeId !== habitId || durationMinutes === null) return state
    const session = { ...movement, durationMinutes, id: makeLocalId('movement'), loggedAt: time }
    record.movementSessions.push(session)
    eventId = `movement-${session.id}`
  } else if (habitMode(habit) === 'captures') {
    eventId = makeLocalId('capture')
    const existing = record.habitEvents[habitId] ?? []
    const ids = record.captureIds?.[habitId] ?? existing.map((_time, index) => `capture-${assigned}-${habitId}-${index}`)
    record.habitEvents[habitId] = [...existing, time]
    record.captureIds = { ...record.captureIds, [habitId]: [...ids, eventId] }
  } else {
    const prior = record.habits[habitId]
    eventId = `habit-${habitId}`
    if (prior) {
      delete record.habits[habitId]
      if (record.recordDetails) delete record.recordDetails[eventId]
      return putDay(state, record)
    }
    record.habits[habitId] = time
  }
  record.recordDetails = { ...record.recordDetails, [eventId]: { ...info, ...(movement?.note ? { note: movement.note } : {}) } }
  if (block && !record.dominoSnapshots) record.dominoSnapshots = structuredClone(state.library.dominoBlocks ?? [])
  return putDay(state, record)
}
export function saveBlock(state: AppState, block: DominoBlock): AppState {
  if (!block.name.trim() || !block.id) return state
  const existing = state.library.dominoBlocks ?? []
  const itemIds = [...new Set(block.itemIds)].filter((id) => state.library.habits.some((habit) => habit.id === id))
  const next = { ...block, name: block.name.trim(), itemIds }
  // Each item has one presentation home; records remain in their assigned day.
  const blocks = existing.map((old) => old.id === block.id ? next : { ...old, itemIds: old.itemIds.filter((id) => !itemIds.includes(id)) })
  if (!existing.some((old) => old.id === block.id)) blocks.push(next)
  return { ...state, library: { ...state.library, dominoBlocks: blocks } }
}
export function moveBlock(state: AppState, id: string, delta: -1 | 1) {
  const blocks = [...(state.library.dominoBlocks ?? [])], index = blocks.findIndex((block) => block.id === id)
  const other = index + delta
  if (index < 0 || other < 0 || other >= blocks.length) return state
  ;[blocks[index], blocks[other]] = [blocks[other], blocks[index]]
  return { ...state, library: { ...state.library, dominoBlocks: blocks } }
}
export function saveJournal(state: AppState, day: string, text: string, now: Date, id?: string): AppState {
  if (!validDay(day) || day > state.currentDayKey || !text.trim()) return state
  const record = structuredClone(dayRecord(state, day))
  const old = record.journals?.find((entry) => entry.id === id)
  const entry = { id: old?.id ?? makeLocalId('journal'), text: text.trim(), recordedAt: old?.recordedAt ?? now.toISOString() }
  record.journals = [...(record.journals ?? []).filter((item) => item.id !== entry.id), entry]
  record.recordDetails = { ...record.recordDetails, [`journal-${entry.id}`]: record.recordDetails?.[`journal-${entry.id}`] ?? { occurredDate: day, occurredTime: null, precision: 'unknown', assignedDate: day, recordedAt: entry.recordedAt } }
  return putDay(state, record)
}
export function decorateTimeline(events: TodayTimelineEvent[], record: DayRecord): TodayTimelineEvent[] {
  const decorated = events.map((event) => {
    const info = record.recordDetails?.[event.id]
    return { ...event, assignedDate: record.dayKey, ...(info ? { info } : {}) }
  })
  for (const entry of record.journals ?? []) decorated.push({ id: `journal-${entry.id}`, timestamp: entry.recordedAt, title: '今日随记', summary: entry.text.length > 16 ? `${entry.text.slice(0, 16)}…` : entry.text, detail: entry.text, kind: 'journal', assignedDate: record.dayKey, info: record.recordDetails?.[`journal-${entry.id}`] })
  return decorated.sort((a, b) => {
    const key = (event: TodayTimelineEvent) => { const info = eventInfo(event); return `${info.occurredDate}T${info.occurredTime ?? '99:99'}` }
    return key(a).localeCompare(key(b)) || a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)
  })
}
export function eventInfo(event: TodayTimelineEvent): RecordInfo {
  if (event.info) return event.info
  const time = new Date(event.timestamp)
  const timedSession = event.kind === 'rhythm' || event.kind === 'breath'
  return { occurredDate: timedSession ? toDayKey(time) : event.assignedDate!, occurredTime: timedSession ? `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}` : null, assignedDate: event.assignedDate!, recordedAt: timedSession ? null : event.timestamp, precision: timedSession ? 'exact' : 'unknown', ...(event.note ? { note: event.note } : {}) }
}
export function eventTimeLabel(event: TodayTimelineEvent) {
  if (event.kind === 'journal') return '随记'
  if (!event.info) return `${event.kind === 'rhythm' || event.kind === 'breath' ? '' : '录入 '}${new Date(event.timestamp).toLocaleTimeString('zh-CN', { hour: 'numeric', minute: '2-digit' })}`
  const info = event.info
  const previous = info.occurredDate === shiftDayKey(info.assignedDate, -1)
  const nightReview = !event.groupSession || event.groupSession.assignment === 'next-day-review' && info.occurredTime === null
  const day = previous && nightReview ? '昨晚' : info.occurredDate !== info.assignedDate ? info.occurredDate.slice(5).replace('-', '/') : ''
  return `${day}${day ? ' · ' : ''}${info.occurredTime ? `${info.precision === 'approximate' ? '约 ' : ''}${info.occurredTime}` : '时间未指定'}`
}

// Update the underlying event in-place, move it between assigned-day records, never recreate IDs.
export function editRecord(state: AppState, sourceDay: string, event: TodayTimelineEvent, edit: RecordEdit): AppState {
  if (!validInfo(edit) || edit.assignedDate > state.currentDayKey) return state
  const source = structuredClone(dayRecord(state, sourceDay))
  if (edit.assignedDate !== sourceDay && source.groupSessions?.some((group) => group.completed.some((item) => item.eventIds.includes(event.id)))) return state
  const target = edit.assignedDate === sourceDay ? source : structuredClone(dayRecord(state, edit.assignedDate))
  let found = false
  for (const [field, prefix] of [['movementSessions', 'movement-'], ['rhythmEntries', 'rhythm-'], ['breathSessions', 'breath-'], ['strengthEntries', 'exercise-']] as const) {
    const index = source[field]?.findIndex((item) => `${prefix}${item.id}` === event.id) ?? -1
    if (index < 0) continue
    if (target !== source && (target[field] ?? []).some((item) => `${prefix}${item.id}` === event.id)) return state
    const item = source[field]![index]
    if (field === 'movementSessions' && edit.durationMinutes !== undefined) {
      const duration = parseMovementMinutes(edit.durationMinutes)
      if (duration === null) return state
      Object.assign(item, { durationMinutes: duration, note: edit.note?.trim() ?? '' })
    }
    if (target !== source) {
      // The arrays have different element types but each pair refers to the same field.
      const from = source[field] as { id: string }[], to = (target[field] ?? []) as { id: string }[]
      from.splice(index, 1); to.push(item); Object.assign(target, { [field]: to })
    }
    found = true
  }
  for (const [id, times] of Object.entries(source.habitEvents)) {
    const index = source.captureIds?.[id]?.indexOf(event.id) ?? -1
    if (index < 0 || !times) continue
    if (target !== source) {
      const value = times.splice(index, 1)[0]
      source.captureIds![id]!.splice(index, 1)
      target.habitEvents[id] = [...(target.habitEvents[id] ?? []), value]
      target.captureIds = { ...target.captureIds, [id]: [...(target.captureIds?.[id] ?? []), event.id] }
    }
    found = true
  }
  for (const [field, prefix] of [['habits', 'habit-'], ['foundation', 'foundation-']] as const) {
    for (const [id, time] of Object.entries(source[field])) {
      if (!time || `${prefix}${id}` !== event.id) continue
      if (target !== source) {
        if ((target[field] as Record<string, string | undefined>)[id]) return state // Two single completions cannot be silently collapsed.
        delete (source[field] as Record<string, string | undefined>)[id]
        Object.assign(target[field], { [id]: time })
      }
      found = true
    }
  }
  if (event.id === 'strength-today' && source.strengthLastUpdatedAt) {
    if (target !== source) {
      if (target.strengthCompletedExerciseIds.length) return state
      target.strengthCompletedExerciseIds = source.strengthCompletedExerciseIds
      target.strengthLastUpdatedAt = source.strengthLastUpdatedAt
      source.strengthCompletedExerciseIds = []; source.strengthLastUpdatedAt = null
    }
    found = true
  }
  if (event.kind === 'journal') {
    const entry = source.journals?.find((item) => `journal-${item.id}` === event.id)
    if (!entry || !edit.note?.trim()) return state
    entry.text = edit.note.trim()
    if (target !== source) { source.journals = source.journals?.filter((item) => item.id !== entry.id); target.journals = [...(target.journals ?? []), entry] }
    found = true
  }
  if (!found) return state
  // Recording time is immutable. User correction does not turn a late capture into a past capture.
  const info = { ...edit, recordedAt: eventInfo(event).recordedAt }
  delete info.durationMinutes
  if (target !== source && source.recordDetails) delete source.recordDetails[event.id]
  target.recordDetails = { ...target.recordDetails, [event.id]: info }
  // Carry the original grouping snapshot on a move; do not reinterpret it using today's blocks.
  if (!target.dominoSnapshots && source.dominoSnapshots) target.dominoSnapshots = structuredClone(source.dominoSnapshots)
  return putDay(target === source ? state : putDay(state, source), target)
}
export function validInfo(info: RecordInfo) {
  return validDay(info.occurredDate) && validDay(info.assignedDate) && ['exact', 'approximate', 'unknown'].includes(info.precision) &&
    (info.occurredTime === null ? info.precision === 'unknown' : /^([01]\d|2[0-3]):[0-5]\d$/.test(info.occurredTime) && info.precision !== 'unknown') &&
    (info.recordedAt === null || typeof info.recordedAt === 'string' && Number.isFinite(Date.parse(info.recordedAt))) && (info.note === undefined || typeof info.note === 'string')
}
export function validateV31(state: AppState) {
  const fail = () => { throw new Error('Invalid V3.1 data') }
  const blocks = (value: unknown) => {
    if (!Array.isArray(value)) return fail()
    const ids = new Set<string>()
    for (const block of value as DominoBlock[]) {
      if (!block || typeof block.id !== 'string' || !block.id || ids.has(block.id) || typeof block.name !== 'string' || !block.name.trim() || !Array.isArray(block.itemIds) || !block.itemIds.every((id) => typeof id === 'string') || new Set(block.itemIds).size !== block.itemIds.length || !['same-day', 'next-day-review'].includes(block.assignment) || typeof block.hidden !== 'boolean') fail()
      ids.add(block.id)
    }
  }
  if (state.version >= 5 || state.library.dominoBlocks !== undefined) blocks(state.library.dominoBlocks)
  if (state.library.dominoBlocks) {
    const homes = state.library.dominoBlocks.flatMap((block) => block.itemIds)
    if (new Set(homes).size !== homes.length) fail()
  }
  const checkDay = (day: DayRecord) => {
    if (day.captureIds !== undefined) {
      if (typeof day.captureIds !== 'object' || day.captureIds === null || Array.isArray(day.captureIds)) fail()
      for (const [id, ids] of Object.entries(day.captureIds)) if (!Array.isArray(ids) || ids.length !== (day.habitEvents[id]?.length ?? 0) || !ids.every((value) => typeof value === 'string' && value.length > 0) || new Set(ids).size !== ids.length) fail()
    }
    if (day.recordDetails !== undefined) {
      if (!day.recordDetails || typeof day.recordDetails !== 'object' || Array.isArray(day.recordDetails)) fail()
      const known = new Set([
        ...day.movementSessions.map((item) => `movement-${item.id}`), ...day.rhythmEntries.map((item) => `rhythm-${item.id}`), ...day.breathSessions.map((item) => `breath-${item.id}`),
        ...Object.keys(day.habits).filter((id) => day.habits[id]).map((id) => `habit-${id}`), ...Object.keys(day.foundation).filter((id) => (day.foundation as Record<string, string>)[id]).map((id) => `foundation-${id}`),
        ...Object.values(day.captureIds ?? {}).flatMap((ids) => ids ?? []), ...(day.journals ?? []).map((entry) => `journal-${entry.id}`),
        ...(day.strengthCompletedExerciseIds.length ? ['strength-today'] : []), ...(day.strengthEntries ?? []).map((entry) => `exercise-${entry.id}`),
      ])
      for (const [id, info] of Object.entries(day.recordDetails)) if (!known.has(id) || !info || !validInfo(info) || info.assignedDate !== day.dayKey) fail()
    }
    if (day.journals !== undefined && (!Array.isArray(day.journals) || day.journals.some((entry) => !entry || typeof entry.id !== 'string' || typeof entry.text !== 'string' || !entry.text.trim() || !Number.isFinite(Date.parse(entry.recordedAt))) || new Set(day.journals.map((entry) => entry.id)).size !== day.journals.length)) fail()
    if (day.dominoSnapshots !== undefined) blocks(day.dominoSnapshots)
  }
  const captureIds = new Set<string>()
  for (const record of [...state.history.filter((day) => day.dayKey !== state.currentDayKey), dayRecord(state, state.currentDayKey)]) {
    for (const id of Object.values(record.captureIds ?? {}).flatMap((ids) => ids ?? [])) {
      if (captureIds.has(id)) fail()
      captureIds.add(id)
    }
  }
  state.history.forEach(checkDay)
  const mirrored = state.history.find((day) => day.dayKey === state.currentDayKey)
  if (mirrored) {
    const live = dayRecord(state, state.currentDayKey)
    const comparable = (record: DayRecord) => ({
      rhythm: record.rhythmEntries, breath: record.breathSessions, strength: record.strengthCompletedExerciseIds, strengthAt: record.strengthLastUpdatedAt,
      habits: record.habits, captures: record.habitEvents ?? {}, foundation: record.foundation ?? {}, movement: record.movementSessions ?? [],
      ids: record.captureIds ?? {}, details: record.recordDetails ?? {}, journals: record.journals ?? [], blocks: record.dominoSnapshots ?? [],
    })
    const stable = (value: unknown) => JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested)
    // Synchronization must never erase a newer current-day history snapshot on import/load.
    if (stable(comparable(mirrored)) !== stable(comparable(live))) fail()
  }
  checkDay(dayRecord(state, state.currentDayKey))
}
export function dayAsState(state: AppState, day: string): AppState {
  const record = dayRecord(state, day)
  return { ...state, currentDayKey: day, today: { ...record, completionTimesByHabitId: record.habits, eventsByHabitId: record.habitEvents, foundationCompletedAt: record.foundation }, rhythm: { ...state.rhythm, entriesToday: record.rhythmEntries }, breath: { ...state.breath, entriesToday: record.breathSessions }, strength: { ...state.strength, completedExerciseIds: record.strengthCompletedExerciseIds, lastUpdatedAt: record.strengthLastUpdatedAt } }
}
export type { HabitDefinition }
