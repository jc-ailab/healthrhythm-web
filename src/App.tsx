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
  formatFullDate,
  makeLocalId,
  type BreathMode,
  type BreathPattern,
  type BreathPhase,
  type ExerciseDefinition,
  type HabitDefinition,
  type ResolvedStrengthRoutine,
  type StrengthRoutine,
  type TabKey,
  type TodayTimelineEvent,
} from './lib/domain'
import { useHealthRhythmApp } from './lib/state'

type LibrarySection = 'habits' | 'exercises' | 'routines'

type RoutineDraft = {
  id?: string
  name: string
  enabled: boolean
  isBuiltIn?: boolean
}

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
  const [routineDraft, setRoutineDraft] = useState<RoutineDraft | null>(null)
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null)

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
            breathSessions={app.breathTotalSessionsToday}
            breathRounds={app.breathTotalRoundsToday}
            strengthSummary={app.strengthSummaryToday}
            habitCompletionCount={Object.keys(app.state.today.completionTimesByHabitId).length}
            habitCount={app.visibleTodayHabits.length}
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
            rhythmTotalMinutes={app.rhythmTotalMinutesToday}
            strengthSummary={app.strengthSummaryToday}
            habitCompletionCount={Object.keys(app.state.today.completionTimesByHabitId).length}
            habitCount={app.visibleTodayHabits.length}
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
            routines={app.strengthRoutineLibrary}
            habitDraft={habitDraft}
            exerciseDraft={exerciseDraft}
            routineDraft={routineDraft}
            editingRoutineId={editingRoutineId}
            onSelectSection={(s) => {
              setLibrarySection(s)
              setHabitDraft(null)
              setExerciseDraft(null)
              setRoutineDraft(null)
              setEditingRoutineId(null)
            }}
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
            onAddRoutine={() => {
              setRoutineDraft({ name: '', enabled: true })
              setEditingRoutineId(null)
            }}
            onEditRoutine={(routine) => {
              setRoutineDraft({
                id: routine.id,
                name: routine.name,
                enabled: routine.enabled,
                isBuiltIn: routine.isBuiltIn,
              })
              setEditingRoutineId(routine.id)
            }}
            onRoutineDraftChange={(update) =>
              setRoutineDraft((current) => (current ? { ...current, ...update } : current))
            }
            onSaveRoutine={() => {
              if (!routineDraft || !routineDraft.name.trim()) return
              const id = routineDraft.id ?? makeLocalId('routine')
              const existing = app.strengthRoutineLibrary.find((r) => r.id === id)
              app.saveStrengthRoutine({
                id,
                name: routineDraft.name.trim(),
                enabled: routineDraft.enabled,
                isBuiltIn: routineDraft.isBuiltIn,
                exercises: existing?.exercises ?? [],
              })
              setEditingRoutineId(id)
              setRoutineDraft(null)
            }}
            onCancelRoutine={() => {
              setRoutineDraft(null)
              setEditingRoutineId(null)
            }}
            onAddExerciseToRoutine={(routineId, exerciseId) =>
              app.addExerciseToRoutine(routineId, exerciseId)
            }
            onRemoveRoutineExercise={(routineId, index) =>
              app.removeRoutineExercise(routineId, index)
            }
            onMoveRoutineExercise={(routineId, index, direction) =>
              app.moveRoutineExercise(routineId, index, direction)
            }
            onUpdateRoutineExercise={(routineId, index, update) =>
              app.updateRoutineExercise(routineId, index, update)
            }
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

// ─── Shared: Today Summary Strip ────────────────────────────────────────────

interface TodaySummaryCompactProps {
  rhythmTotalMinutes: number
  breathSessions: number
  breathRounds: number
  strengthSummary: string
  habitCompletionCount: number
  habitCount: number
}

function TodaySummaryCompact(props: TodaySummaryCompactProps) {
  return (
    <div className="today-summary-strip">
      <div className="today-summary-item">
        <span>Rhythm</span>
        <strong>{props.rhythmTotalMinutes} min</strong>
      </div>
      <div className="today-summary-item">
        <span>Breath</span>
        <strong>{props.breathSessions > 0 ? `${props.breathRounds} rds` : '—'}</strong>
      </div>
      <div className="today-summary-item">
        <span>Strength</span>
        <strong>{props.strengthSummary || '—'}</strong>
      </div>
      <div className="today-summary-item">
        <span>Habits</span>
        <strong>{props.habitCount > 0 ? `${props.habitCompletionCount}/${props.habitCount}` : '—'}</strong>
      </div>
    </div>
  )
}

