import { useState } from 'react'
import { makeLocalId, parseMovementMinutes, MOVEMENT_DURATION_PRESETS, MOVEMENT_MAX_MINUTES, type AppState, type HabitDefinition, type TodayTimelineEvent, type MovementSessionDraft } from './lib/domain'
import { habitMode } from './lib/v3'
import { dayRecord, dayAsState, dominoProgress, occurrenceDay, doneInDay, eventInfo, eventTimeLabel, validInfo, type DominoBlock, type RecordEdit } from './lib/v31'
import { buildTodayTimeline, type HealthRhythmViewModel } from './lib/state'

type EditHandler = HealthRhythmViewModel['editTimelineRecord']
export function ActivityTimeline({ events, day, onEdit }: { events: TodayTimelineEvent[]; day: string; onEdit: EditHandler }) {
  const [editing, setEditing] = useState<TodayTimelineEvent | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<RecordEdit | null>(null)
  return <div className="event-stream">
    {events.map((event) => <details key={event.id} className="event-row">
      <summary className="event-row-summary"><span className="event-time">{eventTimeLabel(event)}</span><span className="event-title">{event.title}</span><span className="event-summary">{event.summary}</span></summary>
      {event.detail && <p className="event-detail">{event.detail}</p>}
      {!event.info && <p className="event-detail">归属：{event.assignedDate} · {event.kind === 'rhythm' || event.kind === 'breath' ? '计时记录；录入时刻未单独记录' : `旧记录；仅保留录入时间 ${new Date(event.timestamp).toLocaleString('zh-CN')}`}</p>}
      {event.info && <p className="event-detail">发生：{event.info.occurredDate} {event.info.occurredTime ? `${event.info.precision === 'approximate' ? '约 ' : ''}${event.info.occurredTime}` : '时间未指定'} · 归属：{event.info.assignedDate}<br />录入于：{event.info.recordedAt ? new Date(event.info.recordedAt).toLocaleString('zh-CN') : '未记录（旧存档）'}</p>}
      {event.info?.note && !event.detail?.includes(event.info.note) && <p className="event-detail">{event.info.note}</p>}
      <button type="button" className="text-button" onClick={() => { setEditing(event); setError(''); setDraft({ ...eventInfo(event), note: event.kind === 'journal' ? event.detail : event.info?.note ?? event.note ?? '', ...(event.kind === 'movement' ? { durationMinutes: Number.parseInt(event.summary) } : {}) }) }}>编辑记录 / 添加备注</button>
      {editing?.id === event.id && draft && <form className="record-editor" onSubmit={(e) => {
        e.preventDefault()
        if (!validInfo(draft)) { setError('请检查日期与时间；时间未指定时请选择未知精度。'); return }
        if (!onEdit(day, event, draft)) { setError('未能修改：日期超出范围、目标日期已有单次记录，或保存已暂停。原记录保留。'); return }
        setEditing(null)
      }}>
        <div className="form-grid">
          <label className="field-card"><span>发生日期</span><input required type="date" value={draft.occurredDate} onChange={(e) => setDraft({ ...draft, occurredDate: e.target.value })} /></label>
          <label className="field-card"><span>发生时间（可留空）</span><input type="time" value={draft.occurredTime ?? ''} onChange={(e) => setDraft({ ...draft, occurredTime: e.target.value || null, precision: e.target.value ? draft.precision === 'unknown' ? 'approximate' : draft.precision : 'unknown' })} /></label>
          <label className="field-card"><span>时间精度</span><select value={draft.precision} onChange={(e) => setDraft({ ...draft, precision: e.target.value as RecordEdit['precision'], ...(e.target.value === 'unknown' ? { occurredTime: null } : {}) })}><option value="unknown">时间未指定</option><option value="approximate">大约</option><option value="exact">准确</option></select></label>
          <label className="field-card"><span>归属日期（统计）</span><input required type="date" value={draft.assignedDate} onChange={(e) => setDraft({ ...draft, assignedDate: e.target.value })} /></label>
          {draft.durationMinutes !== undefined && <label className="field-card"><span>时长（分钟）</span><input type="number" min="1" max={MOVEMENT_MAX_MINUTES} required value={draft.durationMinutes} onChange={(e) => setDraft({ ...draft, durationMinutes: Number(e.target.value) })} /></label>}
        </div>
        <label className="field-card"><span>{event.kind === 'journal' ? '今日随记' : '备注（可留空）'}</span><textarea maxLength={2000} rows={2} value={draft.note ?? ''} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
        {error && <p role="alert">{error}</p>}
        <div className="compact-toolbar"><button type="submit" className="primary-button">保存</button><button type="button" className="secondary-button" onClick={() => setEditing(null)}>取消</button></div>
      </form>}
    </details>)}
  </div>
}
export function HistoryActivityPanel({ state, day, onEdit }: { state: AppState; day: string; onEdit: EditHandler }) {
  const record = dayRecord(state, day)
  const events = buildTodayTimeline(dayAsState(state, day), state.library.habits, [])
  return <section className="card card-compact">
    {record.dominoSnapshots?.map((block) => <p key={block.id} className="activity-log-label">{block.name} · {dominoProgress(record, block)}/{block.itemIds.length}</p>)}
    <h2>当日时间线与随记</h2>
    <ActivityTimeline key={day} events={events} day={day} onEdit={onEdit} />
    {!events.length && <p className="empty-state">这一天没有记录。</p>}
  </section>
}
export function JournalComposer({ day, onSave }: { day: string; onSave: HealthRhythmViewModel['saveDailyJournal'] }) {
  const [open, setOpen] = useState(false), [text, setText] = useState(''), [date, setDate] = useState('')
  return <div className="journal-composer">
    <button type="button" className="text-button" onClick={() => setOpen(!open)}>＋ 今日随记</button>
    {open && <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) { onSave(date || day, text); setText(''); setOpen(false) } }}>
      <label className="field-card"><span>日期</span><input required type="date" max={day} value={date || day} onChange={(e) => setDate(e.target.value)} /></label>
      <label className="field-card"><span>今日随记</span><textarea required maxLength={2000} rows={2} value={text} onChange={(e) => setText(e.target.value)} /></label>
      <button type="submit" className="primary-button" disabled={!text.trim()}>保存</button>
    </form>}
  </div>
}
interface HabitPageProps { app: HealthRhythmViewModel; onManage: () => void; onManageBlocks: () => void }
export function DominoHabitPage({ app, onManage, onManageBlocks }: HabitPageProps) {
  const [organizing, setOrganizing] = useState(false)
  const blocks = app.state.library.dominoBlocks ?? []
  const assigned = new Set(blocks.flatMap((block) => block.itemIds))
  const habits = app.habitLibrary.filter((habit) => (organizing || habit.enabled && habit.showOnToday) && !assigned.has(habit.id))
  return <div className="page-grid">
    <div className="compact-toolbar"><button type="button" className="secondary-button" onClick={() => setOrganizing(!organizing)}>{organizing ? '完成排序' : '排序与显示'}</button><button type="button" className="secondary-button" onClick={onManageBlocks}>管理模块</button><button type="button" className="secondary-button" onClick={onManage}>新增 / 编辑项目</button></div>
    {blocks.filter((block) => !block.hidden).map((block) => <HabitBlock key={block.id} app={app} block={block} habits={block.itemIds.map((id) => app.habitLibrary.find((habit) => habit.id === id)).filter((habit): habit is HabitDefinition => Boolean(habit))} />)}
    <HabitBlock app={app} organizing={organizing} habits={habits.filter((habit) => habitMode(habit) !== 'duration')} title="日常习惯" />
    <HabitBlock app={app} organizing={organizing} habits={habits.filter((habit) => habitMode(habit) === 'duration')} title="其他运动" />
  </div>
}
function HabitBlock({ app, block, habits, title, organizing = false }: { organizing?: boolean; app: HealthRhythmViewModel; block?: DominoBlock; habits: HabitDefinition[]; title?: string }) {
  const [review, setReview] = useState('')
  const [durationId, setDurationId] = useState<string | null>(null), [minutes, setMinutes] = useState('30')
  const assignedDate = review || app.state.currentDayKey
  const record = dayRecord(app.state, assignedDate)
  const duration = parseMovementMinutes(minutes)
  const log = (habit: HabitDefinition, movement?: MovementSessionDraft) => app.logBlockItem(habit.id, assignedDate, block?.id, movement)
  return <details className="card card-compact domino-block" open>
    <summary>{block?.name ?? title}{block && ` · ${dominoProgress(record, block)}/${block.itemIds.length}`}</summary>
    {block && <div className="block-review">
      {block.assignment === 'next-day-review' && <p className="event-detail">回顾昨晚 · {occurrenceDay(block, assignedDate).slice(5).replace('-', '月')}日</p>}
      <details><summary>{review ? `归属 ${review} · 调整日期` : '补记 / 选择回顾日期'}</summary><label className="field-card"><span>归属日期（睡前回顾取前一晚）</span><input type="date" max={app.state.currentDayKey} value={assignedDate} onChange={(e) => setReview(e.target.value)} /></label><button type="button" className="text-button" onClick={() => setReview('')}>回到今日</button></details>
    </div>}
    <div className="habit-log-list">{habits.map((habit, index) => {
      const mode = habitMode(habit), count = record.habitEvents[habit.id]?.length ?? 0
      const sessions = record.movementSessions.filter((session) => session.typeId === habit.id)
      const done = doneInDay(record, habit.id)
      return <div className="habit-log-item" key={habit.id}>
        <button type="button" className={`habit-log-button${done ? ' is-complete' : ''}`} disabled={organizing || !app.canPersist || !habit.enabled} aria-pressed={mode === 'single' ? done : undefined} onClick={() => {
          if (mode === 'duration') { setDurationId(durationId === habit.id ? null : habit.id); setMinutes(String(app.movementDefaultsFor(habit.id).durationMinutes)) } else log(habit)
        }}><strong>{habit.name}</strong><span>{mode === 'captures' ? `${count}次 · ＋` : mode === 'duration' ? `${sessions.reduce((total, session) => total + session.durationMinutes, 0)} 分钟 · ＋` : done ? '✓ 已完成' : '点按完成'}</span></button>
        {organizing && <div className="habit-order-controls">
          <button type="button" aria-label={`${habit.name}上移`} disabled={index === 0} onClick={() => app.moveLooseHabit(habit.id, -1)}>↑</button>
          <button type="button" aria-label={`${habit.name}下移`} disabled={index === habits.length - 1} onClick={() => app.moveLooseHabit(habit.id, 1)}>↓</button>
          <button type="button" onClick={() => app.saveHabit({ ...habit, enabled: true, showOnToday: !(habit.enabled && habit.showOnToday) })}>{habit.enabled && habit.showOnToday ? '隐藏' : '显示'}</button>
        </div>}
        {durationId === habit.id && <div className="duration-capture"><div className="chip-row">{MOVEMENT_DURATION_PRESETS.map((value) => <button type="button" key={value} className="chip" onClick={() => setMinutes(String(value))}>{value}</button>)}</div>
          <div className="compact-toolbar"><label>分钟 <input aria-label={`${habit.name}分钟`} type="number" min="1" max={MOVEMENT_MAX_MINUTES} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label><button type="button" className="primary-button" disabled={duration === null || !app.canPersist} onClick={() => { if (duration !== null) { log(habit, { typeId: habit.id, durationMinutes: duration }); setDurationId(null) } }}>记录</button></div></div>}
      </div>
    })}</div>
  </details>
}
export function DominoManager({ app, onAddHabit }: { app: HealthRhythmViewModel; onAddHabit: () => void }) {
  const [draft, setDraft] = useState<DominoBlock | null>(null)
  const blocks = app.state.library.dominoBlocks ?? []
  return <section className="card card-compact">
    <h2>管理模块</h2>
    <div className="compact-toolbar"><button type="button" className="secondary-button" onClick={() => setDraft({ id: makeLocalId('domino'), name: '', itemIds: [], assignment: 'same-day', hidden: false })}>新增模块</button><button type="button" className="secondary-button" onClick={onAddHabit}>新增习惯 / 活动</button></div>
    {blocks.map((block, index) => <div className="block-management-row" key={block.id}><button type="button" className="secondary-button" onClick={() => setDraft(structuredClone(block))}>{block.name} · 编辑模块{block.hidden ? '（隐藏）' : ''}</button><button type="button" disabled={index === 0} aria-label={`${block.name}上移`} onClick={() => app.moveDominoBlock(block.id, -1)}>↑</button><button type="button" disabled={index === blocks.length - 1} aria-label={`${block.name}下移`} onClick={() => app.moveDominoBlock(block.id, 1)}>↓</button></div>)}
    {draft && <form className="record-editor" onSubmit={(e) => { e.preventDefault(); app.saveDominoBlock(draft); setDraft(null) }}>
      <label className="field-card"><span>模块名称</span><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="field-card"><span>日期规则</span><select value={draft.assignment} onChange={(e) => setDraft({ ...draft, assignment: e.target.value as DominoBlock['assignment'] })}><option value="same-day">当天发生 / 当天归属</option><option value="next-day-review">回顾前一晚 / 次日归属</option></select></label>
      <label className="check-row"><input type="checkbox" checked={draft.hidden} onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })} />隐藏模块</label>
      {draft.itemIds.map((id, index) => <div className="block-management-row" key={id}><span>{app.habitLibrary.find((habit) => habit.id === id)?.name ?? id}</span><button type="button" aria-label={`${id}上移`} disabled={index === 0} onClick={() => { const ids = [...draft.itemIds]; [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; setDraft({ ...draft, itemIds: ids }) }}>↑</button><button type="button" aria-label={`${id}下移`} disabled={index === draft.itemIds.length - 1} onClick={() => { const ids = [...draft.itemIds]; [ids[index + 1], ids[index]] = [ids[index], ids[index + 1]]; setDraft({ ...draft, itemIds: ids }) }}>↓</button><button type="button" onClick={() => setDraft({ ...draft, itemIds: draft.itemIds.filter((item) => item !== id) })}>移出</button></div>)}
      <label className="field-card"><span>添加项目（已有项目会移入本模块）</span><select value="" onChange={(e) => { if (e.target.value) setDraft({ ...draft, itemIds: [...draft.itemIds, e.target.value] }) }}><option value="">选择项目</option>{app.habitLibrary.filter((habit) => !draft.itemIds.includes(habit.id)).map((habit) => <option value={habit.id} key={habit.id}>{habit.name}</option>)}</select></label>
      <div className="compact-toolbar"><button type="submit" className="primary-button" disabled={!draft.name.trim() || !app.canPersist}>保存</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>取消</button></div>
    </form>}
  </section>
}
