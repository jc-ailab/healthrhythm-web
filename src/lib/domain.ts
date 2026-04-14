export type TabKey = 'rhythm' | 'breath' | 'today' | 'history' | 'strength' | 'library'

export type RhythmStatus = 'idle' | 'running' | 'paused' | 'completed'
export type BreathStatus = 'idle' | 'running' | 'paused' | 'completed'
export type BreathPhase = 'inhale' | 'hold' | 'exhale' | 'endHold'
export type BreathMode = 'fourSevenEight' | 'fourFourFourFour' | 'sixSixSixSix' | 'custom'
export type HabitId = string

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
  routines: StrengthRoutine[]
}

export interface DayRecord {
  dayKey: string
  rhythmEntries: RhythmEntry[]
  breathSessions: BreathSessionEntry[]
  strengthCompletedExerciseIds: string[]
  strengthLastUpdatedAt: string | null
  habits: Partial<Record<HabitId, string>>
}

export interface HabitDefinition {
  id: HabitId
  name: string
  category: string
  note: string
  enabled: boolean
  showOnToday: boolean
  isBuiltIn?: boolean
}

export interface ExerciseDefinition {
  id: string
  name: string
  category: string
  description: string
  caution: string
  suggestedVolume: string
  suggestedSets: string
  estimatedTime: string
  enabled: boolean
  isBuiltIn?: boolean
}

export interface LibraryState {
  habits: HabitDefinition[]
  exercises: ExerciseDefinition[]
}

export interface AppState {
  version: 3
  currentDayKey: string
  selectedTab: TabKey
  rhythm: RhythmState
  breath: BreathState
  today: TodayState
  strength: StrengthState
  library: LibraryState
  history: DayRecord[]
}

export interface StrengthRoutine {
  id: string
  name: string
  enabled: boolean
  exercises: RoutineExercise[]
  isBuiltIn?: boolean
}

export interface RoutineExercise {
  exerciseId: string
  customSets?: string
  customVolume?: string
  customTime?: string
}

export interface ResolvedStrengthExercise {
  id: string
  name: string
  category: string
  description: string
  caution: string
  suggestedVolume: string
  suggestedSets: string
  estimatedTime: string
  enabled: boolean
}

export interface ResolvedStrengthRoutine {
  id: string
  name: string
  enabled: boolean
  isBuiltIn?: boolean
  exercises: ResolvedRoutineExercise[]
}