// ─── Rhythm Tab ──────────────────────────────────────────────────────────────

interface RhythmTabProps {
  bpm: number
  selectedDuration: number
  durations: number[]
  remainingSeconds: number
  status: string
  isSoundEnabled: boolean
  entriesToday: { id: string; startAt: string; durationSeconds: number }[]
  totalMinutesToday: number
  breathSessions: number
  breathRounds: number
  strengthSummary: string
  habitCompletionCount: number
  habitCount: number
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
        <SectionHeader title="Today" />
        <TodaySummaryCompact
          rhythmTotalMinutes={props.totalMinutesToday}
          breathSessions={props.breathSessions}
          breathRounds={props.breathRounds}
          strengthSummary={props.strengthSummary}
          habitCompletionCount={props.habitCompletionCount}
          habitCount={props.habitCount}
        />
        {props.entriesToday.length > 0 && (
          <div className="event-stream activity-log">
            <p className="activity-log-label">Today activity</p>
            {props.entriesToday.map((entry) => (
              <div key={entry.id} className="event-row">
                <span className="event-time">{formatClockTime(entry.startAt)}</span>
                <span className="event-title">Rhythm</span>
                <span className="event-summary">{Math.max(1, Math.floor(entry.durationSeconds / 60))} min</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

// ─── Breath Tab ──────────────────────────────────────────────────────────────

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
  rhythmTotalMinutes: number
  strengthSummary: string
  habitCompletionCount: number
  habitCount: number
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
              {rounds} rds
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
        <SectionHeader title="Today" />
        <TodaySummaryCompact
          rhythmTotalMinutes={props.rhythmTotalMinutes}
          breathSessions={props.totalSessionsToday}
          breathRounds={props.totalRoundsToday}
          strengthSummary={props.strengthSummary}
          habitCompletionCount={props.habitCompletionCount}
          habitCount={props.habitCount}
        />
        {props.entriesToday.length > 0 && (
          <div className="event-stream activity-log">
            <p className="activity-log-label">Today activity</p>
            {props.entriesToday.map((entry) => (
              <div key={entry.id} className="event-row">
                <span className="event-time">{formatClockTime(entry.startAt)}</span>
                <span className="event-title">Breath</span>
                <span className="event-summary">{entry.completedRounds} rds</span>
              </div>
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
        <TodaySummaryCompact
          rhythmTotalMinutes={props.rhythmTotalMinutes}
          breathSessions={props.breathSessions}
          breathRounds={props.breathRounds}
          strengthSummary={props.strengthSummary}
          habitCompletionCount={props.habitCompletionCount}
          habitCount={props.habits.length}
        />
      </Card>

      <Card className="card-compact">
        <SectionHeader title="Timeline" />

        {props.timelineEvents.length === 0 ? (
          <EmptyState text="No activity recorded yet today." />
        ) : (
          <div className="event-stream">
            {props.timelineEvents.map((event) => (
              <div key={event.id} className="event-row">
                <span className="event-time">{formatClockTime(event.timestamp)}</span>
                <span className="event-title">{event.title}</span>
                <span className="event-summary">{event.summary}</span>
              </div>
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
        <SectionHeader title="Routine" />

        <div className="chip-row" role="group" aria-label="Strength routine">
          {props.routines.map((routine) => (
            <button
              key={routine.id}
              type="button"
              className={`chip${props.selectedRoutineId === routine.id ? ' is-active' : ''}`}
              onClick={() => props.onSelectRoutine(routine.id)}
            >
              {routine.name}
            </button>
          ))}
        </div>
      </Card>

      <Card className="card-tight">
        <SectionHeader
          title={selectedRoutine.name}
          subtitle={`${selectedRoutine.exercises.filter((e) => props.completedExerciseIds.has(e.id)).length}/${selectedRoutine.exercises.length} done`}
        />

        <div className="exercise-grid">
          {selectedRoutine.exercises.map((exercise) => {
            const isDone = props.completedExerciseIds.has(exercise.id)
            return (
              <button
                key={exercise.id}
                type="button"
                className={`exercise-tile${isDone ? ' is-complete' : ''}`}
                onClick={() => props.onToggleExercise(exercise.id)}
              >
                <strong>{exercise.name}</strong>
                <span>{compactExerciseSummary(exercise)}</span>
                {exercise.caution && (
                  <small>{exercise.caution}</small>
                )}
              </button>
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
  routines: StrengthRoutine[]
  habitDraft: HabitDraft | null
  exerciseDraft: ExerciseDraft | null
  routineDraft: RoutineDraft | null
  editingRoutineId: string | null
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
  onAddRoutine: () => void
  onEditRoutine: (routine: StrengthRoutine) => void
  onRoutineDraftChange: (update: Partial<RoutineDraft>) => void
  onSaveRoutine: () => void
  onCancelRoutine: () => void
  onAddExerciseToRoutine: (routineId: string, exerciseId: string) => void
  onRemoveRoutineExercise: (routineId: string, index: number) => void
  onMoveRoutineExercise: (routineId: string, index: number, direction: 'up' | 'down') => void
  onUpdateRoutineExercise: (
    routineId: string,
    index: number,
    update: Partial<Pick<import('./lib/domain').RoutineExercise, 'customSets' | 'customVolume' | 'customTime'>>,
  ) => void
}

function LibraryTab(props: LibraryTabProps) {
  return (
    <div className="page-grid">
      <Card className="card-compact">
        <SectionHeader title="Library" />

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
          <button
            type="button"
            className={`chip${props.section === 'routines' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('routines')}
          >
            Routines
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
      ) : props.section === 'routines' ? (
        <RoutinesSection
          routines={props.routines}
          exercises={props.exercises}
          routineDraft={props.routineDraft}
          editingRoutineId={props.editingRoutineId}
          onAddRoutine={props.onAddRoutine}
          onEditRoutine={props.onEditRoutine}
          onRoutineDraftChange={props.onRoutineDraftChange}
          onSaveRoutine={props.onSaveRoutine}
          onCancelRoutine={props.onCancelRoutine}
          onAddExerciseToRoutine={props.onAddExerciseToRoutine}
          onRemoveRoutineExercise={props.onRemoveRoutineExercise}
          onMoveRoutineExercise={props.onMoveRoutineExercise}
          onUpdateRoutineExercise={props.onUpdateRoutineExercise}
        />
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

// ─── Routine Builder ────────────────────────────────────────────────────────

interface RoutinesSectionProps {
  routines: StrengthRoutine[]
  exercises: ExerciseDefinition[]
  routineDraft: RoutineDraft | null
  editingRoutineId: string | null
  onAddRoutine: () => void
  onEditRoutine: (routine: StrengthRoutine) => void
  onRoutineDraftChange: (update: Partial<RoutineDraft>) => void
  onSaveRoutine: () => void
  onCancelRoutine: () => void
  onAddExerciseToRoutine: (routineId: string, exerciseId: string) => void
  onRemoveRoutineExercise: (routineId: string, index: number) => void
  onMoveRoutineExercise: (routineId: string, index: number, direction: 'up' | 'down') => void
  onUpdateRoutineExercise: (
    routineId: string,
    index: number,
    update: Partial<Pick<import('./lib/domain').RoutineExercise, 'customSets' | 'customVolume' | 'customTime'>>,
  ) => void
}

function RoutinesSection(props: RoutinesSectionProps) {
  const editingRoutine = props.editingRoutineId
    ? props.routines.find((r) => r.id === props.editingRoutineId) ?? null
    : null

  const [addExerciseId, setAddExerciseId] = useState('')

  const availableExercises = props.exercises.filter((e) => e.enabled)

  function handleAddExercise(routineId: string) {
    const id = addExerciseId || availableExercises[0]?.id
    if (!id) return
    props.onAddExerciseToRoutine(routineId, id)
    setAddExerciseId('')
  }

  return (
    <>
      <Card>
        <SectionHeader
          title="Routine library"
          subtitle="Create and manage routines. Routines appear in the Strength tab."
        />

        <div className="library-toolbar">
          <button className="primary-button" type="button" onClick={props.onAddRoutine}>
            New routine
          </button>
        </div>

        {props.routines.length === 0 ? (
          <EmptyState text="No routines yet." />
        ) : (
          <div className="library-list">
            {props.routines.map((routine) => (
              <button
                key={routine.id}
                type="button"
                className={`library-row${props.editingRoutineId === routine.id ? ' is-editing' : ''}`}
                onClick={() => props.onEditRoutine(routine)}
              >
                <div>
                  <strong>{routine.name}</strong>
                  <p>{routine.exercises.length} exercise{routine.exercises.length === 1 ? '' : 's'}</p>
                </div>
                <div className="badge-row">
                  {routine.isBuiltIn && <span className="badge">Built-in</span>}
                  <span className={`badge${routine.enabled ? ' is-on' : ''}`}>
                    {routine.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {props.routineDraft && (
        <Card>
          <SectionHeader
            title={props.routineDraft.id ? 'Edit routine' : 'New routine'}
          />

          <div className="form-grid">
            <label className="field-card field-card-wide">
              <span>Routine name</span>
              <input
                type="text"
                value={props.routineDraft.name}
                placeholder="e.g. Morning mobility"
                disabled={props.routineDraft.isBuiltIn}
                onChange={(e) => props.onRoutineDraftChange({ name: e.target.value })}
              />
            </label>
          </div>

          <div className="inline-toggle-grid" style={{ marginTop: 10 }}>
            <ToggleRow
              label="Enabled"
              isEnabled={props.routineDraft.enabled}
              onToggle={(v) => props.onRoutineDraftChange({ enabled: v })}
            />
          </div>

          <div className="action-row">
            <button
              className="primary-button"
              type="button"
              onClick={props.onSaveRoutine}
              disabled={!props.routineDraft.name.trim()}
            >
              Save routine
            </button>
            <button className="secondary-button" type="button" onClick={props.onCancelRoutine}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {editingRoutine && (
        <Card>
          <SectionHeader
            title={editingRoutine.name}
            subtitle="Add and reorder exercises for this routine."
          />

          {editingRoutine.exercises.length === 0 ? (
            <EmptyState text="No exercises yet. Add one below." />
          ) : (
            <div className="routine-exercise-list">
              {editingRoutine.exercises.map((re, index) => {
                const def = props.exercises.find((e) => e.id === re.exerciseId)
                return (
                  <div key={`${re.exerciseId}-${index}`} className="routine-exercise-row">
                    <div className="routine-exercise-move">
                      <button
                        type="button"
                        className="routine-move-btn"
                        onClick={() => props.onMoveRoutineExercise(editingRoutine.id, index, 'up')}
                        disabled={index === 0}
                        aria-label="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="routine-move-btn"
                        onClick={() => props.onMoveRoutineExercise(editingRoutine.id, index, 'down')}
                        disabled={index === editingRoutine.exercises.length - 1}
                        aria-label="Move down"
                      >
                        ↓
                      </button>
                    </div>

                    <div className="routine-exercise-body">
                      <strong>{def?.name ?? re.exerciseId}</strong>
                      {def && <span className="routine-exercise-meta">{def.category}</span>}

                      <details className="routine-exercise-overrides">
                        <summary>Override</summary>
                        <div className="routine-override-grid">
                          <label className="field-card">
                            <span>Sets</span>
                            <input
                              type="text"
                              placeholder={def?.suggestedSets ?? ''}
                              value={re.customSets ?? ''}
                              onChange={(e) =>
                                props.onUpdateRoutineExercise(editingRoutine.id, index, {
                                  customSets: e.target.value || undefined,
                                })
                              }
                            />
                          </label>
                          <label className="field-card">
                            <span>Reps / volume</span>
                            <input
                              type="text"
                              placeholder={def?.suggestedVolume ?? ''}
                              value={re.customVolume ?? ''}
                              onChange={(e) =>
                                props.onUpdateRoutineExercise(editingRoutine.id, index, {
                                  customVolume: e.target.value || undefined,
                                })
                              }
                            />
                          </label>
                          <label className="field-card">
                            <span>Time</span>
                            <input
                              type="text"
                              placeholder={def?.estimatedTime ?? ''}
                              value={re.customTime ?? ''}
                              onChange={(e) =>
                                props.onUpdateRoutineExercise(editingRoutine.id, index, {
                                  customTime: e.target.value || undefined,
                                })
                              }
                            />
                          </label>
                        </div>
                      </details>
                    </div>

                    <button
                      type="button"
                      className="routine-remove-btn"
                      onClick={() => props.onRemoveRoutineExercise(editingRoutine.id, index)}
                      aria-label="Remove exercise"
                    >
                      ✕
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {availableExercises.length > 0 && (
            <div className="routine-add-row">
              <select
                className="routine-add-select"
                value={addExerciseId}
                onChange={(e) => setAddExerciseId(e.target.value)}
                aria-label="Select exercise to add"
              >
                {availableExercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleAddExercise(editingRoutine.id)}
              >
                Add
              </button>
            </div>
          )}

          {availableExercises.length === 0 && (
            <EmptyState text="Enable exercises in the Exercises section to add them here." />
          )}
        </Card>
      )}
    </>
  )
}

// ─── Shared UI primitives ────────────────────────────────────────────────────

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
      return 'Gentle routines with compact exercise cards.'
    case 'library':
      return 'Manage habits, exercises, and custom routines.'
  }
}

export default App
