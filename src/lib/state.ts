import { useEffect, useMemo, useRef, useState } from 'react'

import {
  BREATH_MODE_LABELS,
  BREATH_ROUND_OPTIONS,
  BUILT_IN_HABIT_IDS,
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
  type HabitDefinition,
  type HabitId,
  type HistorySummary,
  type RoutineExercise,
  type StrengthRoutine,
  type ResolvedRoutineExercise,
  type ResolvedStrengthRoutine,
  type RhythmEntry,
  type TabKey,
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
  makeLocalId,
  toDayKey,
} from './domain'
import { BreathCuePlayer, WebMetronome } from './webAudio'

const STORAGE_KEY = 'health-rhythm-web-v2'

type LegacyAppState = Omit<AppState, 'version' | 'library' | 'selectedTab' | 'strength'> & {
  version?: 1 | 2
  selectedTab?: Exclude<TabKey, 'library'>
  strength: {
    completedExerciseIds: string[]
    lastUpdatedAt: string | null
    routines?: StrengthRoutine[]
  }
}

interface HistoryDailySummary {
  rhythmTotalMinutes: number
  rhythmEntriesCount: number
  breathSessionsCount: number
  breathRoundsCount: number
  strengthSummary: string
  mindfulEatingCompleted: boolean
  earlySleepCompleted: boolean
}

interface AppActions {
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
  saveHabit: (habit: HabitDefinition) => void
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
  selectedHistoryDayKey: string
  setSelectedHistoryDayKey: (dayKey: string) => void
}

export function useHealthRhythmApp(): HealthRhythmViewModel {
  const [state, setState] = useState<AppState>(() => loadState())
  const [selectedHistoryDayKey, setSelectedHistoryDayKey] = useState(() => state.currentDayKey)
  const metronomeRef = useRef(new WebMetronome())
  const breathCuePlayerRef = useRef(new BreathCuePlayer())
  const previousBreathStatusRef = useRef(state.breath.status)
  const previousBreathPhaseRef = useRef(state.breath.currentPhase)

  useEffect(() => {
    saveState(state)
    setSelectedHistoryDayKey((current) => (current > state.currentDayKey ? state.currentDayKey : current))
  }, [state])

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
    if (state.rhythm.status !== 'running' && state.breath.status !== 'running') {
      return
    }

    const intervalId = window.setInterval(() => {
      setState((current) => refreshAppState(current, new Date()))
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [state.rhythm.status, state.breath.status])

  useEffect(() => {
    if (state.rhythm.status === 'running' && state.rhythm.isSoundEnabled) {
      void metronomeRef.current.start(RHYTHM_BPM)
    } else {
      metronomeRef.current.stop()
    }
  }, [state.rhythm.isSoundEnabled, state.rhythm.status])

  useEffect(() => {
    const cuePlayer = breathCuePlayerRef.current
    const previousStatus = previousBreathStatusRef.current
    const previousPhase = previousBreathPhaseRef.current

    if (!state.breath.isSoundEnabled || state.breath.status !== 'running') {
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
  }, [state.breath.currentPhase, state.breath.isSoundEnabled, state.breath.status])

  const actions: AppActions = {
    selectTab(tab) {
      setState((current) => ({ ...current, selectedTab: tab }))
    },
    selectRhythmDuration(minutes) {
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
      void metronomeRef.current.unlock()
      setState((current) => toggleRhythmState(ensureCurrentDay(current, new Date()), new Date()))
    },
    endRhythm() {
      setState((current) => endRhythmState(ensureCurrentDay(current, new Date()), new Date()))
    },
    setRhythmSoundEnabled(isEnabled) {
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
      void breathCuePlayerRef.current.unlock()
      setState((current) => toggleBreathState(ensureCurrentDay(current, new Date()), new Date()))
    },
    endBreath() {
      setState((current) => endBreathState(ensureCurrentDay(current, new Date()), new Date()))
    },
    setBreathSoundEnabled(isEnabled) {
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
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        const completionTimesByHabitId = { ...next.today.completionTimesByHabitId }

        if (completionTimesByHabitId[habitId]) {
          delete completionTimesByHabitId[habitId]
        } else {
          completionTimesByHabitId[habitId] = new Date().toISOString()
        }

        return syncHistory({
          ...next,
          today: {
            completionTimesByHabitId,
          },
        })
      })
    },
    toggleStrengthExercise(exerciseId) {
      setState((current) => {
        const next = ensureCurrentDay(current, new Date())
        const completedExerciseIds = new Set(next.strength.completedExerciseIds)

        if (completedExerciseIds.has(exerciseId)) {
          completedExerciseIds.delete(exerciseId)
        } else {
          completedExerciseIds.add(exerciseId)
        }

        return syncHistory({
          ...next,
          strength: {
            completedExerciseIds: Array.from(completedExerciseIds),
            lastUpdatedAt: new Date().toISOString(),
          },
        })
      })
    },
    saveHabit(habit) {
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
                    exercises: [...routine.exercises, { exerciseId }],
                  }
                : routine,
            ),
          },
        })
      })
    },
    removeRoutineExercise(routineId, index) {
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
    const historyWeekSummary = buildHistorySummary(state.history, currentIntervalDayKeys('week', new Date()))
    const historyMonthSummary = buildHistorySummary(
      state.history,
      currentIntervalDayKeys('month', new Date()),
    )

    return {
      visibleTodayHabits,
      strengthRoutines,
      rhythmRemainingSeconds: getRhythmRemainingSeconds(state.rhythm),
      rhythmTotalMinutesToday: state.rhythm.entriesToday.reduce(
        (total, entry) => total + displayMinutes(entry.durationSeconds),
        0,
      ),
      breathTotalRoundsToday: state.breath.entriesToday.reduce(
        (total, entry) => total + entry.completedRounds,
        0,
      ),
      breathTotalSessionsToday: state.breath.entriesToday.length,
      strengthCompletedCountToday: state.strength.completedExerciseIds.length,
      strengthSummaryToday: buildStrengthSummary(state.strength.completedExerciseIds, strengthRoutines),
      todayTimeline: buildTodayTimeline(state, visibleTodayHabits, strengthRoutines),
      historyWeekSummary,
      historyMonthSummary,
    }
  }, [state])

  return {
    state,
    selectedHistoryDayKey,
    setSelectedHistoryDayKey,
    visibleTodayHabits: derived.visibleTodayHabits,
    habitLibrary: state.library.habits,
    exerciseLibrary: state.library.exercises,
    strengthRoutineLibrary: state.strength.routines,
    strengthRoutines: derived.strengthRoutines,
    historyDailySummary: (dayKey) =>
      buildDailyHistorySummary(recordForDay(state.history, dayKey), derived.strengthRoutines),
    historyWeekSummary: derived.historyWeekSummary,
    historyMonthSummary: derived.historyMonthSummary,
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

function loadState(): AppState {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('health-rhythm-web-v1')
    if (!rawValue) {
      return syncHistory(createInitialState(new Date()))
    }

    const parsed = JSON.parse(rawValue) as AppState | LegacyAppState
    const migrated = migrateState(parsed, new Date())
    return syncHistory(ensureCurrentDay(migrated, new Date()))
  } catch {
    return syncHistory(createInitialState(new Date()))
  }
}

