import { useState, type ReactNode } from 'react'

import './styles.css'
import {
  BREATH_MODE_LABELS,
  BREATH_PHASE_LABELS,
  BREATH_ROUND_OPTIONS,
  HABITS,
  RHYTHM_BPM,
  RHYTHM_DURATIONS,
  STRENGTH_ROUTINES,
  formatClockTime,
  formatCountdown,
  formatDurationMinutes,
  formatFullDate,
  getBreathPattern,
  type BreathMode,
  type BreathPhase,
  type StrengthRoutine,
  type TabKey,
  type TodayTimelineEvent,
} from './lib/domain'
import { useHealthRhythmApp } from './lib/state'

function App() {
  const app = useHealthRhythmApp()
  const [selectedRoutineId, setSelectedRoutineId] = useState<StrengthRoutine['id']>('routine-a')

  const selectedTab = app.state.selectedTab
  const selectedRoutine =
    STRENGTH_ROUTINES.find((routine) => routine.id === selectedRoutineId) ?? STRENGTH_ROUTINES[0]
  const activeBreathPattern = getBreathPattern(
    app.state.breath.selectedMode,
    app.state.breath.customPattern,
  )

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
            activePattern={activeBreathPattern}
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
            habits={HABITS.map((habit) => ({
              ...habit,
              completedAt: app.state.today.completionTimesByHabitId[habit.id] ?? null,
            }))}
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

        {selectedTab === 'strength' && (
          <StrengthTab
            routines={STRENGTH_ROUTINES}
            selectedRoutineId={selectedRoutine.id}
            completedExerciseIds={new Set(app.state.strength.completedExerciseIds)}
            onSelectRoutine={setSelectedRoutineId}
            onToggleExercise={app.toggleStrengthExercise}
          />
        )}
      </main>

      <nav className="tab-bar" aria-label="Main">
        {([
          ['rhythm', 'Rhythm'],
          ['breath', 'Breath'],
          ['today', 'Today'],
          ['history', 'History'],
          ['strength', 'Strength'],
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
      <Card>
        <div className="hero-metric">
          <span className="eyebrow">Fixed tempo</span>
          <strong>{props.bpm} BPM</strong>
          <p>Steady support for indoor rhythmic walking or slow jogging.</p>
        </div>

        <div className="chip-row" role="group" aria-label="Rhythm duration">
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

        <div className="status-panel">
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

      <Card>
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
                <p>Started at {formatClockTime(entry.startAt)} and logged {formatDurationMinutes(entry.durationSeconds)}.</p>
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
  customPattern: { inhale: number; hold: number; exhale: number; endHold: number }
  activePattern: { inhale: number; hold: number; exhale: number; endHold: number }
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
    pattern: { inhale: number; hold: number; exhale: number; endHold: number }
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
      <Card>
        <SectionHeader
          title="Breath practice"
          subtitle="Four calm phases with short cues at each transition."
        />

        <div className="chip-row" role="group" aria-label="Breath mode">
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

        <div className="status-panel">
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

        <div className="chip-row" role="group" aria-label="Breath rounds">
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

        <PatternPreview pattern={props.activePattern} />

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

      <Card>
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
                  {entry.pattern.exhale}-{entry.pattern.endHold} · {formatDurationMinutes(entry.totalDurationSeconds)}.
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
  habits: { id: string; title: string; detail: string; completedAt: string | null }[]
  timelineEvents: TodayTimelineEvent[]
  onToggleHabit: (habitId: 'mindfulEating' | 'earlySleep') => void
}

function TodayTab(props: TodayTabProps) {
  return (
    <div className="page-grid">
      <Card>
        <SectionHeader title="Day at a glance" subtitle={props.currentDayLabel} />

        <div className="summary-grid">
          <SummaryMetric title="Rhythm" value={`${props.rhythmTotalMinutes} min`} note="Logged today" />
          <SummaryMetric
            title="Breath"
            value={`${props.breathSessions} session${props.breathSessions === 1 ? '' : 's'}`}
            note={`${props.breathRounds} rounds`}
          />
          <SummaryMetric title="Strength" value={props.strengthSummary} note="Current day progress" />
          <SummaryMetric title="Habits" value={`${props.habitCompletionCount} of ${props.habits.length}`} note="Completed today" />
        </div>
      </Card>

      <Card>
        <SectionHeader
          title="Habit actions"
          subtitle="Mark the habits that matter today without changing the rest of the page."
        />

        <div className="stack-list">
          {props.habits.map((habit) => (
            <button
              key={habit.id}
              className={`habit-row${habit.completedAt ? ' is-complete' : ''}`}
              type="button"
              onClick={() => props.onToggleHabit(habit.id as 'mindfulEating' | 'earlySleep')}
            >
              <div>
                <strong>{habit.title}</strong>
                <p>{habit.detail}</p>
              </div>
              <div className="habit-meta">
                <span>{habit.completedAt ? 'Done' : 'Tap to mark'}</span>
                {habit.completedAt && <small>{formatClockTime(habit.completedAt)}</small>}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionHeader title="Daily timeline" subtitle="A simple picture of what happened today, in order." />

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
      <Card>
        <SectionHeader
          title="Selected day"
          subtitle="Look back without turning the app into a full dashboard."
        />

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
          <HistoryMetric label="Mindful eating" value={props.dailySummary.mindfulEatingCompleted ? 'Done' : 'Not done'} />
          <HistoryMetric label="Early sleep" value={props.dailySummary.earlySleepCompleted ? 'Done' : 'Not done'} />
        </div>
      </Card>

      <div className="two-column-cards">
        <Card>
          <SectionHeader title="This week" subtitle="Simple review, no charts." />
          <div className="metric-list">
            <HistoryMetric label="Rhythm total" value={`${props.weekSummary.totalRhythmMinutes} min`} />
            <HistoryMetric label="Days with rhythm" value={`${props.weekSummary.rhythmDaysCount}`} />
            <HistoryMetric label="Days with strength" value={`${props.weekSummary.strengthDaysCount}`} />
            <HistoryMetric label="Mindful eating days" value={`${props.weekSummary.mindfulEatingDaysCount}`} />
            <HistoryMetric label="Early sleep days" value={`${props.weekSummary.earlySleepDaysCount}`} />
          </div>
        </Card>

        <Card>
          <SectionHeader title="This month" subtitle="One quiet monthly snapshot." />
          <div className="metric-list">
            <HistoryMetric label="Rhythm total" value={`${props.monthSummary.totalRhythmMinutes} min`} />
            <HistoryMetric label="Days with rhythm" value={`${props.monthSummary.rhythmDaysCount}`} />
            <HistoryMetric label="Days with strength" value={`${props.monthSummary.strengthDaysCount}`} />
            <HistoryMetric label="Mindful eating days" value={`${props.monthSummary.mindfulEatingDaysCount}`} />
            <HistoryMetric label="Early sleep days" value={`${props.monthSummary.earlySleepDaysCount}`} />
          </div>
        </Card>
      </div>
    </div>
  )
}

interface StrengthTabProps {
  routines: StrengthRoutine[]
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
      <Card>
        <SectionHeader
          title="Routine switcher"
          subtitle="Keep the current calm A/B structure while staying easy to use on phone and desktop."
        />

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

      <Card>
        <SectionHeader
          title={selectedRoutine.title}
          subtitle={`${selectedRoutine.exercises.filter((exercise) => props.completedExerciseIds.has(exercise.id)).length} of ${selectedRoutine.exercises.length} complete today`}
        />

        <div className="exercise-stack">
          {selectedRoutine.exercises.map((exercise) => {
            const isDone = props.completedExerciseIds.has(exercise.id)
            return (
              <button
                key={exercise.id}
                className={`exercise-card${isDone ? ' is-complete' : ''}`}
                type="button"
                onClick={() => props.onToggleExercise(exercise.id)}
              >
                <div className="exercise-card-header">
                  <strong>{exercise.name}</strong>
                  <span>{isDone ? 'Done' : 'Tap to mark'}</span>
                </div>
                <p>{exercise.reps}</p>
                <small>{exercise.caution}</small>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <section className="card">{children}</section>
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      <p>{subtitle}</p>
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

function SummaryMetric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="summary-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
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

function PatternPreview({
  pattern,
}: {
  pattern: { inhale: number; hold: number; exhale: number; endHold: number }
}) {
  return (
    <div className="pattern-preview">
      <span>Inhale {pattern.inhale}</span>
      <span>Hold {pattern.hold}</span>
      <span>Exhale {pattern.exhale}</span>
      <span>End hold {pattern.endHold}</span>
    </div>
  )
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
  }
}

function tabNote(tab: TabKey) {
  switch (tab) {
    case 'rhythm':
      return 'Fixed 180 BPM with simple elapsed logging.'
    case 'breath':
      return 'Four calm phases with presets and one custom mode.'
    case 'today':
      return 'A simple picture of what happened today, in order.'
    case 'history':
      return 'Selected-day review plus quiet week and month summaries.'
    case 'strength':
      return 'Gentle A/B routines with large, easy exercise cards.'
  }
}

export default App
