import { seedV31, validateV31, decorateTimeline, dayRecord, putDay, logDomino, saveBlock, moveBlock, saveJournal, editRecord, type DominoBlock, type RecordEdit } from './v31'
import { normalizeHabit, translateBuiltIn, habitMode, moveHabit, completedHabitIds, HABIT_GROUPS, FREQUENCY_LABELS, MODE_LABELS } from './v3'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import {
  BREATH_MODE_LABELS,
  BREATH_ROUND_OPTIONS,
  BUILT_IN_HABIT_IDS,
  FOUNDATION_ITEMS,
  MOVEMENT_INTENSITY_LABELS,
  MOVEMENT_TYPES,
  RHYTHM_ABANDONED_GRACE_SECONDS,
  RHYTHM_BPM,
  RHYTHM_DURATIONS,
  RHYTHM_MERGE_THRESHOLD_SECONDS,
  RHYTHM_MINIMUM_RECORDED_SECONDS,
  STRENGTH_ROUTINES,
  type AppState,
  type BreathMode,
  type BreathPhase,
  type BreathSessionEntry,
  type DayRecord,
  type ExerciseDefinition,
  type FoundationItemId,
  type HabitDefinition,
  type HabitId,
  type HistorySummary,
  type MovementIntensity,
  type MovementSession,
  type MovementSessionDraft,
  type RoutineExercise,
  type StrengthRoutine,
  type ResolvedRoutineExercise,
  type ResolvedStrengthRoutine,
  type RhythmEntry,
  type TabKey,
  type TodayState,
  type TodayTimelineEvent,
  clampBreathPattern,
  createDefaultExercises,
  createDefaultHabits,
  createEmptyDayRecord,
  createInitialState,
  formatDurationMinutes,
  getActiveBreathPhases,
  getBreathPattern,
  getBreathPhaseDuration,
  isKnownMovementType,
  makeLocalId,
  monthDayKeys,
  monthKeyOf,
  movementTypeLabel,
  parseMovementMinutes,
  shiftDayKey,
  shiftMonthKey,
  toDayKey,
  weekDayKeys,
  weekStartDayKey,
} from './domain'
import {
  dismissStorageNotice,
  getStorageNotice,
  setStorageNotice,
  subscribeStorageNotice,
  type StorageNotice,
} from './storageStatus'
import { BreathCuePlayer, WebMetronome } from './webAudio'
import { backupKeyFor, writeBackup, readBackup } from './backupStore'

export { backupKeyFor }

import { V2_STORAGE_KEY, V1_STORAGE_KEY } from './storageKeys'
import { PersistenceSession, RECOVERY_NOTICE } from './persistence'
import { assertUsableState } from './dataTransfer'

type LegacyAppState = Omit<AppState, 'version' | 'library' | 'selectedTab' | 'strength'> & {
  version?: 1 | 2 | 3 | 4
  selectedTab?: Exclude<TabKey, 'library'>
  strength: {
    completedExerciseIds: string[]
    lastUpdatedAt: string | null
    routines?: StrengthRoutine[]
  }
}

export interface HistoryDailySummary {
  rhythmTotalMinutes: number
  rhythmEntriesCount: number
  breathSessionsCount: number
  breathRoundsCount: number
  strengthSummary: string
  mindfulEatingCompleted: boolean
  earlySleepCompleted: boolean
  mindfulEatingCaptureCount: number
  foundation: { id: FoundationItemId; label: string; completedAt: string | null }[]
  foundationCompletedCount: number
  movementSessions: MovementSession[]
  movementTotalMinutes: number
  habitRecords: { id: string; completed: boolean; captures: number }[]
  strengthExerciseIds: string[]
}

export type HistoryPeriodKind = 'day' | 'week' | 'month'

export interface HistoryPeriodNavigation {
  /** dayKey for 'day', Monday dayKey for 'week', 'YYYY-MM' for 'month'. */
  key: string
  canGoBack: boolean
  canGoForward: boolean
  isCurrent: boolean
}

export interface MovementDefaults {
  durationMinutes: number
  intensity: MovementIntensity
}

interface AppActions {
  moveLooseHabit: (id: string, delta: -1 | 1) => void
  logBlockItem: (id: string, assigned: string, blockId?: string, movement?: MovementSessionDraft) => void
  saveDominoBlock: (block: DominoBlock) => void
  moveDominoBlock: (id: string, delta: -1 | 1) => void
  saveDailyJournal: (day: string, text: string, id?: string) => void
  editTimelineRecord: (day: string, event: TodayTimelineEvent, edit: RecordEdit) => boolean
  selectTab: (tab: TabKey) => void
  selectRhythmDuration: (minutes: number) => void
  toggleRhythm: () => void
  endRhythm: () => void
  setRhythmSoundEnabled: (isEnabled: boolean) => void
  selectBreathMode: (mode: BreathMode) => void
  setBreathCustomValue: (phase: BreathPhase, value: number) => void
  selectBreathRounds: (rounds: number) => void
  toggleBreath: () => void
  endBreath: () => void
  setBreathSoundEnabled: (isEnabled: boolean) => void
  toggleHabit: (habitId: HabitId) => void
  toggleStrengthExercise: (exerciseId: string) => void
  toggleFoundationItem: (itemId: FoundationItemId) => void
  addMovementSession: (draft: MovementSessionDraft) => void
  updateMovementSession: (dayKey: string, sessionId: string, draft: MovementSessionDraft) => void
  deleteMovementSession: (dayKey: string, sessionId: string) => void
  saveHabit: (habit: HabitDefinition) => void
  moveHabit: (id: string, direction: 'up' | 'down') => void
  saveExercise: (exercise: ExerciseDefinition) => void
  saveStrengthRoutine: (routine: StrengthRoutine) => void
  addExerciseToRoutine: (routineId: string, exerciseId: string) => void
  removeRoutineExercise: (routineId: string, index: number) => void
  moveRoutineExercise: (routineId: string, index: number, direction: 'up' | 'down') => void
  updateRoutineExercise: (
    routineId: string,
    index: number,
    update: Partial<Pick<RoutineExercise, 'customSets' | 'customVolume' | 'customTime'>>,
  ) => void
}

export interface HealthRhythmViewModel extends AppActions {
  state: AppState
  visibleTodayHabits: HabitDefinition[]
  habitLibrary: HabitDefinition[]
  exerciseLibrary: ExerciseDefinition[]
  strengthRoutineLibrary: StrengthRoutine[]
  strengthRoutines: ResolvedStrengthRoutine[]
  rhythmRemainingSeconds: number
  rhythmTotalMinutesToday: number
  breathTotalRoundsToday: number
  breathTotalSessionsToday: number
  strengthCompletedCountToday: number
  strengthSummaryToday: string
  todayTimeline: TodayTimelineEvent[]
  historyDailySummary: (dayKey: string) => HistoryDailySummary
  historyWeekSummary: HistorySummary
  historyMonthSummary: HistorySummary
  movementDefaultsFor: (typeId: string) => MovementDefaults
  selectedHistoryDayKey: string
  setSelectedHistoryDayKey: (dayKey: string) => void
  historyNavigation: Record<HistoryPeriodKind, HistoryPeriodNavigation>
  stepHistoryPeriod: (kind: HistoryPeriodKind, delta: -1 | 1) => void
  resetHistoryPeriod: (kind: HistoryPeriodKind) => void
  /** False while loading, after a storage failure, or when another V3 tab has newer data. */
  canPersist: boolean
  canRecover: boolean
  persistenceSession: PersistenceSession
  /** Swaps in a state that has already been validated and saved (see dataTransfer). */
  replaceAppState: (next: AppState) => void
  storageNotice: StorageNotice | null
  dismissStorageNotice: () => void
}

