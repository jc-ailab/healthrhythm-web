import { useState, type ReactNode } from 'react'

import './styles.css'
import {
  BREATH_MODE_LABELS,
  BREATH_PHASE_LABELS,
  BREATH_ROUND_OPTIONS,
  RHYTHM_BPM,
  RHYTHM_DURATIONS,
  formatClockTime,
  formatCountdown,
  formatDurationMinutes,
  formatFullDate,
  makeLocalId,
  type BreathMode,
  type BreathPattern,
  type BreathPhase,
  type ExerciseDefinition,
  type HabitDefinition,
  type ResolvedStrengthRoutine,
  type TabKey,
  type TodayTimelineEvent,
} from './lib/domain'
import { useHealthRhythmApp } from './lib/state'

type LibrarySection = 'habits' | 'exercises'

type HabitDraft = {
  id?: string
  name: string
  category: string
  note: string
  enabled: boolean
  showOnToday: boolean
  isBuiltIn?: boolean
}

type ExerciseDraft = {
  id?: string
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

const EMPTY_HABIT_DRAFT: HabitDraft = {
  name: '',
  category: '',
  note: '',
  enabled: true,
  showOnToday: true,
}

const EMPTY_EXERCISE_DRAFT: ExerciseDraft = {
  name: '',
  category: '',
  description: '',
  caution: '',
  suggestedVolume: '',
  suggestedSets: '',
  estimatedTime: '',
  enabled: true,
}

function App() {
  const app = useHealthRhythmApp()
  const [selectedRoutineId, setSelectedRoutineId] = useState<ResolvedStrengthRoutine['id']>('routine-a')
  const [librarySection, setLibrarySection] = useState<LibrarySection>('habits')
  const [habitDraft, setHabitDraft] = useState<HabitDraft | null>(null)
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraft | null>(null)

  const selectedTab = app.state.selectedTab
  const selectedRoutine =
    app.strengthRoutines.find((routine) => routine.id === selectedRoutineId) ?? app.strengthRoutines[0]

  const todayHabits = app.visibleTodayHabits.map((habit) => ({
    ...habit,
    completedAt: app.state.today.completionTimesByHabitId[habit.id] ?? null,
  }))

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">HealthRhythm Web</p>
          <h1>{tabTitle(selectedTab)}</h1>
        </div>
        <p className="top-bar-note">{tabNote(selectedTab)}</p>
      </header>

      <main className="page-shell">
        {selectedTab === 'rhythm' && (
          <RhythmTab
            bpm={RHYTHM_BPM}
            selectedDuration={app.state.rhythm.selectedDurationMinutes}
            durations={Array.from(RHYTHM_DURATIONS)}
            remainingSeconds={app.rhythmRemainingSeconds}
            status={app.state.rhythm.status}
            isSoundEnabled={app.state.rhythm.isSoundEnabled}
            entriesToday={app.state.rhythm.entriesToday}
            totalMinutesToday={app.rhythmTotalMinutesToday}
            onSelectDuration={app.selectRhythmDuration}
            onToggleStartPause={app.toggleRhythm}
            onEnd={app.endRhythm}
            onSoundToggle={app.setRhythmSoundEnabled}
          />
        )}

        {selectedTab === 'breath' && (
          <BreathTab
            selectedMode={app.state.breath.selectedMode}
            customPattern={app.state.breath.customPattern}
            selectedRounds={app.state.breath.selectedRounds}
            currentPhase={app.state.breath.currentPhase}
            phaseRemainingSeconds={app.state.breath.phaseRemainingSeconds}
            currentRound={app.state.breath.currentRound}
            completedRounds={app.state.breath.completedRounds}
            totalRoundsToday={app.breathTotalRoundsToday}
            totalSessionsToday={app.breathTotalSessionsToday}
            status={app.state.breath.status}
            isSoundEnabled={app.state.breath.isSoundEnabled}
            entriesToday={app.state.breath.entriesToday}
            onSelectMode={app.selectBreathMode}
            onChangeCustomValue={app.setBreathCustomValue}
            onSelectRounds={app.selectBreathRounds}
            onToggleStartPause={app.toggleBreath}
            onEnd={app.endBreath}
            onSoundToggle={app.setBreathSoundEnabled}
          />
        )}

        {selectedTab === 'today' && (
          <TodayTab
            currentDayLabel={formatFullDate(new Date())}
            rhythmTotalMinutes={app.rhythmTotalMinutesToday}
            breathSessions={app.breathTotalSessionsToday}
            breathRounds={app.breathTotalRoundsToday}
            strengthSummary={app.strengthSummaryToday}
            habitCompletionCount={Object.keys(app.state.today.completionTimesByHabitId).length}
            habits={todayHabits}
            timelineEvents={app.todayTimeline}
            onToggleHabit={app.toggleHabit}
          />
        )}

        {selectedTab === 'history' && (
          <HistoryTab
            selectedDayKey={app.selectedHistoryDayKey}
            maxDayKey={app.state.currentDayKey}
            dailySummary={app.historyDailySummary(app.selectedHistoryDayKey)}
            weekSummary={app.historyWeekSummary}
            monthSummary={app.historyMonthSummary}
            onSelectDay={app.setSelectedHistoryDayKey}
          />
        )}

        {selectedTab === 'strength' && selectedRoutine && (
          <StrengthTab
            routines={app.strengthRoutines}
            selectedRoutineId={selectedRoutine.id}
            completedExerciseIds={new Set(app.state.strength.completedExerciseIds)}
            onSelectRoutine={setSelectedRoutineId}
            onToggleExercise={app.toggleStrengthExercise}
          />
        )}

        {selectedTab === 'library' && (
          <LibraryTab
            section={librarySection}
            habits={app.habitLibrary}
            exercises={app.exerciseLibrary}
            habitDraft={habitDraft}
            exerciseDraft={exerciseDraft}
            onSelectSection={setLibrarySection}
            onAddHabit={() => {
              setHabitDraft(EMPTY_HABIT_DRAFT)
              setExerciseDraft(null)
            }}
            onEditHabit={(habit) => {
              setHabitDraft({
                id: habit.id,
                name: habit.name,
                category: habit.category,
                note: habit.note,
                enabled: habit.enabled,
                showOnToday: habit.showOnToday,
                isBuiltIn: habit.isBuiltIn,
              })
              setExerciseDraft(null)
            }}
            onHabitDraftChange={(update) =>
              setHabitDraft((current) => (current ? { ...current, ...update } : current))
            }
            onSaveHabit={() => {
              if (!habitDraft) return
              app.saveHabit({
                id: habitDraft.id ?? makeLocalId('habit'),
                name: habitDraft.name.trim(),
                category: habitDraft.category.trim() || 'General',
                note: habitDraft.note.trim(),
                enabled: habitDraft.enabled,
                showOnToday: habitDraft.showOnToday,
                isBuiltIn: habitDraft.isBuiltIn,
              })
              setHabitDraft(null)
            }}
            onCancelHabit={() => setHabitDraft(null)}
            onAddExercise={() => {
              setExerciseDraft(EMPTY_EXERCISE_DRAFT)
              setHabitDraft(null)
            }}
            onEditExercise={(exercise) => {
              setExerciseDraft({
                id: exercise.id,
                name: exercise.name,
                category: exercise.category,
                description: exercise.description,
                caution: exercise.caution,
                suggestedVolume: exercise.suggestedVolume,
                suggestedSets: exercise.suggestedSets,
                estimatedTime: exercise.estimatedTime,
                enabled: exercise.enabled,
                isBuiltIn: exercise.isBuiltIn,
              })
              setHabitDraft(null)
            }}
            onExerciseDraftChange={(update) =>
              setExerciseDraft((current) => (current ? { ...current, ...update } : current))
            }
            onSaveExercise={() => {
              if (!exerciseDraft) return
              app.saveExercise({
                id: exerciseDraft.id ?? makeLocalId('exercise'),
                name: exerciseDraft.name.trim(),
                category: exerciseDraft.category.trim() || 'General',
                description: exerciseDraft.description.trim(),
                caution: exerciseDraft.caution.trim(),
                suggestedVolume: exerciseDraft.suggestedVolume.trim(),
                suggestedSets: exerciseDraft.suggestedSets.trim(),
                estimatedTime: exerciseDraft.estimatedTime.trim(),
                enabled: exerciseDraft.enabled,
                isBuiltIn: exerciseDraft.isBuiltIn,
              })
              setExerciseDraft(null)
            }}
            onCancelExercise={() => setExerciseDraft(null)}
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="Main">
        {([
          ['rhythm', 'Rhythm'],
          ['breath', 'Breath'],
          ['strength', 'Strength'],
          ['today', 'Today'],
          ['history', 'History'],
          ['library', 'Library'],
        ] as [TabKey, string][]).map(([tab, label]) => (
          <button
            key={tab}
            className={`tab-button${selectedTab === tab ? ' is-active' : ''}`}
            type="button"
            onClick={() => app.selectTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  )
}

interface RhythmTabProps {
  bpm: number
  selectedDuration: number
  durations: number[]
  remainingSeconds: number
  status: string
  isSoundEnabled: boolean
  entriesToday: { id: string; startAt: string; durationSeconds: number }[]
  totalMinutesToday: number
  onSelectDuration: (minutes: number) => void
  onToggleStartPause: () => void
  onEnd: () => void
  onSoundToggle: (isEnabled: boolean) => void
}

function RhythmTab(props: RhythmTabProps) {
  return (
    <div className="page-grid">
      <Card className="card-tight">
        <div className="hero-metric">
          <span className="eyebrow">Fixed tempo</span>
          <strong>{props.bpm} BPM</strong>
        </div>

        <div className="chip-row is-single-line" role="group" aria-label="Rhythm duration">
          {props.durations.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`chip${props.selectedDuration === minutes ? ' is-active' : ''}`}
              onClick={() => props.onSelectDuration(minutes)}
              disabled={props.status === 'running' || props.status === 'paused'}
            >
              {minutes} min
            </button>
          ))}
        </div>

        <div className="status-panel status-panel-tight">
          <div>
            <span className="status-label">Countdown</span>
            <strong>{formatCountdown(props.remainingSeconds)}</strong>
          </div>
          <div>
            <span className="status-label">Status</span>
            <strong>{rhythmStatusLabel(props.status)}</strong>
          </div>
        </div>

        <ToggleRow
          label="Metronome sound"
          isEnabled={props.isSoundEnabled}
          onToggle={props.onSoundToggle}
        />

        <div className="action-row">
          <button className="primary-button" type="button" onClick={props.onToggleStartPause}>
            {rhythmPrimaryLabel(props.status)}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={props.onEnd}
            disabled={props.status === 'idle'}
          >
            End
          </button>
        </div>
      </Card>

      <Card className="card-compact">
        <SectionHeader
          title="Today"
          subtitle={`${props.totalMinutesToday} min across ${props.entriesToday.length} entr${props.entriesToday.length === 1 ? 'y' : 'ies'}.`}
        />

        {props.entriesToday.length === 0 ? (
          <EmptyState text="No rhythm time saved yet today." />
        ) : (
          <div className="stack-list">
            {props.entriesToday.map((entry) => (
              <details key={entry.id} className="timeline-row">
                <summary>
                  <span>{formatClockTime(entry.startAt)}</span>
                  <span>Rhythm</span>
                  <span>{Math.max(1, Math.floor(entry.durationSeconds / 60))} min</span>
                </summary>
                <p>
                  Started at {formatClockTime(entry.startAt)} and logged{' '}
                  {formatDurationMinutes(entry.durationSeconds)}.
                </p>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

interface BreathTabProps {
  selectedMode: BreathMode
  customPattern: BreathPattern
  selectedRounds: number
  currentPhase: BreathPhase
  phaseRemainingSeconds: number
  currentRound: number
  completedRounds: number
  totalRoundsToday: number
  totalSessionsToday: number
  status: string
  isSoundEnabled: boolean
  entriesToday: {
    id: string
    startAt: string
    totalDurationSeconds: number
    completedRounds: number
    mode: BreathMode
    pattern: BreathPattern
  }[]
  onSelectMode: (mode: BreathMode) => void
  onChangeCustomValue: (phase: BreathPhase, value: number) => void
  onSelectRounds: (rounds: number) => void
  onToggleStartPause: () => void
  onEnd: () => void
  onSoundToggle: (isEnabled: boolean) => void
}

function BreathTab(props: BreathTabProps) {
  return (
    <div className="page-grid">
      <Card className="card-tight">
        <SectionHeader title="Breath practice" />

        <div className="chip-row is-single-line chip-row-breath-mode" role="group" aria-label="Breath mode">
          {(Object.entries(BREATH_MODE_LABELS) as [BreathMode, string][]).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`chip${props.selectedMode === mode ? ' is-active' : ''}`}
              onClick={() => props.onSelectMode(mode)}
              disabled={props.status === 'running' || props.status === 'paused'}
            >
              {label}
            </button>
          ))}
        </div>

        {props.selectedMode === 'custom' && (
          <div className="custom-grid">
            {([
              ['inhale', 'Inhale'],
              ['hold', 'Hold'],
              ['exhale', 'Exhale'],
              ['endHold', 'End hold'],
            ] as [BreathPhase, string][]).map(([phase, label]) => (
              <label key={phase} className="field-card">
                <span>{label}</span>
                <input
                  type="number"
                  min={phase === 'hold' || phase === 'endHold' ? 0 : 1}
                  max={12}
                  value={props.customPattern[phase]}
                  onChange={(event) =>
                    props.onChangeCustomValue(phase, Number.parseInt(event.target.value || '0', 10))
                  }
                  disabled={props.status === 'running' || props.status === 'paused'}
                />
              </label>
            ))}
          </div>
        )}

        <div className="status-panel status-panel-tight">
          <div>
            <span className="status-label">Phase</span>
            <strong>{BREATH_PHASE_LABELS[props.currentPhase]}</strong>
          </div>
          <div>
            <span className="status-label">Countdown</span>
            <strong>{props.phaseRemainingSeconds}s</strong>
          </div>
          <div>
            <span className="status-label">Round</span>
            <strong>
              {props.status === 'completed'
                ? `${props.completedRounds} of ${props.selectedRounds}`
                : `${Math.min(props.currentRound, props.selectedRounds)} of ${props.selectedRounds}`}
            </strong>
          </div>
        </div>

        <div className="chip-row is-single-line chip-row-compact" role="group" aria-label="Breath rounds">
          {Array.from(BREATH_ROUND_OPTIONS).map((rounds) => (
            <button
              key={rounds}
              type="button"
              className={`chip${props.selectedRounds === rounds ? ' is-active' : ''}`}
              onClick={() => props.onSelectRounds(rounds)}
              disabled={props.status === 'running' || props.status === 'paused'}
            >
              {rounds} rounds
            </button>
          ))}
        </div>

        <ToggleRow label="Cue sounds" isEnabled={props.isSoundEnabled} onToggle={props.onSoundToggle} />

        <div className="action-row">
          <button className="primary-button" type="button" onClick={props.onToggleStartPause}>
            {breathPrimaryLabel(props.status)}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={props.onEnd}
            disabled={props.status === 'idle'}
          >
            End
          </button>
        </div>
      </Card>

      <Card className="card-compact">
        <SectionHeader
          title="Today"
          subtitle={`${props.totalSessionsToday} session${props.totalSessionsToday === 1 ? '' : 's'} · ${props.totalRoundsToday} rounds`}
        />

        {props.entriesToday.length === 0 ? (
          <EmptyState text="No breath sessions saved yet today." />
        ) : (
          <div className="stack-list">
            {props.entriesToday.map((entry) => (
              <details key={entry.id} className="timeline-row">
                <summary>
                  <span>{formatClockTime(entry.startAt)}</span>
                  <span>Breath</span>
                  <span>{entry.completedRounds} rounds</span>
                </summary>
                <p>
                  {BREATH_MODE_LABELS[entry.mode]} pattern {entry.pattern.inhale}-{entry.pattern.hold}-
                  {entry.pattern.exhale}-{entry.pattern.endHold} ·{' '}
                  {formatDurationMinutes(entry.totalDurationSeconds)}.
                </p>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

interface TodayTabProps {
  currentDayLabel: string
  rhythmTotalMinutes: number
  breathSessions: number
  breathRounds: number
  strengthSummary: string
  habitCompletionCount: number
  habits: (HabitDefinition & { completedAt: string | null })[]
  timelineEvents: TodayTimelineEvent[]
  onToggleHabit: (habitId: string) => void
}

function TodayTab(props: TodayTabProps) {
  const habitGroups = groupHabitsByCategory(props.habits)

  return (
    <div className="page-grid">
      <Card className="card-compact">
        <SectionHeader title="Habit actions" />

        {props.habits.length === 0 ? (
          <EmptyState text="No habits are set to show on Today yet. Add or enable them in Library." />
        ) : (
          <div className="habit-group-stack">
            {habitGroups.map(([category, habits]) => (
              <section key={category} className="habit-group">
                <div className="habit-group-label">{category}</div>
                <div className="habit-chip-row">
                  {habits.map((habit) => (
                    <button
                      key={habit.id}
                      className={`habit-chip${habit.completedAt ? ' is-complete' : ''}`}
                      type="button"
                      onClick={() => props.onToggleHabit(habit.id)}
                    >
                      <span>{habit.name}</span>
                      {habit.completedAt && <small>{formatClockTime(habit.completedAt)}</small>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card className="card-compact">
        <SectionHeader title="Day at a glance" subtitle={props.currentDayLabel} />

        <div className="summary-grid summary-grid-compact summary-grid-today">
          <SummaryMetric title="Rhythm" value={`${props.rhythmTotalMinutes}`} suffix="min" />
          <SummaryMetric title="Breath" value={`${props.breathSessions}`} suffix="sessions" />
          <SummaryMetric title="Strength" value={props.strengthSummary} />
          <SummaryMetric title="Habits" value={`${props.habitCompletionCount}/${props.habits.length}`} />
        </div>
      </Card>

      <Card className="card-compact">
        <SectionHeader title="Daily timeline" subtitle={props.timelineEvents.length === 0 ? undefined : `${props.timelineEvents.length} events`} />

        {props.timelineEvents.length === 0 ? (
          <EmptyState text="No activity recorded yet today." />
        ) : (
          <div className="stack-list">
            {props.timelineEvents.map((event) => (
              <details key={event.id} className="timeline-row">
                <summary>
                  <span>{formatClockTime(event.timestamp)}</span>
                  <span>{event.title}</span>
                  <span>{event.summary}</span>
                </summary>
                {event.detail && <p>{event.detail}</p>}
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

interface HistoryTabProps {
  selectedDayKey: string
  maxDayKey: string
  dailySummary: {
    rhythmTotalMinutes: number
    rhythmEntriesCount: number
    breathSessionsCount: number
    breathRoundsCount: number
    strengthSummary: string
    mindfulEatingCompleted: boolean
    earlySleepCompleted: boolean
  }
  weekSummary: {
    totalRhythmMinutes: number
    rhythmDaysCount: number
    strengthDaysCount: number
    mindfulEatingDaysCount: number
    earlySleepDaysCount: number
  }
  monthSummary: {
    totalRhythmMinutes: number
    rhythmDaysCount: number
    strengthDaysCount: number
    mindfulEatingDaysCount: number
    earlySleepDaysCount: number
  }
  onSelectDay: (dayKey: string) => void
}

function HistoryTab(props: HistoryTabProps) {
  return (
    <div className="page-grid">
      <Card className="card-compact">
        <SectionHeader title="Selected day" subtitle="Quick review." />

        <label className="field-card">
          <span>View day</span>
          <input
            type="date"
            value={props.selectedDayKey}
            max={props.maxDayKey}
            onChange={(event) => props.onSelectDay(event.target.value)}
          />
        </label>

        <div className="metric-list">
          <HistoryMetric label="Rhythm total" value={`${props.dailySummary.rhythmTotalMinutes} min`} />
          <HistoryMetric label="Rhythm entries" value={`${props.dailySummary.rhythmEntriesCount}`} />
          <HistoryMetric
            label="Breath"
            value={`${props.dailySummary.breathSessionsCount} session${props.dailySummary.breathSessionsCount === 1 ? '' : 's'} · ${props.dailySummary.breathRoundsCount} rounds`}
          />
          <HistoryMetric label="Strength" value={props.dailySummary.strengthSummary} />
          <HistoryMetric
            label="Mindful eating"
            value={props.dailySummary.mindfulEatingCompleted ? 'Done' : 'Not done'}
          />
          <HistoryMetric
            label="Early sleep"
            value={props.dailySummary.earlySleepCompleted ? 'Done' : 'Not done'}
          />
        </div>
      </Card>

      <div className="two-column-cards">
        <Card>
          <SectionHeader title="This week" subtitle="Simple review." />
          <div className="metric-list">
            <HistoryMetric label="Rhythm total" value={`${props.weekSummary.totalRhythmMinutes} min`} />
            <HistoryMetric label="Days with rhythm" value={`${props.weekSummary.rhythmDaysCount}`} />
            <HistoryMetric label="Days with strength" value={`${props.weekSummary.strengthDaysCount}`} />
            <HistoryMetric
              label="Mindful eating days"
              value={`${props.weekSummary.mindfulEatingDaysCount}`}
            />
            <HistoryMetric label="Early sleep days" value={`${props.weekSummary.earlySleepDaysCount}`} />
          </div>
        </Card>

        <Card>
          <SectionHeader title="This month" subtitle="Monthly snapshot." />
          <div className="metric-list">
            <HistoryMetric label="Rhythm total" value={`${props.monthSummary.totalRhythmMinutes} min`} />
            <HistoryMetric label="Days with rhythm" value={`${props.monthSummary.rhythmDaysCount}`} />
            <HistoryMetric label="Days with strength" value={`${props.monthSummary.strengthDaysCount}`} />
            <HistoryMetric
              label="Mindful eating days"
              value={`${props.monthSummary.mindfulEatingDaysCount}`}
            />
            <HistoryMetric label="Early sleep days" value={`${props.monthSummary.earlySleepDaysCount}`} />
          </div>
        </Card>
      </div>
    </div>
  )
}

interface StrengthTabProps {
  routines: ResolvedStrengthRoutine[]
  selectedRoutineId: string
  completedExerciseIds: Set<string>
  onSelectRoutine: (routineId: string) => void
  onToggleExercise: (exerciseId: string) => void
}

function StrengthTab(props: StrengthTabProps) {
  const selectedRoutine =
    props.routines.find((routine) => routine.id === props.selectedRoutineId) ?? props.routines[0]

  return (
    <div className="page-grid">
      <Card className="card-compact">
        <SectionHeader title="Routine" subtitle="A/B switcher" />

        <div className="chip-row" role="group" aria-label="Strength routine">
          {props.routines.map((routine) => (
            <button
              key={routine.id}
              type="button"
              className={`chip${props.selectedRoutineId === routine.id ? ' is-active' : ''}`}
              onClick={() => props.onSelectRoutine(routine.id)}
            >
              {routine.title}
            </button>
          ))}
        </div>
      </Card>

      <Card className="card-tight">
        <SectionHeader
          title={selectedRoutine.title}
          subtitle={`${selectedRoutine.exercises.filter((exercise) => props.completedExerciseIds.has(exercise.id)).length} of ${selectedRoutine.exercises.length} complete today`}
        />

        <div className="exercise-stack">
          {selectedRoutine.exercises.map((exercise) => {
            const isDone = props.completedExerciseIds.has(exercise.id)
            return (
              <div key={exercise.id} className={`exercise-card${isDone ? ' is-complete' : ''}`}>
                <div className="exercise-card-header">
                  <div className="exercise-card-copy">
                    <strong>{exercise.name}</strong>
                    <p>{compactExerciseSummary(exercise)}</p>
                  </div>
                  <button
                    className={`chip exercise-toggle${isDone ? ' is-active' : ''}`}
                    type="button"
                    onClick={() => props.onToggleExercise(exercise.id)}
                  >
                    {isDone ? 'Done' : 'Mark'}
                  </button>
                </div>
                <details className="exercise-detail">
                  <summary>Form note</summary>
                  <small>{exercise.caution}</small>
                </details>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

interface LibraryTabProps {
  section: LibrarySection
  habits: HabitDefinition[]
  exercises: ExerciseDefinition[]
  habitDraft: HabitDraft | null
  exerciseDraft: ExerciseDraft | null
  onSelectSection: (section: LibrarySection) => void
  onAddHabit: () => void
  onEditHabit: (habit: HabitDefinition) => void
  onHabitDraftChange: (update: Partial<HabitDraft>) => void
  onSaveHabit: () => void
  onCancelHabit: () => void
  onAddExercise: () => void
  onEditExercise: (exercise: ExerciseDefinition) => void
  onExerciseDraftChange: (update: Partial<ExerciseDraft>) => void
  onSaveExercise: () => void
  onCancelExercise: () => void
}

function LibraryTab(props: LibraryTabProps) {
  return (
    <div className="page-grid">
      <Card className="card-compact">
        <SectionHeader
          title="Library"
          subtitle="Choose what to track on Today and keep a simple exercise pool for later routine building."
        />

        <div className="chip-row" role="group" aria-label="Library section">
          <button
            type="button"
            className={`chip${props.section === 'habits' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('habits')}
          >
            Habits
          </button>
          <button
            type="button"
            className={`chip${props.section === 'exercises' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('exercises')}
          >
            Exercises
          </button>
        </div>
      </Card>

      {props.section === 'habits' ? (
        <>
          <Card>
            <SectionHeader
              title="Habit library"
              subtitle="Choose what is active and what appears on Today."
            />

            <div className="library-toolbar">
              <button className="primary-button" type="button" onClick={props.onAddHabit}>
                Add habit
              </button>
            </div>

            <div className="library-list">
              {props.habits.map((habit) => (
                <button
                  key={habit.id}
                  type="button"
                  className="library-row"
                  onClick={() => props.onEditHabit(habit)}
                >
                  <div>
                    <strong>{habit.name}</strong>
                    <p>{habit.note || 'No note yet.'}</p>
                  </div>
                  <div className="badge-row">
                    <span className={`badge${habit.enabled ? ' is-on' : ''}`}>
                      {habit.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <span className={`badge${habit.showOnToday ? ' is-on' : ''}`}>
                      {habit.showOnToday ? 'On Today' : 'Hidden from Today'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader
              title={props.habitDraft?.id ? 'Edit habit' : 'New habit'}
              subtitle="Keep it simple."
            />

            {props.habitDraft ? (
              <>
                <div className="form-grid">
                  <label className="field-card">
                    <span>Name</span>
                    <input
                      type="text"
                      value={props.habitDraft.name}
                      onChange={(event) => props.onHabitDraftChange({ name: event.target.value })}
                    />
                  </label>
                  <label className="field-card">
                    <span>Category</span>
                    <input
                      type="text"
                      value={props.habitDraft.category}
                      onChange={(event) =>
                        props.onHabitDraftChange({ category: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card field-card-wide">
                    <span>Short note</span>
                    <textarea
                      rows={3}
                      value={props.habitDraft.note}
                      onChange={(event) => props.onHabitDraftChange({ note: event.target.value })}
                    />
                  </label>
                </div>

                <div className="inline-toggle-grid">
                  <ToggleRow
                    label="Enabled"
                    isEnabled={props.habitDraft.enabled}
                    onToggle={(value) => props.onHabitDraftChange({ enabled: value })}
                  />
                  <ToggleRow
                    label="Show on Today"
                    isEnabled={props.habitDraft.showOnToday}
                    onToggle={(value) => props.onHabitDraftChange({ showOnToday: value })}
                  />
                </div>

                <div className="action-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={props.onSaveHabit}
                    disabled={!props.habitDraft.name.trim()}
                  >
                    Save habit
                  </button>
                  <button className="secondary-button" type="button" onClick={props.onCancelHabit}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <EmptyState text="Select a habit to edit, or add a new one." />
            )}
          </Card>
        </>
      ) : (
        <>
          <Card>
            <SectionHeader
              title="Exercise library"
              subtitle="A simple pool for current and future routines."
            />

            <div className="library-toolbar">
              <button className="primary-button" type="button" onClick={props.onAddExercise}>
                Add exercise
              </button>
            </div>

            <div className="library-list">
              {props.exercises.map((exercise) => (
                <button
                  key={exercise.id}
                  type="button"
                  className="library-row"
                  onClick={() => props.onEditExercise(exercise)}
                >
                  <div>
                    <strong>{exercise.name}</strong>
                    <p>{exercise.caution || exercise.description || 'No note yet.'}</p>
                  </div>
                  <div className="badge-row">
                    <span className="badge">{exercise.category}</span>
                    <span className={`badge${exercise.enabled ? ' is-on' : ''}`}>
                      {exercise.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader
              title={props.exerciseDraft?.id ? 'Edit exercise' : 'New exercise'}
              subtitle="Keep each item lightweight and practical."
            />

            {props.exerciseDraft ? (
              <>
                <div className="form-grid">
                  <label className="field-card">
                    <span>Name</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.name}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>Category</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.category}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ category: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>Suggested reps or duration</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.suggestedVolume}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ suggestedVolume: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>Suggested sets</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.suggestedSets}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ suggestedSets: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>Estimated time</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.estimatedTime}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ estimatedTime: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card field-card-wide">
                    <span>Short description</span>
                    <textarea
                      rows={3}
                      value={props.exerciseDraft.description}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ description: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card field-card-wide">
                    <span>Caution / key form note</span>
                    <textarea
                      rows={3}
                      value={props.exerciseDraft.caution}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ caution: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="inline-toggle-grid">
                  <ToggleRow
                    label="Enabled"
                    isEnabled={props.exerciseDraft.enabled}
                    onToggle={(value) => props.onExerciseDraftChange({ enabled: value })}
                  />
                </div>

                <div className="action-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={props.onSaveExercise}
                    disabled={!props.exerciseDraft.name.trim()}
                  >
                    Save exercise
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={props.onCancelExercise}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <EmptyState text="Select an exercise to edit, or add a new one." />
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`.trim()}>{children}</section>
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>
}

function ToggleRow({
  label,
  isEnabled,
  onToggle,
}: {
  label: string
  isEnabled: boolean
  onToggle: (value: boolean) => void
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        className={`switch${isEnabled ? ' is-enabled' : ''}`}
        aria-pressed={isEnabled}
        onClick={() => onToggle(!isEnabled)}
      >
        <span />
      </button>
    </label>
  )
}

function SummaryMetric({
  title,
  value,
  suffix,
}: {
  title: string
  value: string
  suffix?: string
}) {
  return (
    <div className="summary-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      {suffix && <small>{suffix}</small>}
    </div>
  )
}

function HistoryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function compactExerciseSummary(exercise: {
  suggestedVolume: string
  suggestedSets: string
  estimatedTime: string
}) {
  return [exercise.suggestedVolume, exercise.suggestedSets, exercise.estimatedTime]
    .filter(Boolean)
    .join(' · ')
}

function groupHabitsByCategory(habits: (HabitDefinition & { completedAt: string | null })[]) {
  const groups = new Map<string, (HabitDefinition & { completedAt: string | null })[]>()
  for (const habit of habits) {
    const key = habit.category || 'General'
    const items = groups.get(key) ?? []
    items.push(habit)
    groups.set(key, items)
  }
  return Array.from(groups.entries())
}

function rhythmPrimaryLabel(status: string) {
  switch (status) {
    case 'running':
      return 'Pause'
    case 'paused':
      return 'Resume'
    default:
      return 'Start'
  }
}

function rhythmStatusLabel(status: string) {
  switch (status) {
    case 'running':
      return 'Running'
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Saved'
    default:
      return 'Ready'
  }
}

function breathPrimaryLabel(status: string) {
  switch (status) {
    case 'running':
      return 'Pause'
    case 'paused':
      return 'Resume'
    default:
      return 'Start'
  }
}

function tabTitle(tab: TabKey) {
  switch (tab) {
    case 'rhythm':
      return 'Rhythm'
    case 'breath':
      return 'Breath'
    case 'today':
      return 'Today'
    case 'history':
      return 'History'
    case 'strength':
      return 'Strength'
    case 'library':
      return 'Library'
  }
}

function tabNote(tab: TabKey) {
  switch (tab) {
    case 'rhythm':
      return 'Fixed 180 BPM with simple elapsed logging.'
    case 'breath':
      return 'Four calm phases with presets and one custom mode.'
    case 'today':
      return 'Today’s key actions and events.'
    case 'history':
      return 'Selected-day review plus quiet week and month summaries.'
    case 'strength':
      return 'Gentle A/B routines with compact exercise cards.'
    case 'library':
      return 'Choose which habits to track and keep a simple exercise pool for later.'
  }
}

export default App
