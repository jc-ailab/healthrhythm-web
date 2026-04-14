export type TabKey = 'rhythm' | 'breath' | 'today' | 'history' | 'strength'

export type RhythmStatus = 'idle' | 'running' | 'paused' | 'completed'
export type BreathStatus = 'idle' | 'running' | 'paused' | 'completed'
export type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'endHold'
export type BreathMode = 'fourSevenEight' | 'fourFourFourFour' | 'sixSixSixSix' | 'custom'
export type HabitId = 'mindfulEating' | 'earlySleep'

export interface RhythmEntry {
  id: string
  startAt: string
  endAt: string
  durationSeconds: number
}

export interface BreathPattern {
  inhale: number
  hold: number
  exhale: number
  endHold: number
}

export interface BreathSessionEntry {
  id: string
  startAt: string
  endAt: string
  totalDurationSeconds: number
  mode: BreathMode
  pattern: BreathPattern
  completedRounds: number
}

export interface RhythmState {
  selectedDurationMinutes: number
  status: RhythmStatus
  isSoundEnabled: boolean
  entriesToday: RhythmEntry[]
  sessionStartAt: string | null
  activeStartAt: string | null
  elapsedSecondsBeforeCurrentRun: number
}

export interface BreathState {
  selectedMode: BreathMode
  customPattern: BreathPattern
  selectedRounds: number
  currentPhase: BreathPhase
  phaseRemainingSeconds: number
  currentRound: number
  completedRounds: number
  status: BreathStatus
  isSoundEnabled: boolean
  entriesToday: BreathSessionEntry[]
  sessionStartAt: string | null
  activeRunStartAt: string | null
  phaseEndAt: string | null
  elapsedSecondsBeforeCurrentRun: number
}

export interface TodayState {
  completionTimesByHabitId: Partial<Record<HabitId, string>>
}

export interface StrengthState {
  completedExerciseIds: string[]
  lastUpdatedAt: string | null
}

export interface DayRecord {
  dayKey: string
  rhythmEntries: RhythmEntry[]
  breathSessions: BreathSessionEntry[]
  strengthCompletedExerciseIds: string[]
  strengthLastUpdatedAt: string | null
  habits: Partial<Record<HabitId, string>>
}

export interface AppState {
  version: 1
  currentDayKey: string
  selectedTab: TabKey
  rhythm: RhythmState
  breath: BreathState
  today: TodayState
  strength: StrengthState
  history: DayRecord[]
}

export interface HabitDefinition {
  id: HabitId
  title: string
  detail: string
}

export interface StrengthExercise {
  id: string
  name: string
  reps: string
  caution: string
}

export interface StrengthRoutine {
  id: string
  title: string
  exercises: StrengthExercise[]
}

export interface HistorySummary {
  totalRhythmMinutes: number
  rhythmDaysCount: number
  strengthDaysCount: number
  mindfulEatingDaysCount: number
  earlySleepDaysCount: number
}

export interface TodayTimelineEvent {
  id: string
  timestamp: string
  title: string
  summary: string
  detail?: string
  kind: 'rhythm' | 'breath' | 'strength' | 'habit'
}

export const RHYTHM_BPM = 180
export const RHYTHM_DURATIONS = [15, 30, 45, 60] as const
export const BREATH_ROUND_OPTIONS = [3, 5, 10] as const
export const RHYTHM_MERGE_THRESHOLD_SECONDS = 3 * 60
export const RHYTHM_MINIMUM_RECORDED_SECONDS = 60

export const HABITS: HabitDefinition[] = [
  {
    id: 'mindfulEating',
    title: 'Mindful eating',
    detail: 'One calm, attentive meal.',
  },
  {
    id: 'earlySleep',
    title: 'Early sleep',
    detail: 'A steady wind-down and earlier bedtime.',
  },
]