function migrateState(rawState: AppState | LegacyAppState, now: Date): AppState {
  if ((rawState as AppState).version === 3 && (rawState as AppState).library) {
    const state = rawState as AppState
    return {
      ...state,
      strength: {
        ...state.strength,
        routines: mergeBuiltInRoutines(state.strength.routines),
      },
      library: {
        habits: mergeBuiltInHabits(state.library.habits),
        exercises: mergeBuiltInExercises(state.library.exercises),
      },
    }
  }

  const legacy = rawState as LegacyAppState
  return syncHistory({
    version: 2,
    currentDayKey: legacy.currentDayKey ?? toDayKey(now),
    selectedTab: legacy.selectedTab ?? 'rhythm',
    rhythm: legacy.rhythm,
    breath: legacy.breath,
    today: legacy.today,
    strength: {
      completedExerciseIds: legacy.strength.completedExerciseIds,
      lastUpdatedAt: legacy.strength.lastUpdatedAt,
      routines: mergeBuiltInRoutines(legacy.strength.routines ?? STRENGTH_ROUTINES),
    },
    library: {
      habits: createDefaultHabits(),
      exercises: createDefaultExercises(),
    },
    history: legacy.history ?? [],
  })
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function ensureCurrentDay(state: AppState, now: Date): AppState {
  const currentDayKey = toDayKey(now)
  if (state.currentDayKey === currentDayKey) {
    return syncHistory(refreshRunningState(state, now))
  }

  const refreshed = syncHistory(refreshRunningState(state, now))
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
    },
    strength: {
      ...refreshed.strength,
      completedExerciseIds: [],
      lastUpdatedAt: null,
    },
  })
}

function refreshAppState(state: AppState, now: Date) {
  return ensureCurrentDay(state, now)
}

function refreshRunningState(state: AppState, now: Date): AppState {
  let next = state
  if (state.rhythm.status === 'running') {
    next = refreshRhythmState(next, now)
  }
  if (next.breath.status === 'running') {
    next = refreshBreathState(next, now)
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
    return state
  }

  return finalizeRhythmState(state, now, targetSeconds, true)
}

function toggleRhythmState(state: AppState, now: Date): AppState {
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
        },
      })
  }
}