export function useHealthRhythmApp(): HealthRhythmViewModel {
  const [session] = useState(() => new PersistenceSession())
  const [state, setState] = useState<AppState>(() => freshState(new Date()))
  const [loaded, setLoaded] = useState(false)
  const [stateGeneration, setStateGeneration] = useState(0)
  const canPersist = useSyncExternalStore(session.subscribe, session.getCanPersist)
  const canRecover = useSyncExternalStore(session.subscribe, session.getCanRecover)
  // History selections are view state only; they are never persisted.
  const [selectedHistoryKeys, setSelectedHistoryKeys] = useState<Record<HistoryPeriodKind, string>>(() => ({
    day: state.currentDayKey,
    week: periodKeyFor('week', state.currentDayKey),
    month: periodKeyFor('month', state.currentDayKey),
  }))
  const storageNotice = useSyncExternalStore(subscribeStorageNotice, getStorageNotice)
  const metronomeRef = useRef(new WebMetronome())
  const breathCuePlayerRef = useRef(new BreathCuePlayer())
  const previousBreathStatusRef = useRef(state.breath.status)
  const previousBreathPhaseRef = useRef(state.breath.currentPhase)

  useEffect(() => {
    let cancelled = false
    void loadPersistedState(new Date(), session).then((result) => {
      if (!cancelled) {
        setState(result.state)
        setStateGeneration(result.session.generation)
        setLoaded(true)
      }
    })
    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    // Recovery can publish readiness before its caller replaces the React snapshot.
    // Never enqueue that old snapshot using the newly imported generation.
    if (loaded && canPersist && stateGeneration === session.generation) {
      void saveState(state, session, stateGeneration)
    }
  }, [loaded, canPersist, state, session, stateGeneration])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage) session.observeStorage(event)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [session])

  useEffect(() => {
    const refresh = () => {
      setState((current) => refreshAppState(current, new Date()))
    }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  useEffect(() => {
    if (!canPersist || (state.rhythm.status !== 'running' && state.breath.status !== 'running')) {
      return
    }

    const intervalId = window.setInterval(() => {
      setState((current) => refreshAppState(current, new Date()))
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [canPersist, state.rhythm.status, state.breath.status])

  useEffect(() => {
    if (canPersist && state.rhythm.status === 'running' && state.rhythm.isSoundEnabled) {
      void metronomeRef.current.start(RHYTHM_BPM)
    } else {
      metronomeRef.current.stop()
    }
  }, [canPersist, state.rhythm.isSoundEnabled, state.rhythm.status])

  useEffect(() => {
    const cuePlayer = breathCuePlayerRef.current
    const previousStatus = previousBreathStatusRef.current
    const previousPhase = previousBreathPhaseRef.current

    if (!canPersist || !state.breath.isSoundEnabled || state.breath.status !== 'running') {
      cuePlayer.stop()
    } else if (
      (previousStatus === 'idle' || previousStatus === 'completed') &&
      state.breath.status === 'running'
    ) {
      void cuePlayer.playCue(state.breath.currentPhase)
    } else if (previousPhase !== state.breath.currentPhase && state.breath.status === 'running') {
      void cuePlayer.playCue(state.breath.currentPhase)
    }

    previousBreathStatusRef.current = state.breath.status
    previousBreathPhaseRef.current = state.breath.currentPhase
  }, [canPersist, state.breath.currentPhase, state.breath.isSoundEnabled, state.breath.status])

  function allowRecording() {
    if (loaded && session.getCanPersist()) return true
    setStorageNotice(session.notice ?? { kind: 'unprotected', message: '存档正在安全加载，暂不能记录。' })
    return false
  }

  const actions: AppActions = {
    moveLooseHabit(id, delta) {
      if (!allowRecording()) return
      setState((current) => {
        const all = [...current.library.habits]
        const ids = new Set(current.library.dominoBlocks?.flatMap((block) => block.itemIds))
        const habit = all.find((item) => item.id === id)
        if (!habit) return current
        const items = all.filter((item) => !ids.has(item.id) && (habitMode(item) === 'duration') === (habitMode(habit) === 'duration'))
        const index = items.findIndex((item) => item.id === id), other = index + delta
        if (index < 0 || other < 0 || other >= items.length) return current
        const a = all.indexOf(habit), b = all.indexOf(items[other]); [all[a], all[b]] = [all[b], all[a]]
        return { ...current, library: { ...current.library, habits: all } }
      })
    },
    logBlockItem(id, assigned, blockId, movement) {
      if (!allowRecording()) return
      setState((current) => logDomino(ensureCurrentDay(current, new Date()), id, assigned, current.library.dominoBlocks?.find((block) => block.id === blockId), new Date(), movement))
    },
    saveDominoBlock(block) { if (!allowRecording()) return; setState((current) => saveBlock(current, block)) },
    moveDominoBlock(id, delta) { if (!allowRecording()) return; setState((current) => moveBlock(current, id, delta)) },
    saveDailyJournal(day, text, id) { if (!allowRecording()) return; setState((current) => saveJournal(current, day, text, new Date(), id)) },
    editTimelineRecord(day, event, edit) {
      if (!allowRecording() || editRecord(state, day, event, edit) === state) return false
      setState((current) => editRecord(current, day, event, edit)); return true
    },
    selectTab(tab) {
      setState((current) => ({ ...current, selectedTab: tab }))
    },
    selectRhythmDuration(minutes) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        if (!RHYTHM_DURATIONS.includes(minutes as (typeof RHYTHM_DURATIONS)[number])) {
          return next
        }
        if (!['idle', 'completed'].includes(next.rhythm.status)) {
          return next
        }

        return syncHistory({
          ...next,
          rhythm: {
            ...next.rhythm,
            selectedDurationMinutes: minutes,
            status: next.rhythm.status === 'completed' ? 'idle' : next.rhythm.status,
          },
        })
      })
    },
    toggleRhythm() {
      if (!allowRecording()) return
      void metronomeRef.current.unlock()
      setState((current) => toggleRhythmState(ensureCurrentDay(current, new Date()), new Date()))
    },
    endRhythm() {
      if (!allowRecording()) return
      setState((current) => endRhythmState(ensureCurrentDay(current, new Date()), new Date()))
    },
    setRhythmSoundEnabled(isEnabled) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        return syncHistory({
          ...next,
          rhythm: {
            ...next.rhythm,
            isSoundEnabled: isEnabled,
          },
        })
      })
    },
    selectBreathMode(mode) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        if (!['idle', 'completed'].includes(next.breath.status)) {
          return next
        }

        return syncHistory({
          ...next,
          breath: freshBreathState({
            ...next.breath,
            selectedMode: mode,
            customPattern: clampBreathPattern(next.breath.customPattern),
            selectedRounds: next.breath.selectedRounds,
            entriesToday: next.breath.entriesToday,
            isSoundEnabled: next.breath.isSoundEnabled,
          }),
        })
      })
    },
    setBreathCustomValue(phase, value) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        if (!['idle', 'completed'].includes(next.breath.status)) {
          return next
        }

        const pattern = { ...next.breath.customPattern }
        pattern[phase] = value

        return syncHistory({
          ...next,
          breath: freshBreathState({
            ...next.breath,
            customPattern: clampBreathPattern(pattern),
            entriesToday: next.breath.entriesToday,
            isSoundEnabled: next.breath.isSoundEnabled,
          }),
        })
      })
    },
    selectBreathRounds(rounds) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        if (!BREATH_ROUND_OPTIONS.includes(rounds as (typeof BREATH_ROUND_OPTIONS)[number])) {
          return next
        }
        if (!['idle', 'completed'].includes(next.breath.status)) {
          return next
        }

        return syncHistory({
          ...next,
          breath: freshBreathState({
            ...next.breath,
            selectedRounds: rounds,
            entriesToday: next.breath.entriesToday,
            isSoundEnabled: next.breath.isSoundEnabled,
          }),
        })
      })
    },
    toggleBreath() {
      if (!allowRecording()) return
      void breathCuePlayerRef.current.unlock()
      setState((current) => toggleBreathState(ensureCurrentDay(current, new Date()), new Date()))
    },
    endBreath() {
      if (!allowRecording()) return
      setState((current) => endBreathState(ensureCurrentDay(current, new Date()), new Date()))
    },
    setBreathSoundEnabled(isEnabled) {
      if (!allowRecording()) return
      if (!isEnabled) {
        breathCuePlayerRef.current.stop()
      }

      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        return syncHistory({
          ...next,
          breath: {
            ...next.breath,
            isSoundEnabled: isEnabled,
          },
        })
      })
    },
    toggleHabit(habitId) {
      if (!allowRecording()) return
      setState((current) => {
        const now = new Date()
        return toggleHabitState(ensureCurrentDay(current, now), habitId, now)
      })
    },
    toggleStrengthExercise(exerciseId) {
      if (!allowRecording()) return
      setState((current) => {
        const now = new Date()
        return toggleStrengthExerciseState(ensureCurrentDay(current, now), exerciseId, now)
      })
    },
    toggleFoundationItem(itemId) {
      if (!allowRecording()) return
      setState((current) => {
        const now = new Date()
        return toggleFoundationItemState(ensureCurrentDay(current, now), itemId, now)
      })
    },
    addMovementSession(draft) {
      if (!allowRecording()) return
      setState((current) => {
        const now = new Date()
        return addMovementSessionState(ensureCurrentDay(current, now), draft, now)
      })
    },
    updateMovementSession(dayKey, sessionId, draft) {
      if (!allowRecording()) return
      setState((current) =>
        updateMovementSessionState(ensureCurrentDay(current, new Date()), dayKey, sessionId, draft),
      )
    },
    deleteMovementSession(dayKey, sessionId) {
      if (!allowRecording()) return
      setState((current) => deleteMovementSessionState(ensureCurrentDay(current, new Date()), dayKey, sessionId))
    },
    moveHabit(id, direction) {
      if (!allowRecording()) return
      setState((current) => ({ ...current, library: { ...current.library, habits: moveHabit(current.library.habits, id, direction) } }))
    },
    saveHabit(habit) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        const habits = upsertById(next.library.habits, sanitizeHabit(habit))

        return syncHistory({
          ...next,
          library: {
            ...next.library,
            habits,
          },
        })
      })
    },
    saveExercise(exercise) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        const exercises = upsertById(next.library.exercises, sanitizeExercise(exercise))

        return syncHistory({
          ...next,
          library: {
            ...next.library,
            exercises,
          },
        })
      })
    },
    saveStrengthRoutine(routine) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        const routines = upsertById(next.strength.routines, sanitizeRoutine(routine))

        return syncHistory({
          ...next,
          strength: {
            ...next.strength,
            routines,
          },
        })
      })
    },
    addExerciseToRoutine(routineId, exerciseId) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        return syncHistory({
          ...next,
          strength: {
            ...next.strength,
            routines: next.strength.routines.map((routine) =>
              routine.id === routineId && !routine.exercises.some((exercise) => exercise.exerciseId === exerciseId)
                ? {
                    ...routine,
                    exercises: [...routine.exercises, { exerciseId }],
                  }
                : routine,
            ),
          },
        })
      })
    },
    removeRoutineExercise(routineId, index) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        return syncHistory({
          ...next,
          strength: {
            ...next.strength,
            routines: next.strength.routines.map((routine) =>
              routine.id === routineId
                ? {
                    ...routine,
                    exercises: routine.exercises.filter((_, exerciseIndex) => exerciseIndex !== index),
                  }
                : routine,
            ),
          },
        })
      })
    },
    moveRoutineExercise(routineId, index, direction) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        return syncHistory({
          ...next,
          strength: {
            ...next.strength,
            routines: next.strength.routines.map((routine) => {
              if (routine.id !== routineId) {
                return routine
              }

              const nextIndex = direction === 'up' ? index - 1 : index + 1
              if (nextIndex < 0 || nextIndex >= routine.exercises.length) {
                return routine
              }

              const exercises = [...routine.exercises]
              const [moved] = exercises.splice(index, 1)
              exercises.splice(nextIndex, 0, moved)
              return { ...routine, exercises }
            }),
          },
        })
      })
    },
    updateRoutineExercise(routineId, index, update) {
      if (!allowRecording()) return
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        return syncHistory({
          ...next,
          strength: {
            ...next.strength,
            routines: next.strength.routines.map((routine) =>
              routine.id === routineId
                ? {
                    ...routine,
                    exercises: routine.exercises.map((exercise, exerciseIndex) =>
                      exerciseIndex === index ? sanitizeRoutineExercise({ ...exercise, ...update }) : exercise,
                    ),
                  }
                : routine,
            ),
          },
        })
      })
    },
  }

  const derived = useMemo(() => {
    const visibleTodayHabits = nextVisibleTodayHabits(state.library.habits)
    const strengthRoutines = resolveStrengthRoutines(state.library.exercises, state.strength.routines)
    const earliestDayKey = historyEarliestDayKey(state)
    const historyNavigation = Object.fromEntries(
      HISTORY_PERIOD_KINDS.map((kind) => [
        kind,
        getPeriodNavigation(kind, selectedHistoryKeys[kind], earliestDayKey, state.currentDayKey),
      ]),
    ) as Record<HistoryPeriodKind, HistoryPeriodNavigation>
    const historyWeekSummary = buildHistorySummary(
      state.history,
      weekDayKeys(historyNavigation.week.key),
      state.currentDayKey,
    )
    const historyMonthSummary = buildHistorySummary(
      state.history,
      monthDayKeys(historyNavigation.month.key),
      state.currentDayKey,
    )

    return {
      visibleTodayHabits,
      strengthRoutines,
      rhythmRemainingSeconds: getRhythmRemainingSeconds(state.rhythm),
      rhythmTotalMinutesToday: totalRhythmMinutes(state.rhythm.entriesToday),
      breathTotalRoundsToday: state.breath.entriesToday.reduce(
        (total, entry) => total + entry.completedRounds,
        0,
      ),
      breathTotalSessionsToday: state.breath.entriesToday.length,
      strengthCompletedCountToday: new Set([...state.strength.completedExerciseIds, ...Object.keys(state.today.foundationCompletedAt)]).size,
      strengthSummaryToday: `${new Set([...state.strength.completedExerciseIds, ...Object.keys(state.today.foundationCompletedAt)]).size} 项`,
      todayTimeline: buildTodayTimeline(state, visibleTodayHabits, strengthRoutines),
      earliestDayKey,
      historyNavigation,
      historyWeekSummary,
      historyMonthSummary,
    }
  }, [state, selectedHistoryKeys])

  const { earliestDayKey, historyNavigation } = derived

  return {
    state,
    selectedHistoryDayKey: historyNavigation.day.key,
    setSelectedHistoryDayKey: (dayKey) => {
      // The iOS date picker's Clear button reports ''; keep the current day instead.
      if (dayKey) {
        setSelectedHistoryKeys((current) => ({ ...current, day: dayKey }))
      }
    },
    historyNavigation,
    stepHistoryPeriod: (kind, delta) =>
      setSelectedHistoryKeys((current) => ({
        ...current,
        // From the latest selection, so taps landing before a re-render each count.
        [kind]: stepPeriodKey(kind, current[kind], delta, earliestDayKey, state.currentDayKey),
      })),
    resetHistoryPeriod: (kind) =>
      setSelectedHistoryKeys((current) => ({ ...current, [kind]: periodKeyFor(kind, state.currentDayKey) })),
    canPersist: loaded && canPersist,
    canRecover: loaded && canRecover,
    persistenceSession: session,
    replaceAppState: (next) => {
      // Stay on Library so the success message is visible after the swap.
      setState(() => ({ ...next, selectedTab: 'library' }))
      setStateGeneration(session.generation)
    },
    storageNotice,
    dismissStorageNotice,
    visibleTodayHabits: derived.visibleTodayHabits,
    habitLibrary: state.library.habits,
    exerciseLibrary: state.library.exercises,
    strengthRoutineLibrary: state.strength.routines,
    strengthRoutines: derived.strengthRoutines,
    historyDailySummary: (dayKey) =>
      buildDailyHistorySummary(recordForDay(state.history, dayKey), derived.strengthRoutines),
    historyWeekSummary: derived.historyWeekSummary,
    historyMonthSummary: derived.historyMonthSummary,
    movementDefaultsFor: (typeId) => movementDefaultsFor(state, typeId),
    rhythmRemainingSeconds: derived.rhythmRemainingSeconds,
    rhythmTotalMinutesToday: derived.rhythmTotalMinutesToday,
    breathTotalRoundsToday: derived.breathTotalRoundsToday,
    breathTotalSessionsToday: derived.breathTotalSessionsToday,
    strengthCompletedCountToday: derived.strengthCompletedCountToday,
    strengthSummaryToday: derived.strengthSummaryToday,
    todayTimeline: derived.todayTimeline,
    ...actions,
  }
}

