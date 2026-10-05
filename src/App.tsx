import { useState, type ReactNode } from 'react'

import './styles.css'
import { DataBackupSection } from './DataBackupSection'
import {
  BREATH_MODE_LABELS,
  BREATH_PHASE_LABELS,
  BREATH_ROUND_OPTIONS,
  FOUNDATION_ITEMS,
  MOVEMENT_DURATION_PRESETS,
  MOVEMENT_INTENSITY_LABELS,
  MOVEMENT_MAX_MINUTES,
  MOVEMENT_TYPES,
  MULTI_CAPTURE_HABIT_IDS,
  RHYTHM_BPM,
  RHYTHM_DURATIONS,
  formatClockTime,
  formatCountdown,
  formatFullDate,
  fromDayKey,
  makeLocalId,
  monthKeyOf,
  movementTypeLabel,
  parseMovementMinutes,
  shiftDayKey,
  type BreathMode,
  type BreathPattern,
  type BreathPhase,
  type ExerciseDefinition,
  type FoundationItemId,
  type HabitDefinition,
  type HistorySummary,
  type MovementIntensity,
  type MovementSession,
  type MovementSessionDraft,
  type ResolvedStrengthRoutine,
  type StrengthRoutine,
  type TabKey,
  type TodayTimelineEvent,
} from './lib/domain'
import {
  useHealthRhythmApp,
  type HistoryDailySummary,
  type HistoryPeriodKind,
  type HistoryPeriodNavigation,
  type MovementDefaults,
} from './lib/state'

