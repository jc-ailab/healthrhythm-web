import { dayAsState, eventTimeLabel } from './lib/v31'
import { buildTodayTimeline } from './lib/state'
import { ActivityTimeline, JournalComposer, DominoHabitPage, DominoManager, HistoryActivityPanel } from './V31Panels'
import { useState, type ReactNode } from 'react'

import './styles.css'
import { HABIT_GROUPS, FREQUENCY_LABELS, MODE_LABELS, habitMode, habitGroup, completedHabitIds, coreExercises, exercisePrescription, type HabitGroup, type RecordingMode, type HabitFrequency } from './lib/v3'
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
} from './lib/state'

type LibrarySection = 'habits' | 'exercises' | 'routines' | 'data' | 'blocks'

type RoutineDraft = {
  id?: string
  name: string
  enabled: boolean
  isBuiltIn?: boolean
}

type HabitDraft = {
  group?: HabitGroup
  recordingMode?: RecordingMode
  frequency?: HabitFrequency
  id?: string
  name: string
  category: string
  note: string
  enabled: boolean
  showOnToday: boolean
  isBuiltIn?: boolean
}

type ExerciseDraft = {
  routineIds?: string[]
  dailyCore?: boolean
  trying?: boolean
  foundationId?: FoundationItemId
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
  group: '每日习惯', recordingMode: 'single', frequency: 'daily',
  name: '',
  category: '',
  note: '',
  enabled: true,
  showOnToday: true,
}