export interface LoadResult {
  state: AppState
  canPersist: boolean
  notice: StorageNotice | null
  session: PersistenceSession
}

// The React app always passes its own session. The default also supports non-UI callers;
// it never adopts an existing canonical save without loadPersistedState first.
let defaultSession: PersistenceSession | undefined
let defaultStorage: Storage | undefined
export function getPersistenceSession() {
  const storage = localStorage
  if (!defaultSession || defaultStorage !== storage) {
    defaultStorage = storage
    defaultSession = new PersistenceSession(true)
  }
  return defaultSession
}

export async function loadPersistedState(now: Date, session = new PersistenceSession()): Promise<LoadResult> {
  defaultSession = session
  // Access itself can throw (Safari storage permissions); exclusive catches that too.
  let state = freshState(now)
  await session.exclusive(() => {
    defaultStorage = localStorage
    const canonical = session.readCanonical()
    // Canonical presence is authoritative, even if empty or corrupt. Never fall back.
    const raw = canonical !== null ? canonical : localStorage.getItem(V2_STORAGE_KEY) ?? localStorage.getItem(V1_STORAGE_KEY)
    if (raw !== null) {
      session.recoveryRaw = raw
      try {
        const parsed: unknown = JSON.parse(raw)
        const version = (parsed as { version?: unknown } | null)?.version
        if (typeof version === 'number' && version > 5) {
          session.block('此存档来自更新版本，已暂停写入。请使用对应版本打开。')
          return
        }
        if (![undefined, 1, 2, 3, 4, 5].includes(version as number | undefined)) throw new Error('Unsupported schema')
        if (canonical !== null && version !== 4 && version !== 5) throw new Error('Invalid canonical schema')
        if (version === 5) assertCanonicalState(parsed)
        state = restoreStoredState(parsed, now)
        assertUsableState(state)
      } catch {
        const backup = writeBackup(raw, 'unreadable', now)
        const protectedRaw = backup !== null && readBackup(backup) === raw
        session.block(RECOVERY_NOTICE, protectedRaw)
        return
      }
      if (canonical === null || (JSON.parse(raw) as {version?: number}).version !== 5) {
        // Even schema 4 stranded under V2 needs an independent verified original copy.
        const key = writeBackup(raw, 'before-migration', now)
        if (key === null || readBackup(key) !== raw) {
          session.block('无法保存并核验升级前备份，已暂停记录，原数据保留。请释放存储空间或检查权限后刷新。')
          return
        }
      }
    }
    if (!session.checkCurrent()) return
    session.writeVerified(JSON.stringify(state), assertCanonicalState)
    session.activate()
  })
  return { state, session, canPersist: session.getCanPersist(), notice: session.notice }
}

function freshState(now: Date) {
  return syncHistory(createInitialState(now))
}

export function assertCanonicalState(value: unknown) {
  if ((value as { version?: unknown } | null)?.version !== 5) throw new Error('Expected schema 5')
  assertStoredStateShape(value)
  assertUsableState(value as AppState)
}

/**
 * Validates and migrates a stored or imported save (any supported version) into a current
 * AppState for `now`. Throws when the value is not safe to use.
 */
export function restoreStoredState(value: unknown, now: Date): AppState {
  assertStoredStateShape(value)
  if (((value as {version?: number}).version ?? 0) >= 4) validateV31(value as AppState)
  if ((value as {version?: number}).version === 5) assertUsableState(value as AppState)
  const migrated = seedV31(migrateState(value, now))
  // Validate before day synchronization can replace a malformed current history row.
  assertUsableState(migrated)
  return syncHistory(ensureCurrentDay(migrated, now))
}