function endRhythmState(state: AppState, now: Date): AppState {
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

  return syncHistory({
    ...state,
    rhythm: {
      ...state.rhythm,
      status: shouldRecord || hitPresetEnd ? 'completed' : 'idle',
      entriesToday,
      sessionStartAt: null,
      activeStartAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
    },
  })
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

function toggleBreathState(state: AppState, now: Date): AppState {
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

  return syncHistory({
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
  })
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

  const history = [...state.history.filter((record) => record.dayKey !== state.currentDayKey), currentRecord].sort((left, right) =>
    left.dayKey < right.dayKey ? 1 : -1,
  )

  return {
    ...state,
    history,
  }
}

function resolveStrengthRoutines(
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
        name: 'Missing exercise',
        category: 'Unavailable',
        description: 'This built-in exercise entry is not currently available in the library.',
        caution: 'Re-enable or restore this exercise in the library.',
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

function buildTodayTimeline(
  state: AppState,
  visibleTodayHabits: HabitDefinition[],
  strengthRoutines: ResolvedStrengthRoutine[],
): TodayTimelineEvent[] {
  const habitById = new Map(state.library.habits.map((habit) => [habit.id, habit]))
  const events: TodayTimelineEvent[] = [
    ...state.rhythm.entriesToday.map((entry) => ({
      id: `rhythm-${entry.id}`,
      timestamp: entry.startAt,
      title: 'Rhythm',
      summary: `${displayMinutes(entry.durationSeconds)} min`,
      detail: `Started at ${new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(entry.startAt))}. Logged ${formatDurationMinutes(entry.durationSeconds)}.`,
      kind: 'rhythm' as const,
    })),
    ...state.breath.entriesToday.map((entry) => ({
      id: `breath-${entry.id}`,
      timestamp: entry.startAt,
      title: 'Breath',
      summary: `${entry.completedRounds} round${entry.completedRounds === 1 ? '' : 's'}`,
      detail: `${BREATH_MODE_LABELS[entry.mode]} pattern ${entry.pattern.inhale}-${entry.pattern.hold}-${entry.pattern.exhale}-${entry.pattern.endHold} · ${formatDurationMinutes(entry.totalDurationSeconds)}.`,
      kind: 'breath' as const,
    })),
    ...(state.strength.completedExerciseIds.length > 0 && state.strength.lastUpdatedAt
      ? [
          {
            id: 'strength-today',
            timestamp: state.strength.lastUpdatedAt,
            title: 'Strength',
            summary: buildStrengthSummary(state.strength.completedExerciseIds, strengthRoutines),
            detail: buildStrengthDetail(state.strength.completedExerciseIds, strengthRoutines),
            kind: 'strength' as const,
          },
        ]
      : []),
    ...visibleTodayHabits.flatMap((habit) => {
      const completionTime = state.today.completionTimesByHabitId[habit.id]
      if (!completionTime) {
        return []
      }
      return [
        {
          id: `habit-${habit.id}`,
          timestamp: completionTime,
          title: habit.name,
          summary: 'Completed',
          detail: habit.note,
          kind: 'habit' as const,
        },
      ]
    }),
    ...Object.entries(state.today.completionTimesByHabitId)
      .filter(([habitId]) => !visibleTodayHabits.some((habit) => habit.id === habitId))
      .flatMap(([habitId, completionTime]) => {
        if (!completionTime) {
          return []
        }
        const habit = habitById.get(habitId)
        if (!habit || !habit.enabled) {
          return []
        }
        return [
          {
            id: `habit-${habit.id}`,
            timestamp: completionTime,
            title: habit.name,
            summary: 'Completed',
            detail: habit.note,
            kind: 'habit' as const,
          },
        ]
      }),
  ]

  return events.sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime()
    const rightTime = new Date(right.timestamp).getTime()
    if (leftTime === rightTime) {
      return left.id.localeCompare(right.id)
    }
    return leftTime - rightTime
  })
}

function buildStrengthSummary(completedExerciseIds: string[], routines: ResolvedStrengthRoutine[]) {
  if (completedExerciseIds.length === 0) {
    return 'Not done'
  }

  const matchingRoutine = routines.find((routine) => {
    const routineCount = routine.exercises.filter((exercise) => completedExerciseIds.includes(exercise.id)).length
    return routineCount > 0 && routineCount === completedExerciseIds.length
  })

  if (matchingRoutine) {
    return `${completedExerciseIds.length} of ${matchingRoutine.exercises.length}`
  }

  return `${completedExerciseIds.length} exercises`
}

function buildStrengthDetail(completedExerciseIds: string[], routines: ResolvedStrengthRoutine[]) {
  return routines
    .flatMap((routine) => routine.exercises)
    .filter((exercise) => completedExerciseIds.includes(exercise.id))
    .map((exercise) => exercise.name)
    .join(', ')
}