const EMPTY_EXERCISE_DRAFT: ExerciseDraft = {
  dailyCore: false, trying: true, routineIds: [],
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

  const habitCompletionCount = completedHabitIds(app.state.today.completionTimesByHabitId, app.state.today.eventsByHabitId).length
  const openManagement = (section: LibrarySection) => { setLibrarySection(section); app.selectTab('library') }
  const completedExerciseIds = new Set([...app.state.strength.completedExerciseIds, ...Object.keys(app.state.today.foundationCompletedAt)])
  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">HealthRhythm Web</p>
          <h1>{tabTitle(selectedTab)}</h1>
        </div>
        <button className="management-entry" type="button" onClick={() => selectedTab === 'library' ? app.selectTab('today') : openManagement('habits')}>{selectedTab === 'library' ? '返回今日' : '管理'}</button>
      </header>

      {app.storageNotice && (
        <div className="storage-notice" role="status">
          <p>{app.storageNotice.message}</p>
          {app.storageNotice.kind !== 'unprotected' && (
            <button type="button" onClick={app.dismissStorageNotice}>知道了</button>
          )}
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
          <TodayTab currentDayLabel={formatFullDate(new Date())} rhythmTotalMinutes={app.rhythmTotalMinutesToday}
            breathSessions={app.breathTotalSessionsToday} breathRounds={app.breathTotalRoundsToday}
            strengthSummary={app.strengthSummaryToday} habitCompletionCount={habitCompletionCount}
            habitCaptureCount={Object.values(app.state.today.eventsByHabitId).reduce((sum, captures) => sum + (captures?.length ?? 0), 0)}
            timelineEvents={app.todayTimeline} movementSessions={app.state.today.movementSessions} app={app} />
        )}
        {selectedTab === 'habit' && (
          <DominoHabitPage app={app} onManage={() => openManagement('habits')} onManageBlocks={() => openManagement('blocks')} />
        )}

        {selectedTab === 'history' && (
          <HistoryTab
            app={app}
            selectedDayKey={app.selectedHistoryDayKey}
            maxDayKey={app.state.currentDayKey}
            habits={app.habitLibrary}
            exercises={app.exerciseLibrary}
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

        {selectedTab === 'strength' && (
          <StrengthTab
            routines={app.strengthRoutines}
            selectedRoutineId={selectedRoutine?.id ?? ''}
            completedExerciseIds={completedExerciseIds}
            exercises={app.exerciseLibrary}
            onManage={() => openManagement('routines')}
            onEditExercise={(exercise) => { setExerciseDraft({ ...exercise, routineIds: app.strengthRoutineLibrary.filter((routine) => routine.exercises.some((item) => item.exerciseId === exercise.id)).map((routine) => routine.id) }); openManagement('exercises') }}
            onSelectRoutine={setSelectedRoutineId}
            onToggleExercise={app.toggleStrengthExercise}
          />
        )}

        {selectedTab === 'library' && (
          <LibraryTab
            section={librarySection}
            blocksPanel={<DominoManager app={app} onAddHabit={() => { setHabitDraft(EMPTY_HABIT_DRAFT); openManagement('habits') }} />}
            dataPanel={
              <DataBackupSection state={app.state} canPersist={app.canPersist} canRecover={app.canRecover} session={app.persistenceSession} onReplace={app.replaceAppState} />
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
                ...habit,
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
                ...habitDraft,
                id: habitDraft.id ?? makeLocalId('habit'),
                name: habitDraft.name.trim(),
                category: habitDraft.category.trim() || '其他',
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
                ...exercise,
                routineIds: app.strengthRoutineLibrary.filter((routine) => routine.exercises.some((item) => item.exerciseId === exercise.id)).map((routine) => routine.id),
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
              const id = exerciseDraft.id ?? makeLocalId('exercise')
              const { routineIds, ...definition } = exerciseDraft
              app.saveExercise({
                ...definition,
                id,
                name: exerciseDraft.name.trim(),
                category: exerciseDraft.category.trim() || '其他',
                description: exerciseDraft.description.trim(),
                caution: exerciseDraft.caution.trim(),
                suggestedVolume: exerciseDraft.suggestedVolume.trim(),
                suggestedSets: exerciseDraft.suggestedSets.trim(),
                estimatedTime: exerciseDraft.estimatedTime.trim(),
                enabled: exerciseDraft.enabled,
                isBuiltIn: exerciseDraft.isBuiltIn,
              })
              if (routineIds) {
                for (const routine of app.strengthRoutineLibrary) {
                  const included = routine.exercises.some((item) => item.exerciseId === id)
                  if (routineIds.includes(routine.id) && !included) app.addExerciseToRoutine(routine.id, id)
                  if (!routineIds.includes(routine.id) && included) app.saveStrengthRoutine({ ...routine, exercises: routine.exercises.filter((item) => item.exerciseId !== id) })
                }
              }
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

      <nav className="tab-bar" aria-label="主导航">
        {([
          ['today', '今日'],
          ['rhythm', '节律'],
          ['breath', '呼吸'],
          ['strength', '力量'],
          ['habit', '习惯'],
          ['history', '历史'],
        ] as [TabKey, string][]).map(([tab, label]) => (
          <button
            key={tab}
            className={`tab-button${selectedTab === tab ? ' is-active' : ''}`}
            type="button"
            aria-current={selectedTab === tab ? 'page' : undefined}
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
  habitCaptureCount: number
  movementTotalMinutes: number
}
function TodaySummaryCompact(props: TodaySummaryCompactProps) {
  return <div className="today-summary-strip">
    <div className="today-summary-item"><span>节律</span><strong>{props.rhythmTotalMinutes} 分钟</strong></div>
    <div className="today-summary-item"><span>呼吸</span><strong>{props.breathSessions} 次 · {props.breathRounds} 轮</strong></div>
    <div className="today-summary-item"><span>力量</span><strong>{props.strengthSummary}</strong></div>
    <div className="today-summary-item"><span>习惯与运动</span><strong>{props.habitCompletionCount} 项 · {props.movementTotalMinutes} 分钟</strong><small>{props.habitCaptureCount} 次捕捉</small></div>
  </div>
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
          <span className="eyebrow">固定节拍</span>
          <strong>{props.bpm} BPM</strong>
        </div>

        <div className="chip-row is-single-line" role="group" aria-label="节律时长">
          {props.durations.map((minutes) => (
            <button
              key={minutes}
              type="button"
              className={`chip${props.selectedDuration === minutes ? ' is-active' : ''}`}
              onClick={() => props.onSelectDuration(minutes)}
              disabled={props.status === 'running' || props.status === 'paused'}
            >
              {minutes} 分钟
            </button>
          ))}
        </div>

        <div className="status-panel status-panel-tight">
          <div>
            <span className="status-label">倒计时</span>
            <strong>{formatCountdown(props.remainingSeconds)}</strong>
          </div>
          <div>
            <span className="status-label">状态</span>
            <strong>{rhythmStatusLabel(props.status)}</strong>
          </div>
        </div>

        <ToggleRow
          label="节拍声音"
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
            结束
          </button>
        </div>
      </Card>

      <Card className="card-compact">
        <SectionHeader title="今日记录" />
        {props.entriesToday.length === 0 ? (
          <EmptyState text="今天还没有节律记录。" />
        ) : (
          <div className="event-stream">
            {props.entriesToday.map((entry) => (
              <div key={entry.id} className="event-row">
                <span className="event-time">{formatClockTime(entry.startAt)}</span>
                <span className="event-title">节律</span>
                <span className="event-summary">{Math.round(entry.durationSeconds / 6) / 10} 分钟</span>
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
        <div className="chip-row is-single-line chip-row-breath-mode" role="group" aria-label="呼吸模式">
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
              ['inhale', '吸气'],
              ['hold', '屏息'],
              ['exhale', '呼气'],
              ['endHold', '末段屏息'],
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
            <span className="status-label">阶段</span>
            <strong>{BREATH_PHASE_LABELS[props.currentPhase]}</strong>
          </div>
          <div>
            <span className="status-label">倒计时</span>
            <strong>{props.phaseRemainingSeconds}s</strong>
          </div>
          <div>
            <span className="status-label">轮次</span>
            <strong>
              {props.status === 'completed'
                ? `${props.completedRounds} / ${props.selectedRounds}`
                : `${Math.min(props.currentRound, props.selectedRounds)} / ${props.selectedRounds}`}
            </strong>
          </div>
        </div>

        <div className="chip-row is-single-line chip-row-compact" role="group" aria-label="呼吸轮数">
          {Array.from(BREATH_ROUND_OPTIONS).map((rounds) => (
            <button
              key={rounds}
              type="button"
              className={`chip${props.selectedRounds === rounds ? ' is-active' : ''}`}
              onClick={() => props.onSelectRounds(rounds)}
              disabled={props.status === 'running' || props.status === 'paused'}
            >
              {rounds} 轮
            </button>
          ))}
        </div>

        <ToggleRow label="声音提示" isEnabled={props.isSoundEnabled} onToggle={props.onSoundToggle} />

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
            结束
          </button>
        </div>
      </Card>

      <Card className="card-compact">
        <SectionHeader title="今日记录" />
        {props.entriesToday.length === 0 ? (
          <EmptyState text="今天还没有呼吸记录。" />
        ) : (
          <div className="event-stream">
            {props.entriesToday.map((entry) => (
              <div key={entry.id} className="event-row">
                <span className="event-time">{formatClockTime(entry.startAt)}</span>
                <span className="event-title">呼吸</span>
                <span className="event-summary">{entry.completedRounds} 轮</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

interface TodayTabProps extends Omit<TodaySummaryCompactProps, 'movementTotalMinutes'> {
  app: import('./lib/state').HealthRhythmViewModel
  currentDayLabel: string
  timelineEvents: TodayTimelineEvent[]
  movementSessions: MovementSession[]
}
function TodayTab(props: TodayTabProps) {
  return <div className="page-grid">
    <Card className="card-compact"><SectionHeader title="今日概览" subtitle={props.currentDayLabel} />
      <TodaySummaryCompact {...props} movementTotalMinutes={props.movementSessions.reduce((total, session) => total + session.durationMinutes, 0)} />
    </Card>
    <Card className="card-compact"><SectionHeader title="今日时间线" />
      <JournalComposer day={props.app.state.currentDayKey} onSave={props.app.saveDailyJournal} />
      {props.timelineEvents.length === 0 ? <EmptyState text="今天还没有记录。" /> : <ActivityTimeline events={props.timelineEvents} day={props.app.state.currentDayKey} onEdit={props.app.editTimelineRecord} />}

    </Card>
  </div>
}
interface HistoryTabProps {
  app: import('./lib/state').HealthRhythmViewModel
  habits: HabitDefinition[]
  exercises: ExerciseDefinition[]
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
            timeLabels={Object.fromEntries(buildTodayTimeline(dayAsState(props.app.state, props.selectedDayKey), props.habits, []).filter((event) => event.kind === 'movement').map((event) => [event.id.replace('movement-', ''), eventTimeLabel(event)]))}
            labels={Object.fromEntries(props.habits.map((habit) => [habit.id, habit.name]))}
            emptyText="这一天没有运动记录。"
            onUpdate={props.onUpdateMovement}
            onDelete={props.onDeleteMovement}
          />
        </div>

        <div className="activity-log">
          <div className="activity-log-label">节律与习惯</div>
          <div className="metric-list">
            <HistoryMetric label="节律时长" value={`${day.rhythmTotalMinutes} 分钟`} />
            <HistoryMetric label="节律次数" value={`${day.rhythmEntriesCount}`} />
            <HistoryMetric
              label="呼吸"
              value={`${day.breathSessionsCount} 次 · ${day.breathRoundsCount} 轮`}
            />
            <HistoryMetric label="力量" value={day.strengthSummary} />
            {day.strengthExerciseIds.map((id) => <HistoryMetric key={id} label={props.exercises.find((exercise) => exercise.id === id)?.name ?? id} value="✓" />)}
            {day.habitRecords.filter((record) => !['mindfulEating', 'earlySleep'].includes(record.id)).map((record) => <HistoryMetric key={record.id} label={props.habits.find((habit) => habit.id === record.id)?.name ?? record.id} value={record.captures > 0 ? `${record.captures}次${record.completed ? ' · 已完成' : ''}` : '已完成'} />)}
            <HistoryMetric
              label="正念饮食"
              value={
                day.mindfulEatingCaptureCount > 0
                  ? `已记录 · ${day.mindfulEatingCaptureCount}次`
                  : day.mindfulEatingCompleted
                    ? '已完成'
                    : '未完成'
              }
            />
            <HistoryMetric label="早睡" value={day.earlySleepCompleted ? '已完成' : '未完成'} />
          </div>
        </div>
      </Card>

      <HistoryActivityPanel state={props.app.state} day={props.selectedDayKey} onEdit={props.app.editTimelineRecord} />
      <div className="two-column-cards">
        <PeriodSummaryCard
          kind="week"
          summary={props.weekSummary}
          labels={Object.fromEntries(props.habits.map((habit) => [habit.id, habit.name]))}
          navigation={props.navigation.week}
          onStep={(delta) => props.onStepPeriod('week', delta)}
          onReset={() => props.onResetPeriod('week')}
        />
        <PeriodSummaryCard
          kind="month"
          summary={props.monthSummary}
          labels={Object.fromEntries(props.habits.map((habit) => [habit.id, habit.name]))}
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

function toMovementDraft(value: MovementFormValue): MovementSessionDraft | null {
  const durationMinutes = parseMovementMinutes(value.durationText)
  if (durationMinutes === null) {
    return null
  }
  return { typeId: value.typeId, durationMinutes, intensity: value.intensity, note: value.note }
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
  labels = {},
  timeLabels = {},
  emptyText,
  onUpdate,
  onDelete,
}: {
  dayKey: string
  sessions: MovementSession[]
  labels?: Record<string, string>
  timeLabels?: Record<string, string>
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
          label={labels[session.typeId]}
          timeLabel={timeLabels[session.id]}
          onUpdate={(draft) => onUpdate(dayKey, session.id, draft)}
          onDelete={() => onDelete(dayKey, session.id)}
        />
      ))}
    </div>
  )
}

function MovementSessionRow({
  session,
  label,
  timeLabel,
  onUpdate,
  onDelete,
}: {
  session: MovementSession
  label?: string
  timeLabel?: string
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
        <span className="event-time">{timeLabel ?? formatClockTime(session.loggedAt)}</span>
        <span className="event-title">{label ?? movementTypeLabel(session.typeId)}</span>
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
  labels = {},
  navigation,
  onStep,
  onReset,
}: {
  kind: 'week' | 'month'
  summary: HistorySummary
  labels?: Record<string, string>
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
              label={labels[type.typeId] ?? movementTypeLabel(type.typeId)}
              value={type.sessionsCount > 0 ? `${type.sessionsCount} 次 · ${type.totalMinutes} 分钟` : '—'}
            />
          ))}
        </div>
      </div>

      <div className="activity-log">
        <div className="activity-log-label">节律与习惯</div>
        <div className="metric-list">
          <HistoryMetric label="习惯完成" value={`${summary.habitCompletionsCount} 项次`} />
          <HistoryMetric label="多次捕捉" value={`${summary.habitCapturesCount} 次`} />
          <HistoryMetric label="完成动作" value={`${summary.strengthCompletionsCount} 项次`} />
          <HistoryMetric label="呼吸记录" value={`${summary.breathSessionsCount} 次`} />
          <HistoryMetric label="节律时长" value={`${summary.totalRhythmMinutes} 分钟`} />
          <HistoryMetric label="节律天数" value={`${summary.rhythmDaysCount}`} />
          <HistoryMetric label="力量天数" value={`${summary.strengthDaysCount}`} />
          <HistoryMetric label="正念饮食天数" value={`${summary.mindfulEatingDaysCount}`} />
          <HistoryMetric label="早睡天数" value={`${summary.earlySleepDaysCount}`} />
        </div>
      </div>
    </Card>
  )
}

interface StrengthTabProps {
  routines: ResolvedStrengthRoutine[]
  selectedRoutineId: string
  completedExerciseIds: Set<string>
  exercises: ExerciseDefinition[]
  onSelectRoutine: (id: string) => void
  onToggleExercise: (id: string) => void
  onManage: () => void
  onEditExercise: (exercise: ExerciseDefinition) => void
}
function StrengthTab(props: StrengthTabProps) {
  const [temporaryIds, setTemporaryIds] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const selected = props.routines.find((routine) => routine.id === props.selectedRoutineId) ?? props.routines[0]
  const core = coreExercises(props.exercises)
  const temporary = props.exercises.filter((exercise) => temporaryIds.includes(exercise.id) && !selected?.exercises.some((item) => item.id === exercise.id))
  const routineExercises = Array.from(new Map([...(selected?.exercises ?? []), ...temporary].map((exercise) => [exercise.id, exercise])).values())
  const tiles = (exercises: (ExerciseDefinition | import('./lib/domain').ResolvedRoutineExercise)[]) => <div className="exercise-grid">
    {exercises.map((exercise) => <div key={exercise.id} className="strength-item">
      <button type="button" className={`exercise-tile${props.completedExerciseIds.has(exercise.id) ? ' is-complete' : ''}`} disabled={!exercise.enabled}
        aria-pressed={props.completedExerciseIds.has(exercise.id)} onClick={() => props.onToggleExercise(exercise.id)}>
        <strong>{props.completedExerciseIds.has(exercise.id) ? '✓ ' : ''}{exercise.name}</strong>
        <span>{exercisePrescription(exercise) || (props.completedExerciseIds.has(exercise.id) ? '点按撤销' : '点按完成')}</span>
      </button>
      <details className="exercise-options"><summary>详情 / 编辑</summary><p>{exercise.description} {exercise.caution}</p><button type="button" className="secondary-button" onClick={() => { const definition = props.exercises.find((item) => item.id === exercise.id); if (definition) props.onEditExercise(definition) }}>编辑处方</button>
        {temporaryIds.includes(exercise.id) && <button type="button" className="secondary-button" onClick={() => setTemporaryIds(temporaryIds.filter((id) => id !== exercise.id))}>移出临时列表</button>}
      </details>
    </div>)}
  </div>
  return <div className="page-grid">
    <Card className="card-compact"><SectionHeader title="每日核心训练" subtitle={`${core.filter((exercise) => props.completedExerciseIds.has(exercise.id)).length}/${core.length} 项`} />{core.length ? tiles(core) : <EmptyState text="在管理中选择核心动作。" />}</Card>
    <Card className="card-compact"><div className="compact-toolbar"><h2>训练组合</h2><button type="button" className="secondary-button" onClick={props.onManage}>管理组合</button></div>
      <div className="chip-row">{props.routines.map((routine) => <button key={routine.id} type="button" className={`chip${selected?.id === routine.id ? ' is-active' : ''}`} onClick={() => { props.onSelectRoutine(routine.id); setTemporaryIds([]) }}>{routine.name}</button>)}</div>
      {selected && <p className="activity-log-label">{routineExercises.filter((exercise) => props.completedExerciseIds.has(exercise.id)).length}/{routineExercises.length} 项</p>}
      {tiles(routineExercises)}
      <button type="button" className="secondary-button temporary-add" onClick={() => setAdding(!adding)}>＋ 临时加练</button>
      {adding && <select aria-label="临时加练动作" value="" onChange={(event) => { if (event.target.value) { setTemporaryIds([...temporaryIds, event.target.value]); setAdding(false) } }}><option value="">选择动作</option>{props.exercises.filter((exercise) => exercise.enabled && !routineExercises.some((item) => item.id === exercise.id)).map((exercise) => <option key={exercise.id} value={exercise.id}>{exercise.name}{exercise.trying ? ' · 尝试中' : ''}</option>)}</select>}
    </Card>
  </div>
}

interface LibraryTabProps {
  blocksPanel: ReactNode
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
        <SectionHeader title="管理" />

        <div className="chip-row" role="group" aria-label="管理分类">
          <button
            type="button"
            className={`chip${props.section === 'habits' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('habits')}
          >
            习惯与活动
          </button>
          <button
            type="button"
            className={`chip${props.section === 'exercises' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('exercises')}
          >
            动作
          </button>
          <button
            type="button"
            className={`chip${props.section === 'routines' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('routines')}
          >
            训练组合
          </button>
          <button
            type="button"
            className={`chip${props.section === 'data' ? ' is-active' : ''}`}
            onClick={() => props.onSelectSection('data')}
          >
            数据与备份
          </button>
          <button type="button" className={`chip${props.section === 'blocks' ? ' is-active' : ''}`} onClick={() => props.onSelectSection('blocks')}>管理模块</button>
        </div>
      </Card>

      {props.section === 'blocks' ? props.blocksPanel : props.section === 'data' ? (
        props.dataPanel
      ) : props.section === 'habits' ? (
        <>
          {props.habitDraft && <Card className="library-editor">
            <SectionHeader
              title={props.habitDraft?.id ? '编辑习惯 / 活动' : '新增习惯 / 活动'}
              subtitle=""
            />

            {props.habitDraft ? (
              <>
                <div className="form-grid">
                  <label className="field-card">
                    <span>名称</span>
                    <input
                      type="text"
                      value={props.habitDraft.name}
                      onChange={(event) => props.onHabitDraftChange({ name: event.target.value })}
                    />
                  </label>
                  <label className="field-card">
                    <span>分类</span>
                    <input
                      type="text"
                      value={props.habitDraft.category}
                      onChange={(event) =>
                        props.onHabitDraftChange({ category: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card"><span>分组</span><select aria-label="分组" value={props.habitDraft.group ?? '每日习惯'} onChange={(e) => props.onHabitDraftChange({ group: e.target.value as HabitGroup })}>{HABIT_GROUPS.map((group) => <option key={group}>{group}</option>)}</select></label>
                  <label className="field-card"><span>记录方式</span><select aria-label="记录方式" value={props.habitDraft.recordingMode ?? 'single'} onChange={(e) => props.onHabitDraftChange({ recordingMode: e.target.value as RecordingMode })}>{Object.entries(MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="field-card"><span>频率</span><select aria-label="频率" value={props.habitDraft.frequency ?? 'daily'} onChange={(e) => props.onHabitDraftChange({ frequency: e.target.value as HabitFrequency })}>{Object.entries(FREQUENCY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label className="field-card field-card-wide">
                    <span>备注</span>
                    <textarea
                      rows={2}
                      value={props.habitDraft.note}
                      onChange={(event) => props.onHabitDraftChange({ note: event.target.value })}
                    />
                  </label>
                </div>

                <div className="inline-toggle-grid">
                  <ToggleRow
                    label="启用"
                    isEnabled={props.habitDraft.enabled}
                    onToggle={(value) => props.onHabitDraftChange({ enabled: value })}
                  />
                  <ToggleRow
                    label="显示在习惯页"
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
                    保存
                  </button>
                  <button className="secondary-button" type="button" onClick={props.onCancelHabit}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              <EmptyState text="选择项目编辑，或新增项目。" />
            )}
          </Card>}

          <Card>
            <SectionHeader
              title="习惯与活动"
              subtitle="管理名称、分组与记录方式。"
            />

            <div className="library-toolbar">
              <button className="primary-button" type="button" onClick={props.onAddHabit}>
                新增习惯 / 活动
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
                    <p>{`${habitGroup(habit)} · ${MODE_LABELS[habitMode(habit)]} · ${FREQUENCY_LABELS[habit.frequency ?? 'daily']}`}</p>
                  </div>
                  <div className="badge-row">
                    <span className={`badge${habit.enabled ? ' is-on' : ''}`}>
                      {habit.enabled ? '启用' : '停用'}
                    </span>
                    <span className={`badge${habit.showOnToday ? ' is-on' : ''}`}>
                      {habit.showOnToday ? '显示' : '隐藏'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
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
          {props.exerciseDraft && <Card className="library-editor">
            <SectionHeader
              title={props.exerciseDraft?.id ? '编辑动作' : '新增动作'}
              subtitle=""
            />

            {props.exerciseDraft ? (
              <>
                <div className="form-grid">
                  <label className="field-card">
                    <span>名称</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.name}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>分类</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.category}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ category: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>次数 / 持续时间</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.suggestedVolume}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ suggestedVolume: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>组数</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.suggestedSets}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ suggestedSets: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span>预计用时</span>
                    <input
                      type="text"
                      value={props.exerciseDraft.estimatedTime}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ estimatedTime: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card field-card-wide">
                    <span>动作说明</span>
                    <textarea
                      rows={2}
                      value={props.exerciseDraft.description}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ description: event.target.value })
                      }
                    />
                  </label>
                  <label className="field-card field-card-wide">
                    <span>技巧 / 注意事项</span>
                    <textarea
                      rows={2}
                      value={props.exerciseDraft.caution}
                      onChange={(event) =>
                        props.onExerciseDraftChange({ caution: event.target.value })
                      }
                    />
                  </label>
                </div>

                <div className="inline-toggle-grid">
                  <ToggleRow
                    label="启用"
                    isEnabled={props.exerciseDraft.enabled}
                    onToggle={(value) => props.onExerciseDraftChange({ enabled: value })}
                  />
                </div>

                <div className="inline-toggle-grid">
                  <ToggleRow label="每日核心训练" isEnabled={Boolean(props.exerciseDraft.dailyCore)} onToggle={(dailyCore) => props.onExerciseDraftChange({ dailyCore })} />
                  <ToggleRow label="尝试中" isEnabled={Boolean(props.exerciseDraft.trying)} onToggle={(trying) => props.onExerciseDraftChange({ trying })} />
                </div>
                <div className="routine-assignments"><span>所属训练组合</span>
                  {props.routines.map((routine) => <label key={routine.id}><input type="checkbox" checked={props.exerciseDraft?.routineIds?.includes(routine.id) ?? false}
                    onChange={(event) => { const ids = props.exerciseDraft?.routineIds ?? []; props.onExerciseDraftChange({ routineIds: event.target.checked ? [...ids, routine.id] : ids.filter((id) => id !== routine.id) }) }} />{routine.name}</label>)}
                </div>
                <div className="action-row">
                  <button
                    className="primary-button"
                    type="button"
                    onClick={props.onSaveExercise}
                    disabled={!props.exerciseDraft.name.trim()}
                  >
                    保存
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={props.onCancelExercise}
                  >
                    取消
                  </button>
                </div>
              </>
            ) : (
              <EmptyState text="选择动作编辑，或新增动作。" />
            )}
          </Card>}

          <Card>
            <SectionHeader
              title="动作库"
              subtitle="可加入核心训练或多个训练组合。"
            />

            <div className="library-toolbar">
              <button className="primary-button" type="button" onClick={props.onAddExercise}>
                新增动作
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
                    <p>{exercise.caution || exercise.description || ''}</p>
                  </div>
                  <div className="badge-row">
                    <span className="badge">{exercise.category}</span>{exercise.trying && <span className="badge">尝试中</span>}{exercise.dailyCore && <span className="badge">每日核心</span>}
                    <span className={`badge${exercise.enabled ? ' is-on' : ''}`}>
                      {exercise.enabled ? '启用' : '停用'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
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

  const availableExercises = props.exercises.filter((exercise) => exercise.enabled && !editingRoutine?.exercises.some((item) => item.exerciseId === exercise.id))

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
          title="训练组合"
          subtitle=""
        />

        <div className="library-toolbar">
          <button className="primary-button" type="button" onClick={props.onAddRoutine}>
            新增组合
          </button>
        </div>

        {props.routines.length === 0 ? (
          <EmptyState text="还没有训练组合。" />
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
                  <p>{routine.exercises.length} 个动作</p>
                </div>
                <div className="badge-row">
                  {routine.isBuiltIn && <span className="badge">内置</span>}
                  <span className={`badge${routine.enabled ? ' is-on' : ''}`}>
                    {routine.enabled ? '启用' : '停用'}
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
            title={props.routineDraft.id ? '编辑组合' : '新增组合'}
          />

          <div className="form-grid">
            <label className="field-card field-card-wide">
              <span>组合名称</span>
              <input
                type="text"
                value={props.routineDraft.name}
                placeholder="例如：晨间训练"

                onChange={(e) => props.onRoutineDraftChange({ name: e.target.value })}
              />
            </label>
          </div>

          <div className="inline-toggle-grid" style={{ marginTop: 10 }}>
            <ToggleRow
              label="启用"
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
              保存
            </button>
            <button className="secondary-button" type="button" onClick={props.onCancelRoutine}>
              取消
            </button>
          </div>
        </Card>
      )}

      {editingRoutine && (
        <Card>
          <SectionHeader
            title={editingRoutine.name}
            subtitle="调整动作顺序与处方。"
          />

          {editingRoutine.exercises.length === 0 ? (
            <EmptyState text="在下方添加动作。" />
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
                        aria-label="上移"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="routine-move-btn"
                        onClick={() => props.onMoveRoutineExercise(editingRoutine.id, index, 'down')}
                        disabled={index === editingRoutine.exercises.length - 1}
                        aria-label="下移"
                      >
                        ↓
                      </button>
                    </div>

                    <div className="routine-exercise-body">
                      <strong>{def?.name ?? re.exerciseId}</strong>
                      {def && <span className="routine-exercise-meta">{def.category}</span>}

                      <details className="routine-exercise-overrides">
                        <summary>组合处方</summary>
                        <div className="routine-override-grid">
                          <label className="field-card">
                            <span>组数</span>
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
                            <span>次数 / 训练量</span>
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
                            <span>时长</span>
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
                      aria-label="从组合移出"
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
                aria-label="选择加入组合的动作"
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
                添加
              </button>
            </div>
          )}

          {availableExercises.length === 0 && (
            <EmptyState text="请先在动作库启用动作。" />
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

function rhythmPrimaryLabel(status: string) {
  switch (status) {
    case 'running':
      return '暂停'
    case 'paused':
      return '继续'
    default:
      return '开始'
  }
}

function rhythmStatusLabel(status: string) {
  switch (status) {
    case 'running':
      return '进行中'
    case 'paused':
      return '已暂停'
    case 'completed':
      return '已记录'
    default:
      return '就绪'
  }
}

function breathPrimaryLabel(status: string) {
  switch (status) {
    case 'running':
      return '暂停'
    case 'paused':
      return '继续'
    default:
      return '开始'
  }
}

function tabTitle(tab: TabKey) {
  switch (tab) {
    case 'rhythm':
      return '节律'
    case 'breath':
      return '呼吸'
    case 'today':
      return '今日'
    case 'history':
      return '历史'
    case 'strength':
      return '力量'
    case 'habit':
      return '习惯'
    case 'library':
      return '管理'
  }
}

export default App