export interface ResolvedRoutineExercise extends ResolvedStrengthExercise {
  customSets?: string
  customVolume?: string
  customTime?: string
  displaySets: string
  displayVolume: string
  displayTime: string
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

export const BUILT_IN_HABIT_IDS = {
  mindfulEating: 'mindfulEating',
  earlySleep: 'earlySleep',
} as const

export function createDefaultHabits(): HabitDefinition[] {
  return [
    {
      id: BUILT_IN_HABIT_IDS.mindfulEating,
      name: 'Mindful eating',
      category: 'Meal rhythm',
      note: 'One calm, attentive meal.',
      enabled: true,
      showOnToday: true,
      isBuiltIn: true,
    },
    {
      id: BUILT_IN_HABIT_IDS.earlySleep,
      name: 'Early sleep',
      category: 'Rest',
      note: 'A steady wind-down and earlier bedtime.',
      enabled: true,
      showOnToday: true,
      isBuiltIn: true,
    },
    {
      id: 'foot-soak',
      name: 'Foot soak',
      category: 'Evening care',
      note: 'A short warm soak to settle at the end of the day.',
      enabled: true,
      showOnToday: false,
      isBuiltIn: true,
    },
    {
      id: 'moxibustion',
      name: 'Moxibustion',
      category: 'Care',
      note: 'Gentle self-care practice when it feels appropriate.',
      enabled: true,
      showOnToday: false,
      isBuiltIn: true,
    },
    {
      id: 'walking',
      name: 'Walking',
      category: 'Movement',
      note: 'A light everyday walk outside or indoors.',
      enabled: true,
      showOnToday: false,
      isBuiltIn: true,
    },
    {
      id: 'ginger-drink',
      name: 'Ginger drink',
      category: 'Kitchen',
      note: 'A simple warm drink when it suits the day.',
      enabled: true,
      showOnToday: false,
      isBuiltIn: true,
    },
  ]
}

export function createDefaultExercises(): ExerciseDefinition[] {
  return [
    {
      id: 'routine-a-sit-to-stand',
      name: 'Sit-to-stand from high chair',
      category: 'Lower body',
      description: 'A supported standing pattern from a higher seat.',
      caution: 'Use a higher seat and keep the knees comfortable. Hold the chair if needed.',
      suggestedVolume: '6 to 8 reps',
      suggestedSets: '2 sets',
      estimatedTime: '3 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-a-glute-bridge',
      name: 'Glute bridge',
      category: 'Lower body',
      description: 'A gentle posterior-chain movement done on the floor.',
      caution: 'Press through the feet and stop before any back strain.',
      suggestedVolume: '8 to 10 reps',
      suggestedSets: '2 sets',
      estimatedTime: '3 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-a-chest-supported-row',
      name: 'Chest-supported dumbbell row',
      category: 'Upper body',
      description: 'A pulling movement with chest support for steadiness.',
      caution: 'Support the chest so the lower back stays quiet.',
      suggestedVolume: '8 reps',
      suggestedSets: '2 sets',
      estimatedTime: '4 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-a-wall-push-up',
      name: 'Wall push-up',
      category: 'Upper body',
      description: 'A gentle pressing pattern using the wall.',
      caution: 'Keep the body long and choose a wall distance that feels steady.',
      suggestedVolume: '6 to 10 reps',
      suggestedSets: '2 sets',
      estimatedTime: '3 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-a-dead-bug',
      name: 'Dead bug',
      category: 'Core',
      description: 'A slow trunk-control pattern done with steady breathing.',
      caution: 'Move slowly and keep the ribs down without breath-holding.',
      suggestedVolume: '5 reps each side',
      suggestedSets: '2 sets',
      estimatedTime: '4 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-b-romanian-deadlift',
      name: 'Dumbbell Romanian deadlift',
      category: 'Lower body',
      description: 'A hip-hinge pattern with a light dumbbell.',
      caution: 'Soft knees, hinge at the hips, and keep the range modest.',
      suggestedVolume: '8 reps',
      suggestedSets: '2 sets',
      estimatedTime: '4 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-b-side-lying-clam',
      name: 'Side-lying clam',
      category: 'Pelvic-floor-friendly',
      description: 'A small side-lying hip exercise for controlled glute work.',
      caution: 'Keep the pelvis still and avoid rolling backward.',
      suggestedVolume: '10 reps each side',
      suggestedSets: '2 sets',
      estimatedTime: '4 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-b-floor-press',
      name: 'Single-arm dumbbell floor press',
      category: 'Upper body',
      description: 'A light pressing movement from the floor.',
      caution: 'Use a light weight and keep the shoulder comfortable.',
      suggestedVolume: '8 reps each side',
      suggestedSets: '2 sets',
      estimatedTime: '4 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-b-band-pull-apart',
      name: 'Band pull-apart',
      category: 'Upper body',
      description: 'A controlled upper-back movement with a light band.',
      caution: 'Move with control and keep the shoulders down.',
      suggestedVolume: '8 to 10 reps',
      suggestedSets: '2 sets',
      estimatedTime: '3 min',
      enabled: true,
      isBuiltIn: true,
    },
    {
      id: 'routine-b-bird-dog',
      name: 'Bird-dog',
      category: 'Core',
      description: 'A slow contralateral reach for trunk steadiness.',
      caution: 'Reach long rather than high and keep the trunk steady.',
      suggestedVolume: '5 reps each side',
      suggestedSets: '2 sets',
      estimatedTime: '4 min',
      enabled: true,
      isBuiltIn: true,
    },
  ]
}

export const STRENGTH_ROUTINES: StrengthRoutine[] = [
  {
    id: 'routine-a',
    name: 'Routine A',
    enabled: true,
    isBuiltIn: true,
    exercises: [
      { exerciseId: 'routine-a-sit-to-stand' },
      { exerciseId: 'routine-a-glute-bridge' },
      { exerciseId: 'routine-a-chest-supported-row' },
      { exerciseId: 'routine-a-wall-push-up' },
      { exerciseId: 'routine-a-dead-bug' },
    ],
  },
  {
    id: 'routine-b',
    name: 'Routine B',
    enabled: true,
    isBuiltIn: true,
    exercises: [
      { exerciseId: 'routine-b-romanian-deadlift' },
      { exerciseId: 'routine-b-side-lying-clam' },
      { exerciseId: 'routine-b-floor-press' },
      { exerciseId: 'routine-b-band-pull-apart' },
      { exerciseId: 'routine-b-bird-dog' },
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
    version: 3,
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
      routines: STRENGTH_ROUTINES,
    },
    library: {
      habits: createDefaultHabits(),
      exercises: createDefaultExercises(),
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

export function makeLocalId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