type LibrarySection = 'habits' | 'exercises' | 'routines' | 'data'

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
    captureCount: MULTI_CAPTURE_HABIT_IDS.has(habit.id)
      ? (app.state.today.eventsByHabitId[habit.id]?.length ?? 0)
      : null,
  }))

  const habitCompletionCount =
    Object.keys(app.state.today.completionTimesByHabitId).length +
    Object.entries(app.state.today.eventsByHabitId)
      .filter(([, events]) => (events?.length ?? 0) > 0)
      .length

  const foundationToday: FoundationTileItem[] = FOUNDATION_ITEMS.map((item) => ({
    ...item,
    completedAt: app.state.today.foundationCompletedAt[item.id] ?? null,
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

      {app.storageNotice && (
        <div className="storage-notice" role="status">
          <p>{app.storageNotice.message}</p>
          <button type="button" onClick={app.dismissStorageNotice}>
            Dismiss
          </button>
        </div>
      )}

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
            habitCompletionCount={habitCompletionCount}
            habits={todayHabits}
            timelineEvents={app.todayTimeline}
            onToggleHabit={app.toggleHabit}
            foundation={foundationToday}
            onToggleFoundation={app.toggleFoundationItem}
            dayKey={app.state.currentDayKey}
            movementSessions={app.state.today.movementSessions}
            movementDefaultsFor={app.movementDefaultsFor}
            onAddMovement={app.addMovementSession}
            onUpdateMovement={app.updateMovementSession}
            onDeleteMovement={app.deleteMovementSession}
          />
        )}

        {selectedTab === 'history' && (
          <HistoryTab
            selectedDayKey={app.selectedHistoryDayKey}
            maxDayKey={app.state.currentDayKey}
            dailySummary={app.historyDailySummary(app.selectedHistoryDayKey)}
            weekSummary={app.historyWeekSummary}
            monthSummary={app.historyMonthSummary}
            navigation={app.historyNavigation}
            onSelectDay={app.setSelectedHistoryDayKey}
            onStepPeriod={app.stepHistoryPeriod}
            onResetPeriod={app.resetHistoryPeriod}
            onUpdateMovement={app.updateMovementSession}
            onDeleteMovement={app.deleteMovementSession}
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
            dataPanel={
              <DataBackupSection state={app.state} canPersist={app.canPersist} onReplace={app.replaceAppState} />
            }
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
  foundationCompletedCount: number
  movementTotalMinutes: number
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
      <div className="today-summary-item">
        <span>基础</span>
        <strong>{props.foundationCompletedCount}/{FOUNDATION_ITEMS.length}</strong>
      </div>
      <div className="today-summary-item">
        <span>运动</span>
        <strong>{props.movementTotalMinutes > 0 ? `${props.movementTotalMinutes} 分钟` : '—'}</strong>
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
        <SectionHeader title="Today activity" />
        {props.entriesToday.length === 0 ? (
          <EmptyState text="No rhythm sessions yet today." />
        ) : (
          <div className="event-stream">
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
        <SectionHeader title="Today activity" />
        {props.entriesToday.length === 0 ? (
          <EmptyState text="No breath sessions yet today." />
        ) : (
          <div className="event-stream">
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
  habits: (HabitDefinition & { completedAt: string | null; captureCount: number | null })[]
  timelineEvents: TodayTimelineEvent[]
  onToggleHabit: (habitId: string) => void
  foundation: FoundationTileItem[]
  onToggleFoundation: (itemId: FoundationItemId) => void
  dayKey: string
  movementSessions: MovementSession[]
  movementDefaultsFor: (typeId: string) => MovementDefaults
  onAddMovement: (draft: MovementSessionDraft) => void
  onUpdateMovement: MovementUpdateHandler
  onDeleteMovement: MovementDeleteHandler
}

function TodayTab(props: TodayTabProps) {
  const habitGroups = groupHabitsByCategory(props.habits)
  const foundationCompletedCount = props.foundation.filter((item) => item.completedAt).length

  return (
    <div className="page-grid">
      <Card className="card-compact">
        <FoundationHeader completedCount={foundationCompletedCount} />
        <div className="foundation-grid">
          {props.foundation.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`foundation-tile${item.completedAt ? ' is-complete' : ''}`}
              aria-pressed={Boolean(item.completedAt)}
              onClick={() => props.onToggleFoundation(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.completedAt ? `✓ ${formatClockTime(item.completedAt)}` : '点按完成'}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="card-compact">
        <SectionHeader title="运动记录" subtitle="选好项目，一键记录。" />
        <MovementQuickLog defaultsFor={props.movementDefaultsFor} onAdd={props.onAddMovement} />
        <div className="activity-log">
          <div className="activity-log-label">今日运动</div>
          <MovementSessionList
            dayKey={props.dayKey}
            sessions={props.movementSessions}
            emptyText="今天还没有运动记录。"
            onUpdate={props.onUpdateMovement}
            onDelete={props.onDeleteMovement}
          />
        </div>
      </Card>

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
                  {habits.map((habit) => {
                    const isMulti = habit.captureCount !== null
                    const isDone = isMulti ? (habit.captureCount! > 0) : Boolean(habit.completedAt)
                    return (
                      <button
                        key={habit.id}
                        className={`habit-chip${isDone ? ' is-complete' : ''}`}
                        type="button"
                        onClick={() => props.onToggleHabit(habit.id)}
                      >
                        <span>{habit.name}{isMulti && habit.captureCount! > 0 ? ` · ${habit.captureCount}×` : ''}</span>
                        {!isMulti && habit.completedAt && <small>{formatClockTime(habit.completedAt)}</small>}
                      </button>
                    )
                  })}
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
          foundationCompletedCount={foundationCompletedCount}
          movementTotalMinutes={props.movementSessions.reduce((total, session) => total + session.durationMinutes, 0)}
        />
      </Card>

      <Card className="card-compact">
        <SectionHeader title="Timeline" />

        {props.timelineEvents.length === 0 ? (
          <EmptyState text="No activity recorded yet today." />
        ) : (
          <div className="event-stream">
            {props.timelineEvents.map((event) => (
              <details key={event.id} className="event-row">
                <summary className="event-row-summary">
                  <span className="event-time">{formatClockTime(event.timestamp)}</span>
                  <span className="event-title">{event.title}</span>
                  <span className="event-summary">{event.summary}</span>
                </summary>
                {event.detail && (
                  <p className="event-detail">{event.detail}</p>
                )}
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
  dailySummary: HistoryDailySummary
  weekSummary: HistorySummary
  monthSummary: HistorySummary
  navigation: Record<HistoryPeriodKind, HistoryPeriodNavigation>
  onSelectDay: (dayKey: string) => void
  onStepPeriod: (kind: HistoryPeriodKind, delta: -1 | 1) => void
  onResetPeriod: (kind: HistoryPeriodKind) => void
  onUpdateMovement: MovementUpdateHandler
  onDeleteMovement: MovementDeleteHandler
}

function HistoryTab(props: HistoryTabProps) {
  const day = props.dailySummary

  return (
    <div className="page-grid">
      <Card className="card-compact">
        <SectionHeader title="当日回顾" subtitle={formatDayKeyLabel(props.selectedDayKey)} />

        <PeriodNav
          label="切换日期"
          navigation={props.navigation.day}
          backLabel="‹ 前一天"
          currentLabel="今天"
          forwardLabel="后一天 ›"
          onStep={(delta) => props.onStepPeriod('day', delta)}
          onReset={() => props.onResetPeriod('day')}
        />
        <label className="field-card history-date-field">
          <span>选择日期</span>
          <input
            type="date"
            value={props.selectedDayKey}
            max={props.maxDayKey}
            onChange={(event) => props.onSelectDay(event.target.value)}
          />
        </label>

        <div className="activity-log-label">每日基础 · {day.foundationCompletedCount}/{day.foundation.length}</div>
        <div className="badge-row foundation-badges">
          {day.foundation.map((item) => (
            <span key={item.id} className={`badge${item.completedAt ? ' is-on' : ''}`}>
              {item.completedAt ? '✓ ' : ''}
              {item.label}
            </span>
          ))}
        </div>

        <div className="activity-log">
          <div className="activity-log-label">
            运动
            {day.movementSessions.length > 0 && ` · ${day.movementSessions.length} 次 · ${day.movementTotalMinutes} 分钟`}
          </div>
          <MovementSessionList
            // Remount per day so an open editor never carries over to another date.
            key={props.selectedDayKey}
            dayKey={props.selectedDayKey}
            sessions={day.movementSessions}
            emptyText="这一天没有运动记录。"
            onUpdate={props.onUpdateMovement}
            onDelete={props.onDeleteMovement}
          />
        </div>

        <div className="activity-log">
          <div className="activity-log-label">节律与习惯</div>
          <div className="metric-list">
            <HistoryMetric label="Rhythm total" value={`${day.rhythmTotalMinutes} min`} />
            <HistoryMetric label="Rhythm entries" value={`${day.rhythmEntriesCount}`} />
            <HistoryMetric
              label="Breath"
              value={`${day.breathSessionsCount} session${day.breathSessionsCount === 1 ? '' : 's'} · ${day.breathRoundsCount} rounds`}
            />
            <HistoryMetric label="Strength" value={day.strengthSummary} />
            <HistoryMetric
              label="Mindful eating"
              value={
                day.mindfulEatingCaptureCount > 0
                  ? `Done · ${day.mindfulEatingCaptureCount}×`
                  : day.mindfulEatingCompleted
                    ? 'Done'
                    : 'Not done'
              }
            />
            <HistoryMetric label="Early sleep" value={day.earlySleepCompleted ? 'Done' : 'Not done'} />
          </div>
        </div>
      </Card>

      <div className="two-column-cards">
        <PeriodSummaryCard
          kind="week"
          summary={props.weekSummary}
          navigation={props.navigation.week}
          onStep={(delta) => props.onStepPeriod('week', delta)}
          onReset={() => props.onResetPeriod('week')}
        />
        <PeriodSummaryCard
          kind="month"
          summary={props.monthSummary}
          navigation={props.navigation.month}
          onStep={(delta) => props.onStepPeriod('month', delta)}
          onReset={() => props.onResetPeriod('month')}
        />
      </div>
    </div>
  )
}

function PeriodNav({
  label,
  navigation,
  backLabel,
  currentLabel,
  forwardLabel,
  onStep,
  onReset,
}: {
  label: string
  navigation: HistoryPeriodNavigation
  backLabel: string
  currentLabel: string
  forwardLabel: string
  onStep: (delta: -1 | 1) => void
  onReset: () => void
}) {
  return (
    <div className="chip-row is-single-line period-nav" role="group" aria-label={label}>
      <button type="button" className="chip" disabled={!navigation.canGoBack} onClick={() => onStep(-1)}>
        {backLabel}
      </button>
      <button
        type="button"
        className={`chip${navigation.isCurrent ? ' is-active' : ''}`}
        aria-pressed={navigation.isCurrent}
        onClick={onReset}
      >
        {currentLabel}
      </button>
      <button type="button" className="chip" disabled={!navigation.canGoForward} onClick={() => onStep(1)}>
        {forwardLabel}
      </button>
    </div>
  )
}

// ─── Daily foundation & movement ────────────────────────────────────────────

type FoundationTileItem = { id: FoundationItemId; label: string; completedAt: string | null }
type MovementUpdateHandler = (dayKey: string, sessionId: string, draft: MovementSessionDraft) => void
type MovementDeleteHandler = (dayKey: string, sessionId: string) => void

type MovementFormValue = {
  typeId: string
  durationText: string
  intensity: MovementIntensity
  note: string
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']

// The date input reports '' when cleared (iOS has a Clear button); formatting that would throw.
function formatDayKeyLabel(dayKey: string) {
  const date = fromDayKey(dayKey)
  return Number.isNaN(date.getTime()) ? undefined : formatFullDate(date)
}

function FoundationHeader({ completedCount }: { completedCount: number }) {
  const total = FOUNDATION_ITEMS.length
  return (
    <div className="foundation-header">
      <div className="section-header">
        <h2>每日基础</h2>
        <p>{completedCount === total ? '今日四项已全部完成' : '核心与脊柱的日常基础练习'}</p>
      </div>
      <div className="foundation-count" aria-label={`今日已完成 ${completedCount}/${total}`}>
        <strong>
          {completedCount}/{total}
        </strong>
        <div className="foundation-meter" aria-hidden="true">
          {FOUNDATION_ITEMS.map((item, index) => (
            <span key={item.id} className={index < completedCount ? 'is-on' : ''} />
          ))}
        </div>
      </div>
    </div>
  )
}

function toMovementDraft(value: MovementFormValue): MovementSessionDraft | null {
  const durationMinutes = parseMovementMinutes(value.durationText)
  if (durationMinutes === null) {
    return null
  }
  return { typeId: value.typeId, durationMinutes, intensity: value.intensity, note: value.note }
}

function MovementQuickLog({
  defaultsFor,
  onAdd,
}: {
  defaultsFor: (typeId: string) => MovementDefaults
  onAdd: (draft: MovementSessionDraft) => void
}) {
  const [value, setValue] = useState<MovementFormValue>(() => {
    const typeId = MOVEMENT_TYPES[0].id
    const defaults = defaultsFor(typeId)
    return { typeId, durationText: String(defaults.durationMinutes), intensity: defaults.intensity, note: '' }
  })
  const draft = toMovementDraft(value)

  return (
    <div className="movement-form">
      <MovementFields
        value={value}
        onChange={(update) => {
          if (update.typeId && update.typeId !== value.typeId) {
            // Switching type pre-fills what was last logged for it.
            const defaults = defaultsFor(update.typeId)
            setValue({
              ...value,
              typeId: update.typeId,
              durationText: String(defaults.durationMinutes),
              intensity: defaults.intensity,
            })
            return
          }
          setValue({ ...value, ...update })
        }}
      />
      <button
        className="primary-button"
        type="button"
        disabled={!draft}
        onClick={() => {
          if (!draft) return
          onAdd(draft)
          setValue({ ...value, note: '' })
        }}
      >
        {draft ? `记录 ${movementTypeLabel(value.typeId)} · ${draft.durationMinutes} 分钟` : '记录'}
      </button>
    </div>
  )
}

function MovementFields({
  value,
  onChange,
  extraTypeId,
}: {
  value: MovementFormValue
  onChange: (update: Partial<MovementFormValue>) => void
  // A retired type kept on an existing record, offered so editing does not force a change.
  extraTypeId?: string
}) {
  const types = [
    ...MOVEMENT_TYPES,
    ...(extraTypeId && !MOVEMENT_TYPES.some((type) => type.id === extraTypeId)
      ? [{ id: extraTypeId, label: extraTypeId }]
      : []),
  ]
  const isDurationValid = parseMovementMinutes(value.durationText) !== null

  return (
    <>
      <div className="chip-row is-single-line movement-chip-row" role="group" aria-label="运动项目">
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            className={`chip${value.typeId === type.id ? ' is-active' : ''}`}
            aria-pressed={value.typeId === type.id}
            onClick={() => onChange({ typeId: type.id })}
          >
            {type.label}
          </button>
        ))}
      </div>

      <div className="movement-duration-row" role="group" aria-label="时长">
        {MOVEMENT_DURATION_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={`chip${value.durationText === String(minutes) ? ' is-active' : ''}`}
            onClick={() => onChange({ durationText: String(minutes) })}
          >
            {minutes}
          </button>
        ))}
        <label className="movement-minutes-input">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={MOVEMENT_MAX_MINUTES}
            aria-label="时长（分钟）"
            aria-invalid={!isDurationValid}
            value={value.durationText}
            onChange={(event) => onChange({ durationText: event.target.value })}
          />
          <span>分钟</span>
        </label>
      </div>
      {!isDurationValid && <p className="movement-hint">请输入 1–{MOVEMENT_MAX_MINUTES} 分钟</p>}

      <div className="chip-row is-single-line movement-chip-row" role="group" aria-label="强度">
        {(Object.entries(MOVEMENT_INTENSITY_LABELS) as [MovementIntensity, string][]).map(([intensity, label]) => (
          <button
            key={intensity}
            type="button"
            className={`chip${value.intensity === intensity ? ' is-active' : ''}`}
            aria-pressed={value.intensity === intensity}
            onClick={() => onChange({ intensity })}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        className="movement-note-input"
        type="text"
        maxLength={200}
        placeholder="备注（可选）"
        aria-label="备注"
        value={value.note}
        onChange={(event) => onChange({ note: event.target.value })}
      />
    </>
  )
}

function MovementSessionList({
  dayKey,
  sessions,
  emptyText,
  onUpdate,
  onDelete,
}: {
  dayKey: string
  sessions: MovementSession[]
  emptyText: string
  onUpdate: MovementUpdateHandler
  onDelete: MovementDeleteHandler
}) {
  if (sessions.length === 0) {
    return <EmptyState text={emptyText} />
  }

  return (
    <div className="movement-list">
      {sessions.map((session) => (
        <MovementSessionRow
          key={session.id}
          session={session}
          onUpdate={(draft) => onUpdate(dayKey, session.id, draft)}
          onDelete={() => onDelete(dayKey, session.id)}
        />
      ))}
    </div>
  )
}

function MovementSessionRow({
  session,
  onUpdate,
  onDelete,
}: {
  session: MovementSession
  onUpdate: (draft: MovementSessionDraft) => void
  onDelete: () => void
}) {
  const [editValue, setEditValue] = useState<MovementFormValue | null>(null)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  if (editValue) {
    const draft = toMovementDraft(editValue)
    return (
      <div className="movement-row is-editing">
        <div className="movement-form">
          <MovementFields
            value={editValue}
            extraTypeId={session.typeId}
            onChange={(update) => setEditValue({ ...editValue, ...update })}
          />
          <div className="movement-row-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!draft}
              onClick={() => {
                if (!draft) return
                onUpdate(draft)
                setEditValue(null)
              }}
            >
              保存
            </button>
            <button className="secondary-button" type="button" onClick={() => setEditValue(null)}>
              取消
            </button>
          </div>
        </div>
      </div>
    )
  }

  const meta = [`${session.durationMinutes} 分钟`, session.intensity ? MOVEMENT_INTENSITY_LABELS[session.intensity] : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="movement-row">
      <div className="movement-row-main">
        <span className="event-time">{formatClockTime(session.loggedAt)}</span>
        <span className="event-title">{movementTypeLabel(session.typeId)}</span>
        <span className="event-summary">{meta}</span>
        {session.note && <p className="movement-note">{session.note}</p>}
      </div>
      <div className="movement-row-actions">
        {isConfirmingDelete ? (
          <>
            <button className="text-button is-danger" type="button" onClick={onDelete}>
              确认删除
            </button>
            <button className="text-button" type="button" onClick={() => setIsConfirmingDelete(false)}>
              取消
            </button>
          </>
        ) : (
          <>
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setEditValue({
                  typeId: session.typeId,
                  durationText: String(session.durationMinutes),
                  intensity: session.intensity ?? 'moderate',
                  note: session.note ?? '',
                })
              }
            >
              编辑
            </button>
            <button className="text-button" type="button" onClick={() => setIsConfirmingDelete(true)}>
              删除
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function formatMonthDay(dayKey: string) {
  const [, month, day] = dayKey.split('-').map(Number)
  return `${month}月${day}日`
}

function periodSubtitle(kind: 'week' | 'month', summary: HistorySummary, navigation: HistoryPeriodNavigation) {
  if (kind === 'month') {
    const [year, month] = monthKeyOf(navigation.key).split('-').map(Number)
    return `${year}年${month}月${navigation.isCurrent ? ' · 本月' : ''}`
  }
  const first = summary.foundationDailyCounts[0]?.dayKey ?? navigation.key
  const range = `${formatMonthDay(first)} – ${formatMonthDay(shiftDayKey(first, 6))}`
  return `${range}${navigation.isCurrent ? ' · 本周' : ''}`
}

function PeriodSummaryCard({
  kind,
  summary,
  navigation,
  onStep,
  onReset,
}: {
  kind: 'week' | 'month'
  summary: HistorySummary
  navigation: HistoryPeriodNavigation
  onStep: (delta: -1 | 1) => void
  onReset: () => void
}) {
  const isWeek = kind === 'week'
  const rate =
    summary.foundationPossibleCount > 0
      ? Math.round((summary.foundationCompletedCount / summary.foundationPossibleCount) * 100)
      : 0

  return (
    <Card className="card-compact">
      <SectionHeader title={isWeek ? '周汇总' : '月汇总'} subtitle={periodSubtitle(kind, summary, navigation)} />
      <PeriodNav
        label={isWeek ? '切换周' : '切换月份'}
        navigation={navigation}
        backLabel={isWeek ? '‹ 上一周' : '‹ 上个月'}
        currentLabel={isWeek ? '本周' : '本月'}
        forwardLabel={isWeek ? '下一周 ›' : '下个月 ›'}
        onStep={onStep}
        onReset={onReset}
      />

      <div className="activity-log-label">每日基础</div>
      {isWeek && (
        <div className="week-strip">
          {summary.foundationDailyCounts.map((day, index) => {
            const isFuture = index >= summary.elapsedDaysCount
            const level =
              isFuture || day.completedCount === 0
                ? ''
                : day.completedCount === FOUNDATION_ITEMS.length
                  ? ' is-full'
                  : ' is-partial'
            const weekday = WEEKDAY_LABELS[fromDayKey(day.dayKey).getDay()]
            return (
              <div
                key={day.dayKey}
                className={`week-strip-day${level}${isFuture ? ' is-future' : ''}`}
                aria-label={`周${weekday} ${isFuture ? '未到' : `${day.completedCount}/${FOUNDATION_ITEMS.length}`}`}
              >
                <span>{weekday}</span>
                <strong>{isFuture ? '·' : day.completedCount}</strong>
              </div>
            )
          })}
        </div>
      )}
      <div className="metric-list">
        <HistoryMetric
          label="总完成"
          value={`${summary.foundationCompletedCount}/${summary.foundationPossibleCount} 项次 · ${rate}%`}
        />
        <HistoryMetric label="四项全完成" value={`${summary.foundationFullDaysCount} 天`} />
        {FOUNDATION_ITEMS.map((item) => (
          <HistoryMetric
            key={item.id}
            label={item.label}
            value={`${summary.foundationDaysById[item.id]}/${summary.elapsedDaysCount} 天`}
          />
        ))}
      </div>

      <div className="activity-log">
        <div className="activity-log-label">运动</div>
        <div className="metric-list">
          <HistoryMetric label="运动次数" value={`${summary.movementSessionsCount} 次`} />
          <HistoryMetric label="运动时长" value={`${summary.movementTotalMinutes} 分钟`} />
          {summary.movementByType.map((type) => (
            <HistoryMetric
              key={type.typeId}
              // Type names are shown as written (Zumba, not ZUMBA).
              keepCase
              label={movementTypeLabel(type.typeId)}
              value={type.sessionsCount > 0 ? `${type.sessionsCount} 次 · ${type.totalMinutes} 分钟` : '—'}
            />
          ))}
        </div>
      </div>

      <div className="activity-log">
        <div className="activity-log-label">节律与习惯</div>
        <div className="metric-list">
          <HistoryMetric label="Rhythm total" value={`${summary.totalRhythmMinutes} min`} />
          <HistoryMetric label="Days with rhythm" value={`${summary.rhythmDaysCount}`} />
          <HistoryMetric label="Days with strength" value={`${summary.strengthDaysCount}`} />
          <HistoryMetric label="Mindful eating days" value={`${summary.mindfulEatingDaysCount}`} />
          <HistoryMetric label="Early sleep days" value={`${summary.earlySleepDaysCount}`} />
        </div>
      </div>
    </Card>
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
  dataPanel: ReactNode
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
          <button
            type="button"
            className={`chip${props.section === 'data' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('data')}
          >
            数据与备份
          </button>
        </div>
      </Card>

      {props.section === 'data' ? (
        props.dataPanel
      ) : props.section === 'habits' ? (
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


function HistoryMetric({ label, value, keepCase = false }: { label: string; value: string; keepCase?: boolean }) {
  return (
    <div className={`metric-row${keepCase ? ' keep-case' : ''}`}>
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

type TodayHabit = HabitDefinition & { completedAt: string | null; captureCount: number | null }

function groupHabitsByCategory(habits: TodayHabit[]) {
  const groups = new Map<string, TodayHabit[]>()
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