const RUN_STATUSES = ['idle', 'running', 'paused', 'completed']
const BREATH_PHASES = ['inhale', 'hold', 'exhale', 'endHold']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Throws when stored data is not safe to hand to migrateState. Only fields the app
// already dereferences unconditionally are checked, so valid older saves still load.
function assertStoredStateShape(value: unknown): asserts value is AppState | LegacyAppState {
  const fail = (field: string): never => {
    throw new Error(`Stored state is invalid: ${field}`)
  }

  if (!isRecord(value)) return fail('root')
  const { rhythm, breath, today, strength, library, history } = value

  if (!isRecord(rhythm) || !Array.isArray(rhythm.entriesToday)) return fail('rhythm')
  if (!RUN_STATUSES.includes(rhythm.status as string)) return fail('rhythm.status')
  if (typeof rhythm.selectedDurationMinutes !== 'number') return fail('rhythm.selectedDurationMinutes')

  if (!isRecord(breath) || !Array.isArray(breath.entriesToday)) return fail('breath')
  if (!RUN_STATUSES.includes(breath.status as string)) return fail('breath.status')
  if (!BREATH_PHASES.includes(breath.currentPhase as string)) return fail('breath.currentPhase')
  if (typeof breath.selectedRounds !== 'number') return fail('breath.selectedRounds')
  if (!isRecord(breath.customPattern)) return fail('breath.customPattern')

  if (!isRecord(today) || !isRecord(today.completionTimesByHabitId)) return fail('today')
  // Added after v3 shipped: absent in older saves (defaulted by migrateState), never malformed.
  if (today.foundationCompletedAt !== undefined && !isRecord(today.foundationCompletedAt)) {
    return fail('today.foundationCompletedAt')
  }
  if (today.movementSessions !== undefined && !Array.isArray(today.movementSessions)) {
    return fail('today.movementSessions')
  }

  if (!isRecord(strength) || !Array.isArray(strength.completedExerciseIds)) return fail('strength')
  if (strength.routines !== undefined && !Array.isArray(strength.routines)) return fail('strength.routines')

  if (history !== undefined && !Array.isArray(history)) return fail('history')
  for (const record of history ?? []) {
    if (!isRecord(record)) continue
    if (record.foundation !== undefined && !isRecord(record.foundation)) return fail('history.foundation')
    if (record.habitEvents !== undefined && !isRecord(record.habitEvents)) return fail('history.habitEvents')
    if (record.movementSessions !== undefined && !Array.isArray(record.movementSessions)) {
      return fail('history.movementSessions')
    }
  }

  if (isRecord(library) && Array.isArray(library.habits)) {
    for (const habit of library.habits) {
      if (!isRecord(habit)) return fail('library.habits')
      if (habit.group !== undefined && !HABIT_GROUPS.includes(habit.group as typeof HABIT_GROUPS[number])) return fail('habit.group')
      if (habit.recordingMode !== undefined && (typeof habit.recordingMode !== 'string' || !Object.hasOwn(MODE_LABELS, habit.recordingMode))) return fail('habit.recordingMode')
      if (habit.frequency !== undefined && (typeof habit.frequency !== 'string' || !Object.hasOwn(FREQUENCY_LABELS, habit.frequency))) return fail('habit.frequency')
    }
  }
  if (isRecord(library) && Array.isArray(library.exercises)) {
    for (const exercise of library.exercises) {
      if (!isRecord(exercise)) return fail('library.exercises')
      if (exercise.dailyCore !== undefined && typeof exercise.dailyCore !== 'boolean') return fail('exercise.dailyCore')
      if (exercise.trying !== undefined && typeof exercise.trying !== 'boolean') return fail('exercise.trying')
      if (exercise.foundationId !== undefined && !FOUNDATION_ITEMS.some((item) => item.id === exercise.foundationId)) return fail('exercise.foundationId')
    }
  }

  if (value.version === 3 || value.version === 4 || value.version === 5) {
    if (!isRecord(library) || !Array.isArray(library.habits) || !Array.isArray(library.exercises)) {
      return fail('library')
    }
    if (!Array.isArray(strength.routines)) return fail('strength.routines')
  }
}

function migrateState(rawState: AppState | LegacyAppState, now: Date): AppState {
  if ((rawState as AppState).library) {
    const state = rawState as AppState
    return {
      ...state,
      version: 5,
      today: normalizeTodayState(state.today),
      history: (state.history ?? []).map(normalizeDayRecord),
      strength: {
        ...state.strength,
        routines: mergeBuiltInRoutines(state.strength.routines ?? [], state.version < 4),
      },
      library: {
        ...state.library,
        habits: mergeBuiltInHabits(state.library.habits, state.version < 4),
        exercises: mergeBuiltInExercises(state.library.exercises, state.version < 4),
      },
    }
  }

  const legacy = rawState as LegacyAppState
  return syncHistory({
    version: 5,
    currentDayKey: legacy.currentDayKey ?? toDayKey(now),
    selectedTab: legacy.selectedTab ?? 'rhythm',
    rhythm: legacy.rhythm,
    breath: legacy.breath,
    today: normalizeTodayState(legacy.today),
    strength: {
      completedExerciseIds: legacy.strength.completedExerciseIds,
      lastUpdatedAt: legacy.strength.lastUpdatedAt,
      routines: mergeBuiltInRoutines(legacy.strength.routines ?? STRENGTH_ROUTINES),
    },
    library: {
      habits: createDefaultHabits(),
      exercises: createDefaultExercises(),
    },
    history: (legacy.history ?? []).map(normalizeDayRecord),
  })
}

// Fields added after a save was written get safe empty defaults; existing values are kept as-is.
function normalizeTodayState(today: Partial<TodayState> & Pick<TodayState, 'completionTimesByHabitId'>): TodayState {
  return {
    ...today,
    completionTimesByHabitId: today.completionTimesByHabitId,
    eventsByHabitId: today.eventsByHabitId ?? {},
    foundationCompletedAt: today.foundationCompletedAt ?? {},
    movementSessions: today.movementSessions ?? [],
  }
}

function normalizeDayRecord(record: DayRecord): DayRecord {
  if (!isRecord(record)) {
    return record
  }
  return {
    ...record,
    habitEvents: record.habitEvents ?? {},
    foundation: record.foundation ?? {},
    movementSessions: record.movementSessions ?? [],
  }
}

export async function saveState(state: AppState, session = getPersistenceSession(), generation = session.generation): Promise<boolean> {
  return await session.exclusive(() => {
    // Standalone callers can bootstrap only an absent key, never replace unseen data.
    const bootstrap = !session.readKnown
    if (bootstrap) {
      if (!session.canBootstrap) return false
      session.canBootstrap = false
      if (session.readCanonical() !== null || localStorage.getItem(V2_STORAGE_KEY) !== null || localStorage.getItem(V1_STORAGE_KEY) !== null) {
        session.block('请先安全加载 V3 存档再保存。')
        return false
      }
    }
    if ((!bootstrap && !session.getCanPersist()) || session.generation !== generation || !session.checkCurrent()) return false
    session.writeVerified(JSON.stringify(state), assertCanonicalState)
    if (bootstrap) session.activate()
    return true
  }) ?? false
}

export function ensureCurrentDay(state: AppState, now: Date): AppState {
  const currentDayKey = toDayKey(now)
  if (state.currentDayKey === currentDayKey) {
    return syncHistory(refreshRunningState(state, now))
  }

  // Rhythm is judged against the real clock (so abandoned sessions are detected); Breath only
  // advances to midnight so rounds after midnight are not credited to the old day.
  const refreshed = settleOpenSessionsAtDayEnd(
    syncHistory(refreshRunningState(state, now, endOfDayKey(state.currentDayKey))),
    now,
  )
  return syncHistory({
    ...refreshed,
    currentDayKey,
    rhythm: {
      ...refreshed.rhythm,
      status: 'idle',
      entriesToday: [],
      sessionStartAt: null,
      activeStartAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
    },
    breath: freshBreathState({
      ...refreshed.breath,
      entriesToday: [],
      status: 'idle',
      sessionStartAt: null,
      activeRunStartAt: null,
      phaseEndAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
      completedRounds: 0,
      currentRound: 1,
    }),
    today: {
      completionTimesByHabitId: {},
      eventsByHabitId: {},
      foundationCompletedAt: {},
      movementSessions: [],
    },
    strength: {
      ...refreshed.strength,
      completedExerciseIds: [],
      lastUpdatedAt: null,
    },
  })
}

// A day change must not silently drop a session that was in progress. Whatever was
// completed by the end of the old day is finalized into that day's record.
function settleOpenSessionsAtDayEnd(state: AppState, now: Date): AppState {
  // If the device clock moved backwards, the stored day's midnight can still be in the
  // future; never settle at a time that has not happened yet.
  const endOfDay = endOfDayKey(state.currentDayKey)
  const settleAt = endOfDay < now ? endOfDay : now
  let next = state

  if (next.rhythm.status === 'running' || next.rhythm.status === 'paused') {
    next = finalizeRhythmState(next, settleAt, currentRhythmElapsedSeconds(next.rhythm, settleAt), false)
  }
  if (next.breath.status === 'running' || next.breath.status === 'paused') {
    next = finalizeBreathState(next, settleAt)
  }

  return next
}

function endOfDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0)
}

export function refreshAppState(state: AppState, now: Date) {
  return ensureCurrentDay(state, now)
}

function refreshRunningState(state: AppState, now: Date, breathNow: Date = now): AppState {
  let next = state
  if (state.rhythm.status === 'running') {
    next = refreshRhythmState(next, now)
  }
  if (next.breath.status === 'running') {
    next = refreshBreathState(next, breathNow < now ? breathNow : now)
  }
  return next
}

