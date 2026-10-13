import { makeLocalId, parseMovementMinutes, shiftDayKey, toDayKey, type AppState, type DayRecord, type ExerciseDefinition, type TodayTimelineEvent, type MovementSessionDraft } from './domain'
import { dayRecord, putDay, dominoProgress, validDay, validInfo, eventInfo, type RecordInfo } from './v31'
import { habitMode } from './v3'

export type GroupKind = 'habit' | 'exercise' | 'routine' | 'rhythm' | 'breath'
export interface GroupRef { kind: GroupKind; id: string }
export interface GroupTemplate {
  id: string; name: string; items: GroupRef[]; location: 'habit' | 'strength' | 'rhythm' | 'breath'
  assignment: 'same-day' | 'next-day-review' | 'manual'; hidden: boolean; enabled: boolean
}
export interface ExerciseSnapshot { id: string; name: string; sets: string; volume: string; duration: string }
export interface GroupItem extends GroupRef { name: string; mode?: 'single' | 'captures' | 'duration'; exercises?: ExerciseSnapshot[] }
export interface GroupCompletion { itemKey: string; eventIds: string[]; recordedAt: string }
export interface GroupSession { id: string; groupId: string; groupName: string; assignment: GroupTemplate['assignment']; items: GroupItem[]; info: RecordInfo; completed: GroupCompletion[] }
export interface StrengthEntry { id: string; exercise: ExerciseSnapshot; recordedAt: string }
export interface GroupDayExtras { groupSessions?: GroupSession[]; strengthEntries?: StrengthEntry[] }
export interface GroupLaunch { sessionId: string; itemKey: string }
export const refKey = (item: GroupRef) => `${item.kind}:${item.id}`
const clock = (now: Date) => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
export function seedGroups(state: AppState): AppState {
  if (state.library.groups !== undefined) return { ...state, version: 6 }
  const groups: GroupTemplate[] = (state.library.dominoBlocks ?? []).map((block) => ({ id: block.id, name: block.name, items: block.itemIds.map((id) => ({ kind: 'habit', id })), assignment: block.assignment, hidden: block.hidden, enabled: true, location: 'habit' }))
  const core = ['lowerAbs', 'lowerBack', 'pelvicFloor'].map((id) => state.library.exercises.find((exercise) => exercise.id === id && exercise.foundationId === id))
  if (core.every(Boolean)) {
    let id = 'group-core-trio', suffix = 1
    while (groups.some((group) => group.id === id)) id = `group-core-trio-${suffix++}`
    groups.push({ id, name: '核心三件套', items: core.map((exercise) => ({ kind: 'exercise', id: exercise!.id })), assignment: 'same-day', hidden: false, enabled: true, location: 'strength' })
  }
  // Old Domino day snapshots are retained verbatim. They do not prove execution boundaries.
  return { ...state, version: 6, library: { ...state.library, groups } }
}
export function availableItems(state: AppState): GroupItem[] {
  return [
    ...state.library.habits.map((habit): GroupItem => ({ kind: 'habit', id: habit.id, name: habit.name, mode: habitMode(habit) })),
    ...state.library.exercises.map((exercise): GroupItem => ({ kind: 'exercise', id: exercise.id, name: exercise.name, exercises: [exerciseSnapshot(exercise)] })),
    ...state.strength.routines.map((routine): GroupItem => ({ kind: 'routine', id: routine.id, name: routine.name, exercises: [...new Map(routine.exercises.map((ref) => [ref.exerciseId, ref])).values()].map((ref) => {
      const exercise = state.library.exercises.find((item) => item.id === ref.exerciseId)
      return { ...(exercise ? exerciseSnapshot(exercise) : { id: ref.exerciseId, name: '动作不可用', sets: '', volume: '', duration: '' }), sets: ref.customSets ?? exercise?.suggestedSets ?? '', volume: ref.customVolume ?? exercise?.suggestedVolume ?? '', duration: ref.customTime ?? exercise?.estimatedTime ?? '' }
    }) })),
    { kind: 'rhythm', id: 'rhythm', name: '节律' }, { kind: 'breath', id: 'breath', name: '呼吸' },
  ]
}
const exerciseSnapshot = (exercise: ExerciseDefinition): ExerciseSnapshot => ({ id: exercise.id, name: exercise.name, sets: exercise.suggestedSets, volume: exercise.suggestedVolume, duration: exercise.estimatedTime })
export function saveGroup(state: AppState, group: GroupTemplate): AppState {
  const previous = state.library.groups?.find((item) => item.id === group.id)
  if (!validTemplate(group) || group.items.some((ref) => !availableItems(state).some((item) => refKey(item) === refKey(ref)) && !previous?.items.some((item) => refKey(item) === refKey(ref)))) return state
  const groups = [...(state.library.groups ?? [])], index = groups.findIndex((item) => item.id === group.id)
  const next = structuredClone({ ...group, name: group.name.trim() })
  if (index < 0) groups.push(next); else groups[index] = next
  return { ...state, library: { ...state.library, groups } }
}
export function moveGroup(state: AppState, id: string, delta: -1 | 1): AppState {
  const groups = [...(state.library.groups ?? [])], index = groups.findIndex((group) => group.id === id), other = index + delta
  if (index < 0 || other < 0 || other >= groups.length) return state
  ;[groups[index], groups[other]] = [groups[other], groups[index]]
  return { ...state, library: { ...state.library, groups } }
}
export function newGroupSession(state: AppState, groupId: string, day: string, now: Date): AppState {
  const group = state.library.groups?.find((item) => item.id === groupId)
  if (!group || !group.enabled || !validDay(day) || day > state.currentDayKey) return state
  const occurrence = group.assignment === 'next-day-review' ? shiftDayKey(day, -1) : day
  const known = group.assignment === 'same-day' && day === toDayKey(now)
  const items = group.items.map((ref) => availableItems(state).find((item) => refKey(item) === refKey(ref)))
  if (items.some((item) => !item)) return state
  const session: GroupSession = { id: makeLocalId('group-session'), groupId, groupName: group.name, assignment: group.assignment, items: structuredClone(items as GroupItem[]), completed: [], info: { occurredDate: occurrence, occurredTime: known ? clock(now) : null, precision: known ? 'exact' : 'unknown', assignedDate: day, recordedAt: now.toISOString() } }
  const record = dayRecord(state, day)
  return putDay(state, { ...record, groupSessions: [...(record.groupSessions ?? []), session] })
}
// First selection creates an execution atomically; later selections address that same ID.
export function recordGroupForDay(state: AppState, groupId: string, day: string, sessionId: string | null, key: string, now: Date, movement?: MovementSessionDraft, undo = false): AppState {
  let next = state
  let id = sessionId
  if (id) {
    const found = findGroupSession(state, id)
    if (!found || found.session.groupId !== groupId || found.record.dayKey !== day) return state
  } else {
    if (undo) return state
    next = newGroupSession(state, groupId, day, now)
    if (next === state) return state
    id = dayRecord(next, day).groupSessions?.filter((session) => session.groupId === groupId).at(-1)?.id ?? null
  }
  if (!id) return state
  const result = ['rhythm:', 'breath:', 'routine:'].some((prefix) => key.startsWith(prefix)) && !undo ? launchGroupItem(next, id, key) : logGroupItem(next, id, key, now, movement, undo)
  return result === next ? state : result
}
export function findGroupSession(state: AppState, id: string) {
  for (const record of [...state.history.filter((day) => day.dayKey !== state.currentDayKey), dayRecord(state, state.currentDayKey)]) {
    const session = record.groupSessions?.find((item) => item.id === id)
    if (session) return { record, session }
  }
}
export const groupProgress = (session: GroupSession) => session.items.filter((item) => {
  const events = session.completed.find((entry) => entry.itemKey === refKey(item))?.eventIds ?? []
  return item.kind === 'routine' ? (item.exercises?.length ?? 0) > 0 && events.length === item.exercises!.length : events.length > 0
}).length
export function effectiveGroupInfo(record: DayRecord, eventId: string): RecordInfo | undefined {
  const session = record.groupSessions?.find((group) => group.completed.some((entry) => entry.eventIds.includes(eventId)))
  if (record.recordDetails?.[eventId]) return record.recordDetails[eventId]
  if (!session) return undefined
  const capture = Object.entries(record.captureIds ?? {}).find(([, ids]) => ids?.includes(eventId))
  const recordedAt = capture ? record.habitEvents[capture[0]]?.[capture[1]!.indexOf(eventId)] : record.movementSessions.find((entry) => `movement-${entry.id}` === eventId)?.loggedAt ?? record.strengthEntries?.find((entry) => `exercise-${entry.id}` === eventId)?.recordedAt ?? session.completed.find((entry) => entry.eventIds.includes(eventId))?.recordedAt
  return { ...session.info, recordedAt: recordedAt ?? session.info.recordedAt }
}
export function legacyDominoProgress(record: DayRecord, groupId: string) {
  const snapshot = record.dominoSnapshots?.find((block) => block.id === groupId)
  if (!snapshot) return null
  const independent = structuredClone(record)
  removeEvents(independent, [...new Set(record.groupSessions?.flatMap((session) => session.completed.flatMap((item) => item.eventIds)) ?? [])])
  return { completed: dominoProgress(independent, snapshot), total: snapshot.itemIds.length }
}
export function groupItemEnabled(state: AppState, item: GroupRef) {
  if (item.kind === 'habit') return state.library.habits.some((habit) => habit.id === item.id && habit.enabled)
  if (item.kind === 'exercise') return state.library.exercises.some((exercise) => exercise.id === item.id && exercise.enabled)
  if (item.kind === 'routine') return state.strength.routines.some((routine) => routine.id === item.id && routine.enabled)
  return true
}
function removeEvents(record: DayRecord, ids: string[]) {
  const set = new Set(ids)
  record.movementSessions = record.movementSessions.filter((entry) => !set.has(`movement-${entry.id}`))
  record.rhythmEntries = record.rhythmEntries.filter((entry) => !set.has(`rhythm-${entry.id}`))
  record.breathSessions = record.breathSessions.filter((entry) => !set.has(`breath-${entry.id}`))
  record.strengthEntries = record.strengthEntries?.filter((entry) => !set.has(`exercise-${entry.id}`))
  for (const [habit, times] of Object.entries(record.habitEvents)) {
    const previous = record.captureIds?.[habit] ?? []
    record.habitEvents[habit] = times?.filter((_time, index) => !set.has(previous[index]))
    if (record.captureIds?.[habit]) record.captureIds[habit] = previous.filter((id) => !set.has(id))
  }
  for (const id of ids) if (record.recordDetails) delete record.recordDetails[id]
}
// Only records created by this session are undone. Independent/other-session records survive.
export function logGroupItem(state: AppState, sessionId: string, key: string, now: Date, movement?: MovementSessionDraft, undo = false, exerciseId?: string): AppState {
  const found = findGroupSession(state, sessionId)
  if (!found) return state
  const record = structuredClone(found.record), session = record.groupSessions!.find((group) => group.id === sessionId)!
  const item = session.items.find((ref) => refKey(ref) === key)
  if (!item) return state
  const completion = session.completed.find((entry) => entry.itemKey === key)
  const timestamp = now.toISOString()
  if (undo) {
    session.completed = session.completed.filter((entry) => entry.itemKey !== key)
    removeEvents(record, (completion?.eventIds ?? []).filter((id) => !session.completed.some((entry) => entry.eventIds.includes(id))))
    return putDay(state, record)
  }
  if (!groupItemEnabled(state, item)) return state
  if (item.kind === 'rhythm' || item.kind === 'breath') return state // Real timed workflow only.
  let eventIds: string[] = []
  if (item.kind === 'habit') {
    if (completion && item.mode !== 'captures') return logGroupItem(state, sessionId, key, now, undefined, true)
    if (item.mode === 'duration') {
      const minutes = movement && parseMovementMinutes(movement.durationMinutes)
      if (!movement || movement.typeId !== item.id || minutes === null || minutes === undefined) return state
      const id = makeLocalId('movement')
      record.movementSessions.push({ ...movement, id, durationMinutes: minutes, loggedAt: timestamp })
      eventIds = [`movement-${id}`]
    } else {
      const id = makeLocalId('capture'), old = record.habitEvents[item.id] ?? []
      const previousIds = record.captureIds?.[item.id] ?? old.map((_time, index) => `capture-${record.dayKey}-${item.id}-${index}`)
      record.habitEvents[item.id] = [...old, timestamp]
      record.captureIds = { ...record.captureIds, [item.id]: [...previousIds, id] }
      eventIds = [id]
    }
  } else {
    const exercise = item.exercises?.find((snapshot) => snapshot.id === (exerciseId ?? item.id))
    if (!exercise || !state.library.exercises.some((entry) => entry.id === exercise.id && entry.enabled)) return state
    const existing = record.strengthEntries?.find((entry) => entry.exercise.id === exercise.id && completion?.eventIds.includes(`exercise-${entry.id}`))
    if (existing) {
      if (completion) completion.eventIds = completion.eventIds.filter((id) => id !== `exercise-${existing.id}`)
      session.completed = session.completed.filter((entry) => entry.eventIds.length)
      if (!session.completed.some((entry) => entry.eventIds.includes(`exercise-${existing.id}`))) removeEvents(record, [`exercise-${existing.id}`])
      return putDay(state, record)
    }
    const shared = record.strengthEntries?.find((entry) => entry.exercise.id === exercise.id && session.completed.some((completion) => completion.eventIds.includes(`exercise-${entry.id}`)))
    const id = shared?.id ?? makeLocalId('strength-entry')
    if (!shared) record.strengthEntries = [...(record.strengthEntries ?? []), { id, exercise: structuredClone(exercise), recordedAt: timestamp }]
    eventIds = [`exercise-${id}`]
  }
  if (completion) completion.eventIds.push(...eventIds)
  else session.completed.push({ itemKey: key, eventIds, recordedAt: timestamp })
  return putDay(state, record)
}
export function launchGroupItem(state: AppState, sessionId: string, key: string): AppState {
  const found = findGroupSession(state, sessionId), item = found?.session.items.find((entry) => refKey(entry) === key)
  if (!item || !['rhythm', 'breath', 'routine'].includes(item.kind) || !groupItemEnabled(state, item)) return state
  if (['rhythm', 'breath'].includes(item.kind) && found?.session.completed.some((entry) => entry.itemKey === key)) return state
  // Never attach an already-running timer to a new group or change its association.
  if (['running', 'paused'].includes(state.rhythm.status) || ['running', 'paused'].includes(state.breath.status)) return state
  return { ...state, pendingGroupLaunch: { sessionId, itemKey: key }, selectedTab: item.kind === 'routine' ? 'strength' : item.kind as 'rhythm' | 'breath' }
}
export function attachTimedGroupRecord(state: AppState, kind: 'rhythm' | 'breath', eventId: string, recordedAt: string): AppState {
  const pending = state.pendingGroupLaunch
  if (!pending || pending.itemKey !== `${kind}:${kind}`) return state
  const found = findGroupSession(state, pending.sessionId)
  if (!found) return state
  const from = structuredClone(dayRecord(state, state.currentDayKey)), target = found.record.dayKey === from.dayKey ? from : structuredClone(found.record)
  const field = kind === 'rhythm' ? 'rhythmEntries' : 'breathSessions'
  const index = from[field].findIndex((entry) => `${kind}-${entry.id}` === eventId)
  if (index < 0) return state
  const entry = from[field][index]
  if (target !== from) { (from[field] as {id: string}[]).splice(index, 1); (target[field] as {id: string}[]).push(entry) }
  if (from.recordDetails) delete from.recordDetails[eventId]
  const session = target.groupSessions!.find((group) => group.id === pending.sessionId)!
  const completion = session.completed.find((item) => item.itemKey === pending.itemKey)
  if (completion) completion.eventIds.push(eventId)
  else session.completed.push({ itemKey: pending.itemKey, eventIds: [eventId], recordedAt })
  return { ...putDay(target === from ? state : putDay(state, from), target), pendingGroupLaunch: undefined }
}
export function editGroupSession(state: AppState, sessionId: string, info: RecordInfo): AppState {
  const found = findGroupSession(state, sessionId)
  if (!found || !validInfo(info) || info.assignedDate > state.currentDayKey) return state
  const source = structuredClone(found.record), session = source.groupSessions!.find((group) => group.id === sessionId)!
  const target = info.assignedDate === source.dayKey ? source : structuredClone(dayRecord(state, info.assignedDate))
  const ids = new Set(session.completed.flatMap((item) => item.eventIds))
  if (target !== source) {
    for (const field of ['movementSessions', 'rhythmEntries', 'breathSessions', 'strengthEntries'] as const) {
      const prefix = field === 'movementSessions' ? 'movement-' : field === 'rhythmEntries' ? 'rhythm-' : field === 'breathSessions' ? 'breath-' : 'exercise-'
      const moving = (source[field] ?? []).filter((entry) => ids.has(`${prefix}${entry.id}`))
      // Each array pair has the same type; generic structure is used only for moving it intact.
      Object.assign(target, { [field]: [...(target[field] ?? []), ...moving] })
      Object.assign(source, { [field]: (source[field] ?? []).filter((entry) => !ids.has(`${prefix}${entry.id}`)) })
    }
    for (const [habit, times] of Object.entries(source.habitEvents)) {
      const previous = source.captureIds?.[habit] ?? [], moving = previous.filter((id) => ids.has(id))
      if (!moving.length) continue
      target.habitEvents[habit] = [...(target.habitEvents[habit] ?? []), ...moving.map((id) => times![previous.indexOf(id)])]
      target.captureIds = { ...target.captureIds, [habit]: [...(target.captureIds?.[habit] ?? []), ...moving] }
      source.habitEvents[habit] = times?.filter((_time, index) => !ids.has(previous[index]))
      source.captureIds![habit] = previous.filter((id) => !ids.has(id))
    }
    for (const id of ids) if (source.recordDetails?.[id]) {
      target.recordDetails = { ...target.recordDetails, [id]: { ...source.recordDetails[id], assignedDate: info.assignedDate } }
      delete source.recordDetails[id]
    }
    source.groupSessions = source.groupSessions!.filter((item) => item.id !== sessionId)
    target.groupSessions = [...(target.groupSessions ?? []), session]
  }
  session.info = { ...info, recordedAt: found.session.info.recordedAt }
  return putDay(target === source ? state : putDay(state, source), target)
}
export function aggregateGroupTimeline(events: TodayTimelineEvent[], record: DayRecord): TodayTimelineEvent[] {
  const owned = new Set(record.groupSessions?.flatMap((group) => group.completed.flatMap((item) => item.eventIds)) ?? [])
  const result = events.filter((event) => !owned.has(event.id))
  for (const group of record.groupSessions ?? []) result.push({ id: `group-${group.id}`, timestamp: group.info.recordedAt!, title: group.groupName, summary: `${groupProgress(group)}/${group.items.length}`, info: group.info, assignedDate: record.dayKey, kind: 'group', groupSession: group })
  for (const entry of record.strengthEntries ?? []) if (!owned.has(`exercise-${entry.id}`)) result.push({ id: `exercise-${entry.id}`, timestamp: entry.recordedAt, title: entry.exercise.name, summary: '已完成', detail: prescription(entry.exercise), kind: 'strength', assignedDate: record.dayKey, info: record.recordDetails?.[`exercise-${entry.id}`] })
  return result.sort((a, b) => {
    const key = (event: TodayTimelineEvent) => { const info = eventInfo(event); return `${info.occurredDate}T${info.occurredTime ?? '99:99'}` }
    return key(a).localeCompare(key(b)) || a.id.localeCompare(b.id)
  })
}
export const prescription = (exercise: ExerciseSnapshot) => [exercise.sets, exercise.volume, exercise.duration].filter(Boolean).join(' · ')
export function groupStatistics(records: DayRecord[]) {
  const sessions = records.flatMap((record) => record.groupSessions ?? []).filter((session) => session.completed.length)
  const groupIds = [...new Set(sessions.map((session) => session.groupId))]
  return groupIds.map((id) => ({ id, name: sessions.findLast((session) => session.groupId === id)!.groupName, sessions: sessions.filter((session) => session.groupId === id).length, completedItems: sessions.filter((session) => session.groupId === id).reduce((sum, session) => sum + groupProgress(session), 0) }))
}
export function itemStatistics(records: DayRecord[]) {
  const counts = new Map<string, number>()
  const add = (key: string, count: number) => counts.set(key, (counts.get(key) ?? 0) + count)
  for (const record of records) {
    for (const [id, time] of Object.entries(record.habits)) if (time) add(`habit:${id}`, 1)
    for (const [id, times] of Object.entries(record.habitEvents)) add(`habit:${id}`, times?.length ?? 0)
    for (const entry of record.movementSessions) add(`habit:${entry.typeId}`, 1)
    for (const id of new Set([...record.strengthCompletedExerciseIds, ...Object.keys(record.foundation)])) add(`exercise:${id}`, 1)
    for (const entry of record.strengthEntries ?? []) add(`exercise:${entry.exercise.id}`, 1)
    for (const session of record.groupSessions ?? []) for (const item of session.items) if (item.kind === 'routine' && (item.exercises?.length ?? 0) > 0 && session.completed.find((entry) => entry.itemKey === refKey(item))?.eventIds.length === item.exercises!.length) add(refKey(item), 1)
    add('rhythm:rhythm', record.rhythmEntries.length); add('breath:breath', record.breathSessions.length)
  }
  return [...counts].filter(([, count]) => count > 0).map(([key, count]) => ({ key, count }))
}
const validRef = (ref: GroupRef) => Boolean(ref && ['habit', 'exercise', 'routine', 'rhythm', 'breath'].includes(ref.kind) && typeof ref.id === 'string' && ref.id && (!['rhythm', 'breath'].includes(ref.kind) || ref.id === ref.kind))
const validTemplate = (group: GroupTemplate) => Boolean(group && typeof group.id === 'string' && group.id && typeof group.name === 'string' && group.name.trim() && Array.isArray(group.items) && group.items.every(validRef) && new Set(group.items.map(refKey)).size === group.items.length && ['habit', 'strength', 'rhythm', 'breath'].includes(group.location) && ['same-day', 'next-day-review', 'manual'].includes(group.assignment) && typeof group.hidden === 'boolean' && typeof group.enabled === 'boolean')
export function validateGroups(state: AppState) {
  const fail = () => { throw new Error('组合存档不完整或不一致') }
  if (state.version < 6 && state.library.groups === undefined) return
  const groups = state.library.groups
  if (!Array.isArray(groups) || !groups.every(validTemplate) || new Set(groups.map((group) => group.id)).size !== groups.length) fail()
  const ids = new Set<string>(), eventOwners = new Map<string, string>(), strengthIds = new Set<string>()
  const stable = (value: unknown) => JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested) ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested)
  const live = dayRecord(state, state.currentDayKey), mirrored = state.history.find((day) => day.dayKey === state.currentDayKey)
  if (mirrored && stable({ sessions: mirrored.groupSessions ?? [], strength: mirrored.strengthEntries ?? [] }) !== stable({ sessions: live.groupSessions ?? [], strength: live.strengthEntries ?? [] })) fail()
  for (const record of [...state.history.filter((day) => day.dayKey !== state.currentDayKey), live]) {
    const known = new Set([...record.movementSessions.map((entry) => `movement-${entry.id}`), ...record.rhythmEntries.map((entry) => `rhythm-${entry.id}`), ...record.breathSessions.map((entry) => `breath-${entry.id}`), ...Object.values(record.captureIds ?? {}).flatMap((values) => values ?? []), ...(record.strengthEntries ?? []).map((entry) => `exercise-${entry.id}`)])
    if (record.strengthEntries !== undefined && !Array.isArray(record.strengthEntries)) fail()
    for (const entry of record.strengthEntries ?? []) { if (!entry || typeof entry.id !== 'string' || !entry.id || strengthIds.has(entry.id) || !validExercise(entry.exercise) || !Number.isFinite(Date.parse(entry.recordedAt))) fail(); strengthIds.add(entry.id) }
    if (record.groupSessions !== undefined && !Array.isArray(record.groupSessions)) fail()
    for (const session of record.groupSessions ?? []) {
      if (!session || typeof session.id !== 'string' || !session.id || ids.has(session.id) || typeof session.groupId !== 'string' || !session.groupId || typeof session.groupName !== 'string' || !session.groupName.trim() || !['same-day', 'next-day-review', 'manual'].includes(session.assignment) || !validInfo(session.info) || !session.info.recordedAt || session.info.assignedDate !== record.dayKey || !Array.isArray(session.items) || !session.items.every((item) => validRef(item) && typeof item.name === 'string' && item.name && (item.kind !== 'habit' || ['single', 'captures', 'duration'].includes(item.mode!)) && (!['routine', 'exercise'].includes(item.kind) || Array.isArray(item.exercises) && (item.kind !== 'exercise' || item.exercises.length === 1 && item.exercises[0].id === item.id) && item.exercises.every(validExercise) && new Set(item.exercises.map((exercise) => exercise.id)).size === item.exercises.length)) || new Set(session.items.map(refKey)).size !== session.items.length || !Array.isArray(session.completed)) fail()
      ids.add(session.id)
      const keys = new Set<string>()
      for (const completion of session.completed) {
        const item = session.items.find((ref) => refKey(ref) === completion.itemKey)
        if (!item || keys.has(completion.itemKey) || !Array.isArray(completion.eventIds) || !completion.eventIds.length || new Set(completion.eventIds).size !== completion.eventIds.length || !Number.isFinite(Date.parse(completion.recordedAt))) fail()
        if (item!.kind !== 'routine' && !(item!.kind === 'habit' && item!.mode === 'captures') && completion.eventIds.length !== 1) fail()
        if (item!.kind === 'routine') { const exercises = record.strengthEntries?.filter((entry) => completion.eventIds.includes(`exercise-${entry.id}`)).map((entry) => entry.exercise.id) ?? []; if (new Set(exercises).size !== exercises.length || exercises.length !== completion.eventIds.length) fail() }
        keys.add(completion.itemKey)
        for (const id of completion.eventIds) {
          if (!known.has(id) || (eventOwners.has(`${record.dayKey}:${id}`) && eventOwners.get(`${record.dayKey}:${id}`) !== session.id)) fail()
          eventOwners.set(`${record.dayKey}:${id}`, session.id)
          const matches = item!.kind === 'habit' ? item!.mode === 'duration' ? record.movementSessions.some((entry) => `movement-${entry.id}` === id && entry.typeId === item!.id) : record.captureIds?.[item!.id]?.includes(id) : item!.kind === 'rhythm' || item!.kind === 'breath' ? id.startsWith(`${item!.kind}-`) : record.strengthEntries?.some((entry) => `exercise-${entry.id}` === id && item!.exercises?.some((exercise) => exercise.id === entry.exercise.id))
          if (!matches) fail()
        }
      }
    }
  }
  if (state.pendingGroupLaunch && (!findGroupSession(state, state.pendingGroupLaunch.sessionId)?.session.items.some((item) => refKey(item) === state.pendingGroupLaunch!.itemKey && ['rhythm', 'breath', 'routine'].includes(item.kind)))) fail()
}
function validExercise(item: ExerciseSnapshot) { return Boolean(item && typeof item.id === 'string' && item.id && typeof item.name === 'string' && ['sets', 'volume', 'duration'].every((key) => typeof item[key as keyof ExerciseSnapshot] === 'string')) }