export const STRENGTH_ROUTINES: StrengthRoutine[] = [
  {
    id: 'routine-a',
    title: 'Routine A',
    exercises: [
      {
        id: 'routine-a-sit-to-stand',
        name: 'Sit-to-stand from high chair',
        reps: '2 sets of 6 to 8 reps',
        caution: 'Use a higher seat and keep the knees comfortable. Hold the chair if needed.',
      },
      {
        id: 'routine-a-glute-bridge',
        name: 'Glute bridge',
        reps: '2 sets of 8 to 10 reps',
        caution: 'Press through the feet and stop before any back strain.',
      },
      {
        id: 'routine-a-chest-supported-row',
        name: 'Chest-supported dumbbell row',
        reps: '2 sets of 8 reps',
        caution: 'Support the chest so the lower back stays quiet.',
      },
      {
        id: 'routine-a-wall-push-up',
        name: 'Wall push-up',
        reps: '2 sets of 6 to 10 reps',
        caution: 'Keep the body long and choose a wall distance that feels steady.',
      },
      {
        id: 'routine-a-dead-bug',
        name: 'Dead bug',
        reps: '2 sets of 5 reps each side',
        caution: 'Move slowly and keep the ribs down without breath-holding.',
      },
    ],
  },
  {
    id: 'routine-b',
    title: 'Routine B',
    exercises: [
      {
        id: 'routine-b-romanian-deadlift',
        name: 'Dumbbell Romanian deadlift',
        reps: '2 sets of 8 reps',
        caution: 'Soft knees, hinge at the hips, and keep the range modest.',
      },
      {
        id: 'routine-b-side-lying-clam',
        name: 'Side-lying clam',
        reps: '2 sets of 10 reps each side',
        caution: 'Keep the pelvis still and avoid rolling backward.',
      },
      {
        id: 'routine-b-floor-press',
        name: 'Single-arm dumbbell floor press',
        reps: '2 sets of 8 reps each side',
        caution: 'Use a light weight and keep the shoulder comfortable.',
      },
      {
        id: 'routine-b-band-pull-apart',
        name: 'Band pull-apart',
        reps: '2 sets of 8 to 10 reps',
        caution: 'Move with control and keep the shoulders down.',
      },
      {
        id: 'routine-b-bird-dog',
        name: 'Bird-dog',
        reps: '2 sets of 5 reps each side',
        caution: 'Reach long rather than high and keep the trunk steady.',
      },
    ],
  },
]

export const BREATH_MODE_LABELS: Record<BreathMode, string> = {
  fourSevenEight: '4-7-8',
  fourFourFourFour: '4-4-4-4',
  sixSixSixSix: '6-6-6-6',
  custom: 'Custom',
}

export const BREATH_PHASE_LABELS: Record<BreathPhase, string> = {
  inhale: 'Inhale',
  hold: 'Hold',
  exhale: 'Exhale',
  endHold: 'Hold',
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function getBreathPattern(mode: BreathMode, customPattern: BreathPattern): BreathPattern {
  switch (mode) {
    case 'fourSevenEight':
      return { inhale: 4, hold: 7, exhale: 8, endHold: 0 }
    case 'fourFourFourFour':
      return { inhale: 4, hold: 4, exhale: 4, endHold: 4 }
    case 'sixSixSixSix':
      return { inhale: 6, hold: 6, exhale: 6, endHold: 6 }
    case 'custom':
      return clampBreathPattern(customPattern)
  }
}

export function clampBreathPattern(pattern: BreathPattern): BreathPattern {
  return {
    inhale: clamp(pattern.inhale, 1, 12),
    hold: clamp(pattern.hold, 0, 12),
    exhale: clamp(pattern.exhale, 1, 12),
    endHold: clamp(pattern.endHold, 0, 12),
  }
}

export function getActiveBreathPhases(pattern: BreathPattern): BreathPhase[] {
  return (['inhale', 'hold', 'exhale', 'endHold'] as BreathPhase[]).filter(
    (phase) => getBreathPhaseDuration(pattern, phase) > 0,
  )
}

export function getBreathPhaseDuration(pattern: BreathPattern, phase: BreathPhase) {
  switch (phase) {
    case 'inhale':
      return pattern.inhale
    case 'hold':
      return pattern.hold
    case 'exhale':
      return pattern.exhale
    case 'endHold':
      return pattern.endHold
  }
}

export function createEmptyDayRecord(dayKey: string): DayRecord {
  return {
    dayKey,
    rhythmEntries: [],
    breathSessions: [],
    strengthCompletedExerciseIds: [],
    strengthLastUpdatedAt: null,
    habits: {},
  }
}

export function createInitialState(now: Date, selectedTab: TabKey = 'rhythm'): AppState {
  const dayKey = toDayKey(now)

  return {
    version: 1,
    currentDayKey: dayKey,
    selectedTab,
    rhythm: {
      selectedDurationMinutes: 15,
      status: 'idle',
      isSoundEnabled: true,
      entriesToday: [],
      sessionStartAt: null,
      activeStartAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
    },
    breath: {
      selectedMode: 'fourSevenEight',
      customPattern: { inhale: 4, hold: 4, exhale: 6, endHold: 0 },
      selectedRounds: 5,
      currentPhase: 'inhale',
      phaseRemainingSeconds: 4,
      currentRound: 1,
      completedRounds: 0,
      status: 'idle',
      isSoundEnabled: true,
      entriesToday: [],
      sessionStartAt: null,
      activeRunStartAt: null,
      phaseEndAt: null,
      elapsedSecondsBeforeCurrentRun: 0,
    },
    today: {
      completionTimesByHabitId: {},
    },
    strength: {
      completedExerciseIds: [],
      lastUpdatedAt: null,
    },
    history: [],
  }
}

export function toDayKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromDayKey(dayKey: string) {
  const [year, month, day] = dayKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function formatClockTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function formatFullDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatDurationMinutes(totalSeconds: number) {
  if (totalSeconds < 60) {
    return '1 min'
  }

  const minutes = Math.max(1, Math.floor(totalSeconds / 60))
  return `${minutes} min`
}

export function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