function refreshRhythmState(state: AppState, now: Date): AppState {
  if (state.rhythm.status !== 'running') {
    return state
  }

  const elapsedSeconds = currentRhythmElapsedSeconds(state.rhythm, now)
  const targetSeconds = state.rhythm.selectedDurationMinutes * 60
  if (elapsedSeconds < targetSeconds) {
    return { ...state, rhythm: { ...state.rhythm, lastSeenAt: now.toISOString() } }
  }

  if (isAbandonedRhythm(state.rhythm, targetSeconds, now)) {
    // Nobody was around to see this session through; credit only the time the app observed.
    const lastSeen = new Date(state.rhythm.lastSeenAt ?? state.rhythm.activeStartAt ?? now)
    const observedSeconds = Math.min(targetSeconds, currentRhythmElapsedSeconds(state.rhythm, lastSeen))
    return finalizeRhythmState(state, lastSeen, observedSeconds, false)
  }

  return finalizeRhythmState(state, now, targetSeconds, true)
}

function isAbandonedRhythm(rhythm: AppState['rhythm'], targetSeconds: number, now: Date) {
  if (!rhythm.activeStartAt) {
    return false
  }

  const plannedEndMs =
    new Date(rhythm.activeStartAt).getTime() + (targetSeconds - rhythm.elapsedSecondsBeforeCurrentRun) * 1000
  return now.getTime() - plannedEndMs > RHYTHM_ABANDONED_GRACE_SECONDS * 1000
}

export function toggleRhythmState(state: AppState, now: Date): AppState {
  switch (state.rhythm.status) {
    case 'idle':
    case 'completed':
      return syncHistory({
        ...state,
        rhythm: {
          ...state.rhythm,
          status: 'running',
          sessionStartAt: now.toISOString(),
          activeStartAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
          elapsedSecondsBeforeCurrentRun: 0,
        },
      })
    case 'running':
      return syncHistory({
        ...state,
        rhythm: {
          ...state.rhythm,
          status: 'paused',
          activeStartAt: null,
          elapsedSecondsBeforeCurrentRun: currentRhythmElapsedSeconds(state.rhythm, now),
        },
      })
    case 'paused':
      return syncHistory({
        ...state,
        rhythm: {
          ...state.rhythm,
          status: 'running',
          activeStartAt: now.toISOString(),
          lastSeenAt: now.toISOString(),
        },
      })
  }
}

export function endRhythmState(state: AppState, now: Date): AppState {
  if (!['running', 'paused'].includes(state.rhythm.status)) {
    return syncHistory({
      ...state,
      rhythm: {
        ...state.rhythm,
        status: 'idle',
        sessionStartAt: null,
        activeStartAt: null,
        elapsedSecondsBeforeCurrentRun: 0,
      },
    })
  }

  return finalizeRhythmState(state, now, currentRhythmElapsedSeconds(state.rhythm, now), false)
}

function finalizeRhythmState(
  state: AppState,
  endTime: Date,
  elapsedSeconds: number,
  hitPresetEnd: boolean,
): AppState {
  const shouldRecord = hitPresetEnd || elapsedSeconds >= RHYTHM_MINIMUM_RECORDED_SECONDS
  let entriesToday = state.rhythm.entriesToday

  if (shouldRecord && state.rhythm.sessionStartAt) {
    entriesToday = appendRhythmEntry(entriesToday, {
      id: state.rhythm.sessionStartAt,
      startAt: state.rhythm.sessionStartAt,
      endAt: endTime.toISOString(),
      durationSeconds: Math.min(state.rhythm.selectedDurationMinutes * 60, elapsedSeconds),
    })
  }

  return syncHistory(annotateTimedRecord({
    ...state,
    rhythm: {
      ...state.rhythm,
      status: shouldRecord || hitPresetEnd ? 'completed' : 'idle',
      entriesToday,
      sessionStartAt: null,
      activeStartAt: null,
      lastSeenAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
    },
  }, 'rhythm', shouldRecord && state.rhythm.sessionStartAt ? entriesToday.at(-1) : undefined))
}

function appendRhythmEntry(entries: RhythmEntry[], newEntry: RhythmEntry) {
  const lastEntry = entries.at(-1)
  if (!lastEntry) {
    return [...entries, newEntry]
  }

  const gapSeconds = Math.floor(
    (new Date(newEntry.startAt).getTime() - new Date(lastEntry.endAt).getTime()) / 1000,
  )

  if (gapSeconds < 0 || gapSeconds > RHYTHM_MERGE_THRESHOLD_SECONDS) {
    return [...entries, newEntry]
  }

  return [
    ...entries.slice(0, -1),
    {
      id: lastEntry.id,
      startAt: lastEntry.startAt,
      endAt: newEntry.endAt,
      durationSeconds: lastEntry.durationSeconds + newEntry.durationSeconds,
    },
  ]
}

function currentRhythmElapsedSeconds(state: AppState['rhythm'], now: Date) {
  if (state.status !== 'running' || !state.activeStartAt) {
    return state.elapsedSecondsBeforeCurrentRun
  }

  return (
    state.elapsedSecondsBeforeCurrentRun +
    Math.max(0, Math.floor((now.getTime() - new Date(state.activeStartAt).getTime()) / 1000))
  )
}

function getRhythmRemainingSeconds(state: AppState['rhythm']) {
  const elapsedSeconds =
    state.status === 'completed' ? state.selectedDurationMinutes * 60 : currentRhythmElapsedSeconds(state, new Date())
  return Math.max(0, state.selectedDurationMinutes * 60 - elapsedSeconds)
}

function freshBreathState(state: AppState['breath']): AppState['breath'] {
  const pattern = getBreathPattern(state.selectedMode, state.customPattern)
  const firstPhase = getActiveBreathPhases(pattern)[0] ?? 'inhale'
  return {
    ...state,
    customPattern: clampBreathPattern(state.customPattern),
    currentPhase: firstPhase,
    phaseRemainingSeconds: getBreathPhaseDuration(pattern, firstPhase),
    currentRound: 1,
    completedRounds: state.status === 'completed' ? state.completedRounds : 0,
    sessionStartAt: null,
    activeRunStartAt: null,
    phaseEndAt: null,
    elapsedSecondsBeforeCurrentRun: 0,
  }
}

export function toggleBreathState(state: AppState, now: Date): AppState {
  switch (state.breath.status) {
    case 'idle':
    case 'completed': {
      const pattern = getBreathPattern(state.breath.selectedMode, state.breath.customPattern)
      const firstPhase = getActiveBreathPhases(pattern)[0] ?? 'inhale'
      const phaseSeconds = getBreathPhaseDuration(pattern, firstPhase)

      return syncHistory({
        ...state,
        breath: {
          ...state.breath,
          status: 'running',
          currentPhase: firstPhase,
          phaseRemainingSeconds: phaseSeconds,
          currentRound: 1,
          completedRounds: 0,
          sessionStartAt: now.toISOString(),
          activeRunStartAt: now.toISOString(),
          phaseEndAt: new Date(now.getTime() + phaseSeconds * 1000).toISOString(),
          elapsedSecondsBeforeCurrentRun: 0,
        },
      })
    }
    case 'running':
      return syncHistory({
        ...state,
        breath: {
          ...state.breath,
          status: 'paused',
          activeRunStartAt: null,
          phaseEndAt: null,
          elapsedSecondsBeforeCurrentRun: currentBreathElapsedSeconds(state.breath, now),
          phaseRemainingSeconds: getBreathPhaseRemainingSeconds(state.breath, now),
        },
      })
    case 'paused':
      return syncHistory({
        ...state,
        breath: {
          ...state.breath,
          status: 'running',
          activeRunStartAt: now.toISOString(),
          phaseEndAt: new Date(now.getTime() + state.breath.phaseRemainingSeconds * 1000).toISOString(),
        },
      })
  }
}

function endBreathState(state: AppState, now: Date): AppState {
  if (!['running', 'paused'].includes(state.breath.status)) {
    return syncHistory({
      ...state,
      breath: {
        ...freshBreathState(state.breath),
        entriesToday: state.breath.entriesToday,
        status: 'idle',
      },
    })
  }

  return finalizeBreathState(state, now)
}

function refreshBreathState(state: AppState, now: Date): AppState {
  if (state.breath.status !== 'running' || !state.breath.phaseEndAt) {
    return state
  }

  let next = state
  let guard = 0

  while (
    next.breath.status === 'running' &&
    next.breath.phaseEndAt &&
    new Date(next.breath.phaseEndAt).getTime() <= now.getTime() &&
    guard < 50
  ) {
    next = advanceBreathPhase(next, new Date(next.breath.phaseEndAt))
    guard += 1
  }

  if (next.breath.status !== 'running' || !next.breath.phaseEndAt) {
    return next
  }

  const phaseRemainingSeconds = getBreathPhaseRemainingSeconds(next.breath, now)
  if (phaseRemainingSeconds === next.breath.phaseRemainingSeconds) {
    return next
  }

  return syncHistory({
    ...next,
    breath: {
      ...next.breath,
      phaseRemainingSeconds,
    },
  })
}

