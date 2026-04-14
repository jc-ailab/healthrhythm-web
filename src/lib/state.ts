import { useEffect, useMemo, useRef, useState } from 'react'

import {
  BREATH_MODE_LABELS,
  BREATH_ROUND_OPTIONS,
  HABITS,
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
  type HabitId,
  type HistorySummary,
  type RhythmEntry,
  type StrengthRoutine,
  type TabKey,
  type TodayTimelineEvent,
  clampBreathPattern,
  createEmptyDayRecord,
  createInitialState,
  formatDurationMinutes,
  getActiveBreathPhases,
  getBreathPattern,
  getBreathPhaseDuration,
  toDayKey,
} from './domain'
import { BreathCuePlayer, WebMetronome } from './webAudio'

const STORAGE_KEY = 'health-rhythm-web-v1'

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
}

export interface HealthRhythmViewModel extends AppActions {
  state: AppState
  strengthRoutines: StrengthRoutine[]
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
    setSelectedHistoryDayKey((current) => {
      if (current > state.currentDayKey) {
        return state.currentDayKey
      }
      return current
    })
  }, [state])

  useEffect(() => {
    const handleVisibilityRefresh = () => {
      setState((current) => refreshAppState(current, new Date()))
    }

    window.addEventListener('focus', handleVisibilityRefresh)
    document.addEventListener('visibilitychange', handleVisibilityRefresh)

    return () => {
      window.removeEventListener('focus', handleVisibilityRefresh)
      document.removeEventListener('visibilitychange', handleVisibilityRefresh)
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
    const metronome = metronomeRef.current

    if (state.rhythm.status === 'running' && state.rhythm.isSoundEnabled) {
      void metronome.start(RHYTHM_BPM)
    } else {
      metronome.stop()
    }

    return () => {
      if (state.rhythm.status !== 'running') {
        metronome.stop()
      }
    }
  }, [state.rhythm.status, state.rhythm.isSoundEnabled])

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

        if (next.rhythm.status !== 'idle' && next.rhythm.status !== 'completed') {
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
        if (next.breath.status !== 'idle' && next.breath.status !== 'completed') {
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
        if (next.breath.status !== 'idle' && next.breath.status !== 'completed') {
          return next
        }

        const pattern = { ...next.breath.customPattern }
        pattern[phase === 'endHold' ? 'endHold' : phase] = value

        return syncHistory({
          ...next,
          breath: freshBreathState({
            ...next.breath,
            selectedMode: next.breath.selectedMode,
            customPattern: clampBreathPattern(pattern),
            selectedRounds: next.breath.selectedRounds,
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

        if (next.breath.status !== 'idle' && next.breath.status !== 'completed') {
          return next
        }

        return syncHistory({
          ...next,
          breath: freshBreathState({
            ...next.breath,
            selectedMode: next.breath.selectedMode,
            customPattern: next.breath.customPattern,
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
        const completionTimes = { ...next.today.completionTimesByHabitId }

        if (completionTimes[habitId]) {
          delete completionTimes[habitId]
        } else {
          completionTimes[habitId] = new Date().toISOString()
        }

        return syncHistory({
          ...next,
          today: {
            completionTimesByHabitId: completionTimes,
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
  }

  const derived = useMemo(() => {
    const historyWeekSummary = buildHistorySummary(
      state.history,
      currentIntervalDayKeys('week', new Date()),
    )
    const historyMonthSummary = buildHistorySummary(
      state.history,
      currentIntervalDayKeys('month', new Date()),
    )

    return {
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
      strengthSummaryToday: buildStrengthSummary(state.strength.completedExerciseIds),
      todayTimeline: buildTodayTimeline(state),
      historyWeekSummary,
      historyMonthSummary,
    }
  }, [state])

  return {
    state,
    selectedHistoryDayKey,
    setSelectedHistoryDayKey,
    strengthRoutines: STRENGTH_ROUTINES,
    historyDailySummary: (dayKey) => buildDailyHistorySummary(recordForDay(state.history, dayKey)),
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
    const rawValue = localStorage.getItem(STORAGE_KEY)
    if (!rawValue) {
      return syncHistory(createInitialState(new Date()))
    }

    const parsed = JSON.parse(rawValue) as AppState
    return syncHistory(ensureCurrentDay(parsed, new Date()))
  } catch {
    return syncHistory(createInitialState(new Date()))
  }
}

function saveState(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function ensureCurrentDay(state: AppState, now: Date): AppState {
  const currentDayKey = toDayKey(now)
  if (state.currentDayKey === currentDayKey) {
    return syncHistory(refreshRunningState(state, now))
  }

  const refreshedCurrentState = syncHistory(refreshRunningState(state, now))
  const nextState: AppState = {
    ...refreshedCurrentState,
    currentDayKey,
    rhythm: {
      ...refreshedCurrentState.rhythm,
      status: 'idle',
      entriesToday: [],
      sessionStartAt: null,
      activeStartAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
    },
    breath: freshBreathState({
      ...refreshedCurrentState.breath,
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
      completedExerciseIds: [],
      lastUpdatedAt: null,
    },
  }

  return syncHistory(nextState)
}

function refreshAppState(state: AppState, now: Date) {
  return ensureCurrentDay(state, now)
}

function refreshRunningState(state: AppState, now: Date): AppState {
  let nextState = state

  if (state.rhythm.status === 'running') {
    nextState = refreshRhythmState(nextState, now)
  }

  if (nextState.breath.status === 'running') {
    nextState = refreshBreathState(nextState, now)
  }

  return nextState
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
  if (state.rhythm.status !== 'running' && state.rhythm.status !== 'paused') {
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

  const elapsedSeconds = currentRhythmElapsedSeconds(state.rhythm, now)
  return finalizeRhythmState(state, now, elapsedSeconds, false)
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

  const mergedEntry: RhythmEntry = {
    id: lastEntry.id,
    startAt: lastEntry.startAt,
    endAt: newEntry.endAt,
    durationSeconds: lastEntry.durationSeconds + newEntry.durationSeconds,
  }

  return [...entries.slice(0, -1), mergedEntry]
}

function currentRhythmElapsedSeconds(rhythm: AppState['rhythm'], now: Date) {
  if (rhythm.status !== 'running' || !rhythm.activeStartAt) {
    return rhythm.elapsedSecondsBeforeCurrentRun
  }

  const runningSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(rhythm.activeStartAt).getTime()) / 1000),
  )
  return rhythm.elapsedSecondsBeforeCurrentRun + runningSeconds
}

function getRhythmRemainingSeconds(rhythm: AppState['rhythm']) {
  const elapsedSeconds =
    rhythm.status === 'completed'
      ? rhythm.selectedDurationMinutes * 60
      : currentRhythmElapsedSeconds(rhythm, new Date())

  return Math.max(0, rhythm.selectedDurationMinutes * 60 - elapsedSeconds)
}

function freshBreathState(breath: AppState['breath']): AppState['breath'] {
  const pattern = getBreathPattern(breath.selectedMode, breath.customPattern)
  const firstPhase = getActiveBreathPhases(pattern)[0] ?? 'inhale'

  return {
    ...breath,
    customPattern: clampBreathPattern(breath.customPattern),
    currentPhase: firstPhase,
    phaseRemainingSeconds: getBreathPhaseDuration(pattern, firstPhase),
    currentRound: 1,
    completedRounds: breath.status === 'completed' ? breath.completedRounds : 0,
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

      return syncHistory({
        ...state,
        breath: {
          ...state.breath,
          status: 'running',
          currentPhase: firstPhase,
          phaseRemainingSeconds: getBreathPhaseDuration(pattern, firstPhase),
          currentRound: 1,
          completedRounds: 0,
          sessionStartAt: now.toISOString(),
          activeRunStartAt: now.toISOString(),
          phaseEndAt: new Date(now.getTime() + getBreathPhaseDuration(pattern, firstPhase) * 1000).toISOString(),
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
  if (state.breath.status !== 'running' && state.breath.status !== 'paused') {
    return syncHistory({
      ...state,
      breath: freshBreathState({
        ...state.breath,
        status: 'idle',
        entriesToday: state.breath.entriesToday,
        isSoundEnabled: state.breath.isSoundEnabled,
        selectedMode: state.breath.selectedMode,
        customPattern: state.breath.customPattern,
        selectedRounds: state.breath.selectedRounds,
      }),
    })
  }

  return finalizeBreathState(state, now)
}

function refreshBreathState(state: AppState, now: Date): AppState {
  if (state.breath.status !== 'running' || !state.breath.phaseEndAt) {
    return state
  }

  let nextState = state
  let loopGuard = 0

  while (
    nextState.breath.status === 'running' &&
    nextState.breath.phaseEndAt &&
    new Date(nextState.breath.phaseEndAt).getTime() <= now.getTime() &&
    loopGuard < 50
  ) {
    nextState = advanceBreathPhase(nextState, new Date(nextState.breath.phaseEndAt))
    loopGuard += 1
  }

  if (nextState.breath.status !== 'running' || !nextState.breath.phaseEndAt) {
    return nextState
  }

  const remainingSeconds = getBreathPhaseRemainingSeconds(nextState.breath, now)
  if (remainingSeconds === nextState.breath.phaseRemainingSeconds) {
    return nextState
  }

  return syncHistory({
    ...nextState,
    breath: {
      ...nextState.breath,
      phaseRemainingSeconds: remainingSeconds,
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
    return syncHistory({
      ...state,
      breath: {
        ...state.breath,
        completedRounds,
        currentRound: completedRounds + 1,
        currentPhase: nextPhase,
        phaseRemainingSeconds: getBreathPhaseDuration(pattern, nextPhase),
        phaseEndAt: new Date(
          boundary.getTime() + getBreathPhaseDuration(pattern, nextPhase) * 1000,
        ).toISOString(),
      },
    })
  }

  const nextPhase = phases[currentIndex + 1]
  return syncHistory({
    ...state,
    breath: {
      ...state.breath,
      currentPhase: nextPhase,
      phaseRemainingSeconds: getBreathPhaseDuration(pattern, nextPhase),
      phaseEndAt: new Date(
        boundary.getTime() + getBreathPhaseDuration(pattern, nextPhase) * 1000,
      ).toISOString(),
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
        selectedMode: state.breath.selectedMode,
        customPattern: state.breath.customPattern,
        selectedRounds: state.breath.selectedRounds,
        isSoundEnabled: state.breath.isSoundEnabled,
      }),
      entriesToday,
      status: shouldRecord ? 'completed' : 'idle',
      completedRounds: shouldRecord ? state.breath.completedRounds : 0,
    },
  })
}

function currentBreathElapsedSeconds(breath: AppState['breath'], now: Date) {
  if (breath.status !== 'running' || !breath.activeRunStartAt) {
    return breath.elapsedSecondsBeforeCurrentRun
  }

  const runningSeconds = Math.max(
    0,
    Math.floor((now.getTime() - new Date(breath.activeRunStartAt).getTime()) / 1000),
  )
  return breath.elapsedSecondsBeforeCurrentRun + runningSeconds
}

function getBreathPhaseRemainingSeconds(breath: AppState['breath'], now: Date) {
  if (!breath.phaseEndAt) {
    return breath.phaseRemainingSeconds
  }

  return Math.max(1, Math.ceil((new Date(breath.phaseEndAt).getTime() - now.getTime()) / 1000))
}

function syncHistory(state: AppState): AppState {
  const currentRecord = createEmptyDayRecord(state.currentDayKey)
  currentRecord.rhythmEntries = state.rhythm.entriesToday
  currentRecord.breathSessions = state.breath.entriesToday
  currentRecord.strengthCompletedExerciseIds = state.strength.completedExerciseIds
  currentRecord.strengthLastUpdatedAt = state.strength.lastUpdatedAt
  currentRecord.habits = state.today.completionTimesByHabitId

  const otherRecords = state.history.filter((record) => record.dayKey !== state.currentDayKey)
  const history = [...otherRecords, currentRecord].sort((left, right) =>
    left.dayKey < right.dayKey ? 1 : -1,
  )

  return {
    ...state,
    history,
  }
}

function buildTodayTimeline(state: AppState): TodayTimelineEvent[] {
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
            summary: buildStrengthSummary(state.strength.completedExerciseIds),
            detail: buildStrengthDetail(state.strength.completedExerciseIds),
            kind: 'strength' as const,
          },
        ]
      : []),
    ...HABITS.flatMap((habit) => {
      const completionTime = state.today.completionTimesByHabitId[habit.id]
      if (!completionTime) {
        return []
      }

      return [
        {
          id: `habit-${habit.id}`,
          timestamp: completionTime,
          title: habit.title,
          summary: 'Completed',
          detail: habit.detail,
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

function buildStrengthSummary(completedExerciseIds: string[]) {
  if (completedExerciseIds.length === 0) {
    return 'Not done'
  }

  const routinesWithProgress = STRENGTH_ROUTINES.filter((routine) =>
    routine.exercises.some((exercise) => completedExerciseIds.includes(exercise.id)),
  )

  if (routinesWithProgress.length === 1) {
    const routine = routinesWithProgress[0]
    const completedCount = routine.exercises.filter((exercise) =>
      completedExerciseIds.includes(exercise.id),
    ).length
    return `${completedCount} of ${routine.exercises.length}`
  }

  return `${completedExerciseIds.length} exercises`
}

function buildStrengthDetail(completedExerciseIds: string[]) {
  const names = STRENGTH_ROUTINES.flatMap((routine) => routine.exercises)
    .filter((exercise) => completedExerciseIds.includes(exercise.id))
    .map((exercise) => exercise.name)

  return names.join(', ')
}

function buildDailyHistorySummary(record: DayRecord): HistoryDailySummary {
  const breathRoundsCount = record.breathSessions.reduce(
    (total, session) => total + session.completedRounds,
    0,
  )

  return {
    rhythmTotalMinutes: record.rhythmEntries.reduce(
      (total, entry) => total + displayMinutes(entry.durationSeconds),
      0,
    ),
    rhythmEntriesCount: record.rhythmEntries.length,
    breathSessionsCount: record.breathSessions.length,
    breathRoundsCount,
    strengthSummary: buildStrengthSummary(record.strengthCompletedExerciseIds),
    mindfulEatingCompleted: Boolean(record.habits.mindfulEating),
    earlySleepCompleted: Boolean(record.habits.earlySleep),
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
    strengthDaysCount: matchingRecords.filter(
      (record) => record.strengthCompletedExerciseIds.length > 0,
    ).length,
    mindfulEatingDaysCount: matchingRecords.filter((record) => Boolean(record.habits.mindfulEating)).length,
    earlySleepDaysCount: matchingRecords.filter((record) => Boolean(record.habits.earlySleep)).length,
  }
}

function recordForDay(history: DayRecord[], dayKey: string) {
  return history.find((record) => record.dayKey === dayKey) ?? createEmptyDayRecord(dayKey)
}

function displayMinutes(totalSeconds: number) {
  return Math.max(1, Math.floor(totalSeconds / 60))
}