function buildDailyHistorySummary(record: DayRecord, routines: ResolvedStrengthRoutine[]): HistoryDailySummary {
  return {
    rhythmTotalMinutes: record.rhythmEntries.reduce(
      (total, entry) => total + displayMinutes(entry.durationSeconds),
      0,
    ),
    rhythmEntriesCount: record.rhythmEntries.length,
    breathSessionsCount: record.breathSessions.length,
    breathRoundsCount: record.breathSessions.reduce((total, session) => total + session.completedRounds, 0),
    strengthSummary: buildStrengthSummary(record.strengthCompletedExerciseIds, routines),
    mindfulEatingCompleted: Boolean(record.habits[BUILT_IN_HABIT_IDS.mindfulEating]),
    earlySleepCompleted: Boolean(record.habits[BUILT_IN_HABIT_IDS.earlySleep]),
  }
}

function currentIntervalDayKeys(kind: 'week' | 'month', now: Date) {
  const keys: string[] = []
  if (kind === 'week') {
    const current = new Date(now)
    const day = current.getDay()
    const diffToMonday = day === 0 ? -6 : 1 - day
    current.setHours(12, 0, 0, 0)
    current.setDate(current.getDate() + diffToMonday)
    for (let index = 0; index < 7; index += 1) {
      keys.push(toDayKey(current))
      current.setDate(current.getDate() + 1)
    }
    return keys
  }

  const current = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0)
  while (current.getMonth() === now.getMonth()) {
    keys.push(toDayKey(current))
    current.setDate(current.getDate() + 1)
  }
  return keys
}

function buildHistorySummary(history: DayRecord[], dayKeys: string[]): HistorySummary {
  const matchingRecords = history.filter((record) => dayKeys.includes(record.dayKey))

  return {
    totalRhythmMinutes: matchingRecords.reduce(
      (total, record) =>
        total +
        record.rhythmEntries.reduce((recordTotal, entry) => recordTotal + displayMinutes(entry.durationSeconds), 0),
      0,
    ),
    rhythmDaysCount: matchingRecords.filter((record) => record.rhythmEntries.length > 0).length,
    strengthDaysCount: matchingRecords.filter((record) => record.strengthCompletedExerciseIds.length > 0).length,
    mindfulEatingDaysCount: matchingRecords.filter((record) => Boolean(record.habits[BUILT_IN_HABIT_IDS.mindfulEating])).length,
    earlySleepDaysCount: matchingRecords.filter((record) => Boolean(record.habits[BUILT_IN_HABIT_IDS.earlySleep])).length,
  }
}

function recordForDay(history: DayRecord[], dayKey: string) {
  return history.find((record) => record.dayKey === dayKey) ?? createEmptyDayRecord(dayKey)
}

function displayMinutes(totalSeconds: number) {
  return Math.max(1, Math.floor(totalSeconds / 60))
}

function nextVisibleTodayHabits(habits: HabitDefinition[]) {
  return habits.filter((habit) => habit.enabled && habit.showOnToday)
}

function mergeBuiltInHabits(existingHabits: HabitDefinition[]) {
  const defaults = createDefaultHabits()
  const byId = new Map(existingHabits.map((habit) => [habit.id, habit]))
  for (const habit of defaults) {
    if (!byId.has(habit.id)) {
      byId.set(habit.id, habit)
    }
  }
  return Array.from(byId.values())
}

function mergeBuiltInExercises(existingExercises: ExerciseDefinition[]) {
  const defaults = createDefaultExercises()
  const byId = new Map(existingExercises.map((exercise) => [exercise.id, exercise]))
  for (const exercise of defaults) {
    if (!byId.has(exercise.id)) {
      byId.set(exercise.id, exercise)
    }
  }
  return Array.from(byId.values())
}

function mergeBuiltInRoutines(existingRoutines: StrengthRoutine[]) {
  const byId = new Map(existingRoutines.map((routine) => [routine.id, sanitizeRoutine(routine)]))
  for (const routine of STRENGTH_ROUTINES) {
    if (!byId.has(routine.id)) {
      byId.set(routine.id, routine)
    }
  }
  return Array.from(byId.values())
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
    name: habit.name.trim() || 'Untitled habit',
    category: habit.category.trim() || 'General',
    note: habit.note.trim(),
  }
}

function sanitizeExercise(exercise: ExerciseDefinition): ExerciseDefinition {
  return {
    ...exercise,
    id: exercise.id || makeLocalId('exercise'),
    name: exercise.name.trim() || 'Untitled exercise',
    category: exercise.category.trim() || 'General',
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
    name: routine.name.trim() || 'Untitled routine',
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