function advanceBreathPhase(state: AppState, boundary: Date): AppState {
  const pattern = getBreathPattern(state.breath.selectedMode, state.breath.customPattern)
  const phases = getActiveBreathPhases(pattern)
  const currentIndex = phases.indexOf(state.breath.currentPhase)

  if (currentIndex === -1) {
    return finalizeBreathState(state, boundary)
  }

  if (currentIndex === phases.length - 1) {
    const completedRounds = state.breath.completedRounds + 1
    if (completedRounds >= state.breath.selectedRounds) {
      return finalizeBreathState(
        {
          ...state,
          breath: {
            ...state.breath,
            completedRounds,
          },
        },
        boundary,
      )
    }

    const nextPhase = phases[0]
    const phaseSeconds = getBreathPhaseDuration(pattern, nextPhase)
    return syncHistory({
      ...state,
      breath: {
        ...state.breath,
        completedRounds,
        currentRound: completedRounds + 1,
        currentPhase: nextPhase,
        phaseRemainingSeconds: phaseSeconds,
        phaseEndAt: new Date(boundary.getTime() + phaseSeconds * 1000).toISOString(),
      },
    })
  }

  const nextPhase = phases[currentIndex + 1]
  const phaseSeconds = getBreathPhaseDuration(pattern, nextPhase)
  return syncHistory({
    ...state,
    breath: {
      ...state.breath,
      currentPhase: nextPhase,
      phaseRemainingSeconds: phaseSeconds,
      phaseEndAt: new Date(boundary.getTime() + phaseSeconds * 1000).toISOString(),
    },
  })
}

function finalizeBreathState(state: AppState, endTime: Date): AppState {
  const totalDurationSeconds = currentBreathElapsedSeconds(state.breath, endTime)
  const shouldRecord = totalDurationSeconds > 0 && state.breath.sessionStartAt
  const entriesToday = shouldRecord
    ? [
        ...state.breath.entriesToday,
        {
          id: state.breath.sessionStartAt!,
          startAt: state.breath.sessionStartAt!,
          endAt: endTime.toISOString(),
          totalDurationSeconds,
          mode: state.breath.selectedMode,
          pattern: getBreathPattern(state.breath.selectedMode, state.breath.customPattern),
          completedRounds: state.breath.completedRounds,
        } satisfies BreathSessionEntry,
      ]
    : state.breath.entriesToday

  return syncHistory(annotateTimedRecord({
    ...state,
    breath: {
      ...freshBreathState({
        ...state.breath,
        entriesToday,
      }),
      entriesToday,
      status: shouldRecord ? 'completed' : 'idle',
      completedRounds: shouldRecord ? state.breath.completedRounds : 0,
    },
  }, 'breath', shouldRecord ? entriesToday.at(-1) : undefined))
}

function currentBreathElapsedSeconds(state: AppState['breath'], now: Date) {
  if (state.status !== 'running' || !state.activeRunStartAt) {
    return state.elapsedSecondsBeforeCurrentRun
  }

  return (
    state.elapsedSecondsBeforeCurrentRun +
    Math.max(0, Math.floor((now.getTime() - new Date(state.activeRunStartAt).getTime()) / 1000))
  )
}

function getBreathPhaseRemainingSeconds(state: AppState['breath'], now: Date) {
  if (!state.phaseEndAt) {
    return state.phaseRemainingSeconds
  }
  return Math.max(1, Math.ceil((new Date(state.phaseEndAt).getTime() - now.getTime()) / 1000))
}

function syncHistory(state: AppState): AppState {
  const currentRecord = createEmptyDayRecord(state.currentDayKey)
  currentRecord.rhythmEntries = state.rhythm.entriesToday
  currentRecord.breathSessions = state.breath.entriesToday
  currentRecord.strengthCompletedExerciseIds = state.strength.completedExerciseIds
  currentRecord.strengthLastUpdatedAt = state.strength.lastUpdatedAt
  currentRecord.habits = state.today.completionTimesByHabitId
  currentRecord.habitEvents = state.today.eventsByHabitId
  currentRecord.foundation = state.today.foundationCompletedAt
  currentRecord.movementSessions = state.today.movementSessions
  if (state.today.captureIds) currentRecord.captureIds = state.today.captureIds
  if (state.today.recordDetails) currentRecord.recordDetails = state.today.recordDetails
  if (state.today.journals) currentRecord.journals = state.today.journals
  if (state.today.dominoSnapshots) currentRecord.dominoSnapshots = state.today.dominoSnapshots

  const history = [...state.history.filter((record) => record.dayKey !== state.currentDayKey), currentRecord].sort((left, right) =>
    left.dayKey < right.dayKey ? 1 : -1,
  )

  return {
    ...state,
    history,
  }
}

export function toggleHabitState(state: AppState, habitId: HabitId, nowDate: Date): AppState {
  return syncHistory(logDomino(state, habitId, state.currentDayKey, undefined, nowDate))
}

export function toggleFoundationItemState(state: AppState, itemId: FoundationItemId, now: Date): AppState {
  if (!FOUNDATION_ITEMS.some((item) => item.id === itemId)) {
    return state
  }

  const foundationCompletedAt = { ...state.today.foundationCompletedAt }
  const recordDetails = { ...state.today.recordDetails }
  if (foundationCompletedAt[itemId]) {
    delete foundationCompletedAt[itemId]
    delete recordDetails[`foundation-${itemId}`]
  } else {
    foundationCompletedAt[itemId] = now.toISOString()
  }

  return syncHistory({ ...state, today: { ...state.today, foundationCompletedAt, ...(state.today.recordDetails ? { recordDetails } : {}) } })
}

const MOVEMENT_INTENSITIES = Object.keys(MOVEMENT_INTENSITY_LABELS) as MovementIntensity[]

function sanitizeMovementDraft(draft: MovementSessionDraft): Omit<MovementSession, 'id' | 'loggedAt'> | null {
  const durationMinutes = parseMovementMinutes(draft.durationMinutes)
  if (durationMinutes === null || typeof draft.typeId !== 'string' || !draft.typeId) {
    return null
  }

  const note = draft.note?.trim()
  return {
    typeId: draft.typeId,
    durationMinutes,
    ...(draft.intensity && MOVEMENT_INTENSITIES.includes(draft.intensity) ? { intensity: draft.intensity } : {}),
    ...(note ? { note } : {}),
  }
}

export function addMovementSessionState(state: AppState, draft: MovementSessionDraft, now: Date): AppState {
  const fields = sanitizeMovementDraft(draft)
  if (!fields || (!isKnownMovementType(fields.typeId) && !state.library.habits.some((habit) => habit.id === fields.typeId && habitMode(habit) === 'duration'))) {
    return state
  }

  const session: MovementSession = { id: makeLocalId('movement'), loggedAt: now.toISOString(), ...fields }
  return syncHistory({
    ...state,
    today: { ...state.today, movementSessions: [...state.today.movementSessions, session] },
  })
}

export function updateMovementSessionState(
  state: AppState,
  dayKey: string,
  sessionId: string,
  draft: MovementSessionDraft,
): AppState {
  const fields = sanitizeMovementDraft(draft)
  if (!fields) {
    return state
  }

  return mapMovementSessionsForDay(state, dayKey, (sessions) =>
    sessions.map((session) => {
      // A retired type may be kept on its own record, but never newly assigned.
      if (session.id !== sessionId || (!isKnownMovementType(fields.typeId) && fields.typeId !== session.typeId)) {
        return session
      }
      return { id: session.id, loggedAt: session.loggedAt, ...fields }
    }),
  )
}

export function deleteMovementSessionState(state: AppState, dayKey: string, sessionId: string): AppState {
  return mapMovementSessionsForDay(state, dayKey, (sessions) => sessions.filter((session) => session.id !== sessionId))
}

// Today's sessions live in state.today (syncHistory mirrors them into history); earlier days
// are edited in their history record directly.
function mapMovementSessionsForDay(
  state: AppState,
  dayKey: string,
  transform: (sessions: MovementSession[]) => MovementSession[],
): AppState {
  if (dayKey !== state.currentDayKey && !state.history.some((record) => record.dayKey === dayKey)) return state
  const record = dayRecord(state, dayKey)
  const movementSessions = transform(record.movementSessions)
  const recordDetails = record.recordDetails ? { ...record.recordDetails } : undefined
  if (recordDetails) for (const old of record.movementSessions) {
    const key = `movement-${old.id}`, next = movementSessions.find((item) => item.id === old.id)
    if (!next) delete recordDetails[key]
    else if (recordDetails[key]) recordDetails[key] = { ...recordDetails[key], note: next.note ?? '' }
  }
  return syncHistory(putDay(state, { ...record, movementSessions, ...(recordDetails ? { recordDetails } : {}) }))
}

/** Pre-fill for the quick log: the most recent session of this type, else the type's default. */
export function movementDefaultsFor(state: AppState, typeId: string): MovementDefaults {
  const records = [...state.history].sort((left, right) => (left.dayKey < right.dayKey ? 1 : -1))
  for (const record of records) {
    const latest = record.movementSessions.findLast((session) => session.typeId === typeId)
    if (latest) {
      return { durationMinutes: latest.durationMinutes, intensity: latest.intensity ?? 'moderate' }
    }
  }

  const type = MOVEMENT_TYPES.find((candidate) => candidate.id === typeId)
  return { durationMinutes: type?.defaultMinutes ?? 30, intensity: 'moderate' }
}

export function resolveStrengthRoutines(
  exercises: ExerciseDefinition[],
  routines: StrengthRoutine[],
): ResolvedStrengthRoutine[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return routines
    .filter((routine) => routine.enabled)
    .map((routine) => ({
    id: routine.id,
    name: routine.name,
    enabled: routine.enabled,
    isBuiltIn: routine.isBuiltIn,
    exercises: routine.exercises.map((routineExercise) => {
      const exercise = byId.get(routineExercise.exerciseId)
      if (exercise) {
        return resolveRoutineExercise(exercise, routineExercise)
      }

      return {
        id: routineExercise.exerciseId,
        name: '动作不可用',
        category: '不可用',
        description: '动作暂不可用。',
        caution: '可在管理中启用动作。',
        suggestedVolume: '',
        suggestedSets: '',
        estimatedTime: '',
        enabled: false,
        customSets: routineExercise.customSets,
        customVolume: routineExercise.customVolume,
        customTime: routineExercise.customTime,
        displaySets: routineExercise.customSets ?? '',
        displayVolume: routineExercise.customVolume ?? '',
        displayTime: routineExercise.customTime ?? '',
      }
    }),
  }))
}

export function buildTodayTimeline(
  state: AppState,
  _visibleTodayHabits: HabitDefinition[],
  strengthRoutines: ResolvedStrengthRoutine[],
): TodayTimelineEvent[] {
  const habitById = new Map(state.library.habits.map((habit) => [habit.id, habit]))
  const events: TodayTimelineEvent[] = [
    ...state.rhythm.entriesToday.map((entry) => ({
      id: `rhythm-${entry.id}`,
      timestamp: entry.startAt,
      title: '节律',
      summary: `${displayMinutes(entry.durationSeconds)} 分钟`,
      detail: `180 BPM · ${formatDurationMinutes(entry.durationSeconds)}`,
      kind: 'rhythm' as const,
    })),
    ...state.breath.entriesToday.map((entry) => ({
      id: `breath-${entry.id}`,
      timestamp: entry.startAt,
      title: '呼吸',
      summary: `${entry.completedRounds} 轮`,
      detail: `${BREATH_MODE_LABELS[entry.mode]} 模式 ${entry.pattern.inhale}-${entry.pattern.hold}-${entry.pattern.exhale}-${entry.pattern.endHold} · ${formatDurationMinutes(entry.totalDurationSeconds)}.`,
      kind: 'breath' as const,
    })),
    ...state.today.movementSessions.map((session) => ({
      id: `movement-${session.id}`,
      timestamp: session.loggedAt,
      title: state.library.habits.find((habit) => habit.id === session.typeId)?.name ?? movementTypeLabel(session.typeId),
      summary: `${session.durationMinutes} 分钟`,
      detail: movementDetail(session),
      note: session.note,
      kind: 'movement' as const,
    })),
    ...(state.strength.completedExerciseIds.length > 0 && state.strength.lastUpdatedAt
      ? [
          {
            id: 'strength-today',
            timestamp: state.strength.lastUpdatedAt,
            title: '力量',
            summary: buildStrengthSummary(state.strength.completedExerciseIds, strengthRoutines),
            detail: buildStrengthDetail(state.strength.completedExerciseIds, strengthRoutines, state.library.exercises),
            kind: 'strength' as const,
          },
        ]
      : []),
    ...Object.entries(state.today.foundationCompletedAt).flatMap(([id, timestamp]) => timestamp ? [{
      id: `foundation-${id}`, timestamp, title: state.library.exercises.find((exercise) => exercise.foundationId === id)?.name ?? id,
      summary: '已完成', detail: (() => { const exercise = state.library.exercises.find((item) => item.foundationId === id); return exercise ? [exercise.suggestedSets, exercise.suggestedVolume, exercise.estimatedTime, exercise.description].filter(Boolean).join(' · ') : undefined })(),
      kind: 'strength' as const,
    }] : []),
    ...Array.from(new Set([...Object.keys(state.today.completionTimesByHabitId), ...Object.keys(state.today.eventsByHabitId)])).flatMap((id) => {
      const habit = habitById.get(id)
      const captures = state.today.eventsByHabitId[id] ?? []
      const completion = state.today.completionTimesByHabitId[id]
      // Show every stored capture, even after hiding or changing the item's recording mode.
      return [
        ...captures.map((timestamp, index) => ({ id: state.today.captureIds?.[id]?.[index] ?? `capture-${state.currentDayKey}-${id}-${index}`, timestamp, title: habit?.name ?? id, summary: '已记录', detail: habit?.note, kind: 'habit' as const })),
        ...(completion ? [{ id: `habit-${id}`, timestamp: completion, title: habit?.name ?? id, summary: '已完成', detail: habit?.note, kind: 'habit' as const }] : []),
      ]
    }),
  ]

  return decorateTimeline(events, dayRecord(state, state.currentDayKey))
}

function movementDetail(session: MovementSession) {
  const parts = [session.intensity ? MOVEMENT_INTENSITY_LABELS[session.intensity] : '', session.note ?? '']
  return parts.filter(Boolean).join(' · ') || undefined
}

function buildStrengthSummary(completedExerciseIds: string[], routines: ResolvedStrengthRoutine[]) {
  if (completedExerciseIds.length === 0) {
    return '未完成'
  }

  const matchingRoutine = routines.find((routine) => {
    const routineCount = routine.exercises.filter((exercise) => completedExerciseIds.includes(exercise.id)).length
    return routineCount > 0 && routineCount === completedExerciseIds.length
  })

  if (matchingRoutine) {
    return `${completedExerciseIds.length}/${matchingRoutine.exercises.length} 项`
  }

  return `${completedExerciseIds.length} 项`
}

function buildStrengthDetail(completedExerciseIds: string[], routines: ResolvedStrengthRoutine[], exercises: ExerciseDefinition[] = []) {
  const byId = new Map([...routines.flatMap((routine) => routine.exercises), ...exercises].map((exercise) => [exercise.id, exercise]))
  return [...new Set(completedExerciseIds)].map((id) => byId.get(id)?.name ?? id).join('、')
}

export function toggleStrengthExerciseState(state: AppState, exerciseId: string, now: Date): AppState {
  const exercise = state.library.exercises.find((item) => item.id === exerciseId)
  if (exercise?.foundationId) return toggleFoundationItemState(state, exercise.foundationId, now)
  const ids = new Set(state.strength.completedExerciseIds)
  if (ids.has(exerciseId)) ids.delete(exerciseId)
  else ids.add(exerciseId)
  const recordDetails = state.today.recordDetails ? { ...state.today.recordDetails } : undefined
  if (ids.size === 0 && recordDetails) delete recordDetails['strength-today']
  return syncHistory({ ...state, ...(recordDetails ? { today: { ...state.today, recordDetails } } : {}), strength: { ...state.strength, completedExerciseIds: [...ids], lastUpdatedAt: now.toISOString() } })
}

export function buildDailyHistorySummary(record: DayRecord, routines: ResolvedStrengthRoutine[]): HistoryDailySummary {
  void routines
  const foundation = FOUNDATION_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    completedAt: record.foundation[item.id] ?? null,
  }))
  const movementSessions = [...record.movementSessions].sort((left, right) =>
    left.loggedAt < right.loggedAt ? -1 : left.loggedAt > right.loggedAt ? 1 : 0,
  )

  return {
    habitRecords: Array.from(new Set([...Object.keys(record.habits), ...Object.keys(record.habitEvents)])).map((id) => ({ id, completed: Boolean(record.habits[id]), captures: record.habitEvents[id]?.length ?? 0 })),
    strengthExerciseIds: [...new Set([...record.strengthCompletedExerciseIds, ...Object.keys(record.foundation)])],
    rhythmTotalMinutes: totalRhythmMinutes(record.rhythmEntries),
    rhythmEntriesCount: record.rhythmEntries.length,
    breathSessionsCount: record.breathSessions.length,
    breathRoundsCount: record.breathSessions.reduce((total, session) => total + session.completedRounds, 0),
    strengthSummary: `${new Set([...record.strengthCompletedExerciseIds, ...Object.keys(record.foundation)]).size} 项`,
    mindfulEatingCompleted: isHabitDoneOn(record, BUILT_IN_HABIT_IDS.mindfulEating),
    mindfulEatingCaptureCount: record.habitEvents[BUILT_IN_HABIT_IDS.mindfulEating]?.length ?? 0,
    earlySleepCompleted: isHabitDoneOn(record, BUILT_IN_HABIT_IDS.earlySleep),
    foundation,
    foundationCompletedCount: foundation.filter((item) => item.completedAt).length,
    movementSessions,
    movementTotalMinutes: movementSessions.reduce((total, session) => total + session.durationMinutes, 0),
  }
}

// A day counts once per habit: a completion time (toggle habits, and older Mindful eating
// saves) or at least one capture (multi-capture habits).
function isHabitDoneOn(record: DayRecord, habitId: HabitId) {
  return Boolean(record.habits[habitId]) || (record.habitEvents[habitId]?.length ?? 0) > 0
}

function foundationCountForRecord(record: DayRecord) {
  return FOUNDATION_ITEMS.filter((item) => Boolean(record.foundation[item.id])).length
}

const HISTORY_PERIOD_KINDS: HistoryPeriodKind[] = ['day', 'week', 'month']

function periodKeyFor(kind: HistoryPeriodKind, dayKey: string) {
  switch (kind) {
    case 'day':
      return dayKey
    case 'week':
      return weekStartDayKey(dayKey)
    case 'month':
      return monthKeyOf(dayKey)
  }
}

function shiftPeriodKey(kind: HistoryPeriodKind, key: string, delta: number) {
  switch (kind) {
    case 'day':
      return shiftDayKey(key, delta)
    case 'week':
      return shiftDayKey(key, delta * 7)
    case 'month':
      return shiftMonthKey(key, delta)
  }
}

/** The first day History can usefully show: the oldest stored record, or today. */
export function historyEarliestDayKey(state: AppState) {
  return state.history.reduce(
    (earliest, record) => (record.dayKey < earliest ? record.dayKey : earliest),
    state.currentDayKey,
  )
}

/**
 * Back stops at the period holding the oldest record; forward stops at the current period.
 * A key beyond the current period (e.g. after the clock moved back) is pulled back to it.
 */
export function getPeriodNavigation(
  kind: HistoryPeriodKind,
  key: string,
  earliestDayKey: string,
  currentDayKey: string,
): HistoryPeriodNavigation {
  const latest = periodKeyFor(kind, currentDayKey)
  const clampedKey = key > latest ? latest : key
  return {
    key: clampedKey,
    canGoBack: clampedKey > periodKeyFor(kind, earliestDayKey),
    canGoForward: clampedKey < latest,
    isCurrent: clampedKey === latest,
  }
}

export function stepPeriodKey(
  kind: HistoryPeriodKind,
  key: string,
  delta: -1 | 1,
  earliestDayKey: string,
  currentDayKey: string,
) {
  const navigation = getPeriodNavigation(kind, key, earliestDayKey, currentDayKey)
  if ((delta < 0 && !navigation.canGoBack) || (delta > 0 && !navigation.canGoForward)) {
    return navigation.key
  }
  return shiftPeriodKey(kind, navigation.key, delta)
}

export function buildHistorySummary(
  history: DayRecord[],
  dayKeys: string[],
  // Days after this are still ahead and do not count towards completion rates.
  currentDayKey?: string,
): HistorySummary {
  const matchingRecords = history.filter((record) => dayKeys.includes(record.dayKey))
  const elapsedDaysCount = currentDayKey
    ? dayKeys.filter((dayKey) => dayKey <= currentDayKey).length
    : dayKeys.length
  const movementSessions = matchingRecords.flatMap((record) => record.movementSessions)
  const movementTypeIds = [
    ...MOVEMENT_TYPES.map((type) => type.id),
    ...new Set(movementSessions.map((session) => session.typeId).filter((typeId) => !isKnownMovementType(typeId))),
  ]
  const foundationDailyCounts = dayKeys.map((dayKey) => {
    const record = matchingRecords.find((candidate) => candidate.dayKey === dayKey)
    return { dayKey, completedCount: record ? foundationCountForRecord(record) : 0 }
  })

  return {
    habitCompletionsCount: matchingRecords.reduce((sum, record) => sum + completedHabitIds(record.habits, record.habitEvents).length, 0),
    habitCapturesCount: matchingRecords.reduce((sum, record) => sum + Object.values(record.habitEvents).reduce((total, captures) => total + (captures?.length ?? 0), 0), 0),
    strengthCompletionsCount: matchingRecords.reduce((sum, record) => sum + new Set([...record.strengthCompletedExerciseIds, ...Object.keys(record.foundation)]).size, 0),
    breathSessionsCount: matchingRecords.reduce((sum, record) => sum + record.breathSessions.length, 0),
    totalRhythmMinutes: totalRhythmMinutes(matchingRecords.flatMap((record) => record.rhythmEntries)),
    rhythmDaysCount: matchingRecords.filter((record) => record.rhythmEntries.length > 0).length,
    strengthDaysCount: matchingRecords.filter((record) => (record.strengthCompletedExerciseIds.length > 0 || Object.values(record.foundation).some(Boolean))).length,
    mindfulEatingDaysCount: matchingRecords.filter((record) => isHabitDoneOn(record, BUILT_IN_HABIT_IDS.mindfulEating)).length,
    earlySleepDaysCount: matchingRecords.filter((record) => isHabitDoneOn(record, BUILT_IN_HABIT_IDS.earlySleep)).length,
    foundationDaysById: Object.fromEntries(
      FOUNDATION_ITEMS.map((item) => [
        item.id,
        matchingRecords.filter((record) => Boolean(record.foundation[item.id])).length,
      ]),
    ) as Record<FoundationItemId, number>,
    elapsedDaysCount,
    foundationCompletedCount: foundationDailyCounts.reduce((total, day) => total + day.completedCount, 0),
    foundationPossibleCount: elapsedDaysCount * FOUNDATION_ITEMS.length,
    foundationFullDaysCount: foundationDailyCounts.filter((day) => day.completedCount === FOUNDATION_ITEMS.length)
      .length,
    foundationDailyCounts,
    movementSessionsCount: movementSessions.length,
    movementTotalMinutes: movementSessions.reduce((total, session) => total + session.durationMinutes, 0),
    movementByType: movementTypeIds.map((typeId) => {
      const sessions = movementSessions.filter((session) => session.typeId === typeId)
      return {
        typeId,
        sessionsCount: sessions.length,
        totalMinutes: sessions.reduce((total, session) => total + session.durationMinutes, 0),
      }
    }),
  }
}

function recordForDay(history: DayRecord[], dayKey: string) {
  return history.find((record) => record.dayKey === dayKey) ?? createEmptyDayRecord(dayKey)
}

function displayMinutes(totalSeconds: number) {
  return Math.round(totalSeconds / 6) / 10
}

function totalRhythmMinutes(entries: RhythmEntry[]) {
  return displayMinutes(entries.reduce((sum, entry) => sum + entry.durationSeconds, 0))
}

function nextVisibleTodayHabits(habits: HabitDefinition[]) {
  return habits.filter((habit) => habit.enabled && habit.showOnToday)
}

function mergeBuiltInHabits(existingHabits: HabitDefinition[], migrate = true) {
  const defaults = createDefaultHabits()
  const byId = new Map(existingHabits.map((habit) => [habit.id, habit]))
  for (const habit of defaults) {
    if (!byId.has(habit.id)) {
      byId.set(habit.id, habit)
    }
  }
  return Array.from(byId.values()).map((habit) => migrate ? normalizeHabit(habit) : habit)
}

function mergeBuiltInExercises(existingExercises: ExerciseDefinition[], migrate = true) {
  const defaults = createDefaultExercises()
  const byId = new Map(existingExercises.map((exercise) => [exercise.id, exercise]))
  for (const exercise of defaults) {
    if (!byId.has(exercise.id)) {
      byId.set(exercise.id, exercise)
    }
  }
  return Array.from(byId.values()).map((item) => migrate ? translateBuiltIn(item) : item)
}

function mergeBuiltInRoutines(existingRoutines: StrengthRoutine[], migrate = true) {
  const byId = new Map(existingRoutines.map((routine) => [routine.id, sanitizeRoutine(routine)]))
  for (const routine of STRENGTH_ROUTINES) {
    if (!byId.has(routine.id)) {
      byId.set(routine.id, routine)
    }
  }
  return Array.from(byId.values()).map((item) => migrate ? translateBuiltIn(item) : item)
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const existingIndex = items.findIndex((current) => current.id === item.id)
  if (existingIndex === -1) {
    return [...items, item]
  }
  const next = [...items]
  next[existingIndex] = item
  return next
}

function sanitizeHabit(habit: HabitDefinition): HabitDefinition {
  return {
    ...habit,
    id: habit.id || makeLocalId('habit'),
    name: habit.name.trim() || '未命名习惯',
    category: habit.category.trim() || '其他',
    note: habit.note.trim(),
  }
}

function sanitizeExercise(exercise: ExerciseDefinition): ExerciseDefinition {
  return {
    ...exercise,
    id: exercise.id || makeLocalId('exercise'),
    name: exercise.name.trim() || '未命名动作',
    category: exercise.category.trim() || '其他',
    description: exercise.description.trim(),
    caution: exercise.caution.trim(),
    suggestedVolume: exercise.suggestedVolume.trim(),
    suggestedSets: exercise.suggestedSets.trim(),
    estimatedTime: exercise.estimatedTime.trim(),
  }
}

function sanitizeRoutine(routine: StrengthRoutine): StrengthRoutine {
  return {
    ...routine,
    id: routine.id || makeLocalId('routine'),
    name: routine.name.trim() || '未命名组合',
    exercises: routine.exercises.map((exercise) => sanitizeRoutineExercise(exercise)),
  }
}

function sanitizeRoutineExercise(exercise: RoutineExercise): RoutineExercise {
  return {
    exerciseId: exercise.exerciseId,
    customSets: exercise.customSets?.trim() || undefined,
    customVolume: exercise.customVolume?.trim() || undefined,
    customTime: exercise.customTime?.trim() || undefined,
  }
}

function resolveRoutineExercise(
  exercise: ExerciseDefinition,
  routineExercise: RoutineExercise,
): ResolvedRoutineExercise {
  return {
    ...exercise,
    customSets: routineExercise.customSets,
    customVolume: routineExercise.customVolume,
    customTime: routineExercise.customTime,
    displaySets: routineExercise.customSets ?? exercise.suggestedSets,
    displayVolume: routineExercise.customVolume ?? exercise.suggestedVolume,
    displayTime: routineExercise.customTime ?? exercise.estimatedTime,
  }
}

// A completed timer has measured occurrence times. Record the actual observation/write time
// separately; an older session's recording time is never reconstructed from its start time.
function annotateTimedRecord(state: AppState, kind: 'rhythm' | 'breath', entry: { id: string; startAt: string } | undefined): AppState {
  if (!entry) return state
  const key = kind + '-' + entry.id
  if (state.today.recordDetails?.[key]) return state
  const start = new Date(entry.startAt)
  return { ...state, today: { ...state.today, recordDetails: { ...state.today.recordDetails, [key]: {
    occurredDate: toDayKey(start), occurredTime: String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0'),
    precision: 'exact', assignedDate: state.currentDayKey, recordedAt: new Date().toISOString(),
  } } } }
}
