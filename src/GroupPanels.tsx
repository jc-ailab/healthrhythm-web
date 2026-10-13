import { useState } from 'react'
import { makeLocalId, shiftDayKey, MOVEMENT_MAX_MINUTES, MOVEMENT_DURATION_PRESETS, parseMovementMinutes, type MovementSessionDraft } from './lib/domain'
import { availableItems, findGroupSession, refKey, groupProgress, groupItemEnabled, legacyDominoProgress, prescription, type GroupTemplate, type GroupSession, type GroupItem } from './lib/groups'
import { dayRecord, validInfo, type RecordInfo } from './lib/v31'
import type { HealthRhythmViewModel } from './lib/state'

const locations = { habit: '习惯', strength: '力量', rhythm: '节律', breath: '呼吸' }
const kinds = { habit: '习惯 / 运动', exercise: '力量动作', routine: '训练组合', rhythm: '节律', breath: '呼吸' }
type Log = (key: string, movement?: MovementSessionDraft, undo?: boolean, exerciseId?: string) => void
export function GroupItems({ app, items, session, onLog }: { app: HealthRhythmViewModel; items: GroupItem[]; session?: GroupSession; onLog: Log }) {
  const [durationKey, setDurationKey] = useState<string | null>(null), [minutes, setMinutes] = useState('30')
  return <div className="habit-log-list">{items.map((item) => {
    const key = refKey(item), complete = session?.completed.find((entry) => entry.itemKey === key)
    const done = item.kind === 'routine' ? (item.exercises?.length ?? 0) > 0 && complete?.eventIds.length === item.exercises!.length : Boolean(complete?.eventIds.length)
    const mode = item.mode
    return <div className="habit-log-item" key={key}>
      <button type="button" className={`habit-log-button${done ? ' is-complete' : ''}`} disabled={!app.canPersist || !groupItemEnabled(app.state, item) && !complete} aria-pressed={done} onClick={() => {
        if (mode === 'duration' && !done) { setDurationKey(durationKey === key ? null : key); setMinutes(String(app.movementDefaultsFor(item.id).durationMinutes)) }
        else if (done && mode !== 'captures' && item.kind !== 'routine') onLog(key, undefined, true)
        else onLog(key)
      }}><strong>{done ? '✓ ' : ''}{item.name}</strong><span>{mode === 'captures' ? `${complete?.eventIds.length ?? 0}次 · ＋` : item.kind === 'routine' ? `${complete?.eventIds.length ?? 0}/${item.exercises?.length ?? 0} · 打开训练` : item.kind === 'rhythm' || item.kind === 'breath' ? done ? '已记录 · 点按撤销' : '打开计时' : done ? '点按撤销' : mode === 'duration' ? '记录时长' : '点按完成'}</span></button>
      {item.exercises && <p className="event-detail group-prescription">{item.exercises.map((exercise) => `${item.kind === 'routine' ? exercise.name + ' ' : ''}${prescription(exercise)}`).filter(Boolean).join('；')}</p>}
      {(mode === 'captures' || item.kind === 'routine') && complete && <button type="button" className="text-button" disabled={!app.canPersist} onClick={() => onLog(key, undefined, true)}>撤销本次项目</button>}
      {durationKey === key && <div className="duration-capture"><div className="chip-row">{MOVEMENT_DURATION_PRESETS.map((value) => <button type="button" className="chip" key={value} onClick={() => setMinutes(String(value))}>{value}</button>)}</div><div className="compact-toolbar"><label>分钟 <input aria-label={`${item.name}分钟`} type="number" min="1" max={MOVEMENT_MAX_MINUTES} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label><button type="button" className="primary-button" disabled={parseMovementMinutes(minutes) === null || !app.canPersist} onClick={() => { const durationMinutes = parseMovementMinutes(minutes); if (durationMinutes !== null) { onLog(key, { typeId: item.id, durationMinutes }); setDurationKey(null) } }}>记录</button></div></div>}
    </div>
  })}</div>
}
export function GroupList({ app, location, onManage }: { app: HealthRhythmViewModel; location: GroupTemplate['location']; onManage: () => void }) {
  return <><div className="compact-toolbar"><button type="button" className="secondary-button" onClick={onManage}>管理组合</button></div>{app.state.library.groups?.filter((group) => group.location === location && group.enabled && !group.hidden).map((group) => <GroupCard key={group.id} app={app} group={group} />)}</>
}
function GroupCard({ app, group }: { app: HealthRhythmViewModel; group: GroupTemplate }) {
  const [review, setReview] = useState(''), [chosen, setChosen] = useState<string | null>(null), [editingTime, setEditingTime] = useState(false)
  const day = review || app.state.currentDayKey, sessions = dayRecord(app.state, day).groupSessions?.filter((session) => session.groupId === group.id) ?? []
  const session = sessions.find((entry) => entry.id === chosen) ?? sessions.at(-1)
  const items = session?.items ?? group.items.map((ref): GroupItem => availableItems(app.state).find((item) => refKey(item) === refKey(ref)) ?? { ...ref, name: '项目不可用' })
  const legacy = legacyDominoProgress(dayRecord(app.state, day), group.id)
  const occurrence = session?.info.occurredDate
  return <details className="card card-compact domino-block" open><summary>{group.name} · {session ? groupProgress(session) : 0}/{items.length}</summary>
    {legacy && legacy.completed > 0 && <p className="event-detail">旧版当日项目 · {legacy.completed}/{legacy.total}（独立记录保留）</p>}
    {group.assignment === 'next-day-review' && <p className="event-detail">回顾昨晚 · {occurrence ?? shiftDayKey(day, -1)} </p>}
    <div className="block-review"><details><summary>补记 / 选择回顾日期</summary><label className="field-card"><span>计入哪一天</span><input type="date" max={app.state.currentDayKey} value={day} onChange={(e) => { setReview(e.target.value); setChosen(null) }} /></label><button type="button" className="text-button" onClick={() => { setReview(''); setChosen(null) }}>回到今日</button></details></div>
    {sessions.length > 1 && <label className="field-card"><span>本日执行记录</span><select value={session?.id ?? ''} onChange={(e) => setChosen(e.target.value)}>{sessions.map((entry, index) => <option key={entry.id} value={entry.id}>第{index + 1}次 · {groupProgress(entry)}/{entry.items.length}</option>)}</select></label>}
    <GroupItems app={app} items={items} session={session} onLog={(key, movement, undo) => app.recordGroupItem(group.id, day, session?.id ?? null, key, movement, undo)} />
    <div className="compact-toolbar"><button type="button" className="text-button" disabled={!app.canPersist || !session} onClick={() => setEditingTime(!editingTime)}>共享时间 / 添加备注</button><button type="button" className="text-button" disabled={!app.canPersist || !session?.completed.length} onClick={() => { app.startGroupSession(group.id, day); setChosen(null); setEditingTime(false) }}>＋ 再做一次</button></div>
    {editingTime && session && <GroupTimeEditor key={session.id} app={app} session={session} onClose={() => setEditingTime(false)} />}
  </details>
}
export function GroupTimeEditor({ app, session, onClose }: { app: HealthRhythmViewModel; session: GroupSession; onClose: () => void }) {
  const [info, setInfo] = useState<RecordInfo>({ ...session.info }), [error, setError] = useState('')
  return <form className="record-editor" onSubmit={(e) => { e.preventDefault(); if (!validInfo(info) || !app.editGroupRecord(session.id, info)) { setError('无法保存，请检查日期与时间。原记录保留。'); return } onClose() }}>
    <div className="form-grid"><label className="field-card"><span>发生日期</span><input required type="date" value={info.occurredDate} onChange={(e) => setInfo({ ...info, occurredDate: e.target.value })} /></label><label className="field-card"><span>发生时间（可留空）</span><input type="time" value={info.occurredTime ?? ''} onChange={(e) => setInfo({ ...info, occurredTime: e.target.value || null, precision: e.target.value ? info.precision === 'unknown' ? 'approximate' : info.precision : 'unknown' })} /></label><label className="field-card"><span>时间精度</span><select value={info.precision} onChange={(e) => setInfo({ ...info, precision: e.target.value as RecordInfo['precision'], ...(e.target.value === 'unknown' ? { occurredTime: null } : {}) })}><option value="unknown">时间未指定</option><option value="approximate">大约</option><option value="exact">准确</option></select></label><label className="field-card"><span>计入哪一天</span><input required type="date" max={app.state.currentDayKey} value={info.assignedDate} onChange={(e) => setInfo({ ...info, assignedDate: e.target.value })} /></label></div>
    <label className="field-card"><span>组合备注（可留空）</span><textarea rows={2} maxLength={2000} value={info.note ?? ''} onChange={(e) => setInfo({ ...info, note: e.target.value })} /></label><p className="event-detail">记录时间：{new Date(info.recordedAt!).toLocaleString('zh-CN')}</p>{error && <p role="alert">{error}</p>}<div className="compact-toolbar"><button type="submit" className="primary-button" disabled={!app.canPersist}>保存时间与备注</button><button type="button" className="secondary-button" onClick={onClose}>取消</button></div>
  </form>
}
export function GroupRecordDetails({ app, session }: { app: HealthRhythmViewModel; session: GroupSession }) {
  const [editing, setEditing] = useState(false)
  const record = findGroupSession(app.state, session.id)?.record
  return <><div className="group-record-items">{session.items.map((item) => {
    const completion = session.completed.find((entry) => entry.itemKey === refKey(item))
    const details = [
      ...item.exercises?.map((exercise) => `${record?.strengthEntries?.some((entry) => entry.exercise.id === exercise.id && completion?.eventIds.includes(`exercise-${entry.id}`)) ? '✓' : '○'} ${exercise.name} ${prescription(exercise)}`) ?? [],
      ...record?.movementSessions.filter((entry) => completion?.eventIds.includes(`movement-${entry.id}`)).map((entry) => `${entry.durationMinutes} 分钟${entry.note ? ' · ' + entry.note : ''}`) ?? [],
      ...record?.breathSessions.filter((entry) => completion?.eventIds.includes(`breath-${entry.id}`)).map((entry) => `${entry.pattern.inhale}/${entry.pattern.hold}/${entry.pattern.exhale}/${entry.pattern.endHold} · ${entry.completedRounds} 轮`) ?? [],
      ...record?.rhythmEntries.filter((entry) => completion?.eventIds.includes(`rhythm-${entry.id}`)).map((entry) => `180 BPM · ${Math.round(entry.durationSeconds / 6) / 10} 分钟`) ?? [],
      ...completion?.eventIds.map((id) => record?.recordDetails?.[id]?.note).filter(Boolean) ?? [],
    ].join('；')
    return <p key={refKey(item)} className="event-detail">{completion ? item.kind === 'routine' && completion.eventIds.length !== item.exercises?.length ? '◐' : '✓' : '○'} {item.name}{details ? ` · ${details}` : ''}</p>
  })}</div><button type="button" className="text-button" onClick={() => setEditing(!editing)}>编辑组合记录 / 添加备注</button>{editing && <div className="group-record-editor"><GroupItems app={app} session={session} items={session.items} onLog={(key, movement, undo, exerciseId) => undo ? app.completeGroupItem(session.id, key, movement, true, exerciseId) : ['rhythm:', 'breath:', 'routine:'].some((prefix) => key.startsWith(prefix)) ? app.launchGroupWorkflow(session.id, key) : app.completeGroupItem(session.id, key, movement, false, exerciseId)} /><GroupTimeEditor app={app} session={session} onClose={() => setEditing(false)} /></div>}</>
}
export function GroupManager({ app, onAddHabit, onAddExercise }: { app: HealthRhythmViewModel; onAddHabit: () => void; onAddExercise: () => void }) {
  const [draft, setDraft] = useState<GroupTemplate | null>(null)
  const all = availableItems(app.state), groups = app.state.library.groups ?? []
  return <section className="card card-compact"><h2>管理组合</h2><button type="button" className="secondary-button" onClick={() => setDraft({ id: makeLocalId('group'), name: '', items: [], assignment: 'same-day', location: 'habit', hidden: false, enabled: true })}>＋ 新建组合</button>
    {groups.map((group, index) => <div className="block-management-row" key={group.id}><button type="button" className="secondary-button" onClick={() => setDraft(structuredClone(group))}>{group.name}{group.hidden || !group.enabled ? '（隐藏）' : ''} · {locations[group.location]}</button><button type="button" disabled={index === 0 || !app.canPersist} aria-label={`${group.name}上移`} onClick={() => app.moveGroupTemplate(group.id, -1)}>↑</button><button type="button" disabled={index === groups.length - 1 || !app.canPersist} aria-label={`${group.name}下移`} onClick={() => app.moveGroupTemplate(group.id, 1)}>↓</button></div>)}
    {draft && <form className="record-editor" onSubmit={(e) => { e.preventDefault(); app.saveGroupTemplate(draft); setDraft(null) }}><label className="field-card"><span>组合名称</span><input required value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label><div className="form-grid"><label className="field-card"><span>显示位置</span><select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value as GroupTemplate['location'] })}>{Object.entries(locations).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><label className="field-card"><span>日期规则</span><select value={draft.assignment} onChange={(e) => setDraft({ ...draft, assignment: e.target.value as GroupTemplate['assignment'] })}><option value="same-day">当天发生 / 当天计入</option><option value="next-day-review">前晚发生 / 次日回顾</option><option value="manual">手动选择日期</option></select></label></div><label className="check-row"><input type="checkbox" checked={draft.hidden} onChange={(e) => setDraft({ ...draft, hidden: e.target.checked })} />隐藏组合</label><label className="check-row"><input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />启用</label>
      {draft.items.map((ref, index) => <div className="block-management-row" key={refKey(ref)}><span>{all.find((item) => refKey(item) === refKey(ref))?.name ?? ref.id}</span><button type="button" aria-label={`${all.find((item) => refKey(item) === refKey(ref))?.name ?? '项目'}上移`} disabled={index === 0} onClick={() => { const items = [...draft.items]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; setDraft({ ...draft, items }) }}>↑</button><button type="button" aria-label={`${all.find((item) => refKey(item) === refKey(ref))?.name ?? '项目'}下移`} disabled={index === draft.items.length - 1} onClick={() => { const items = [...draft.items]; [items[index + 1], items[index]] = [items[index], items[index + 1]]; setDraft({ ...draft, items }) }}>↓</button><button type="button" onClick={() => setDraft({ ...draft, items: draft.items.filter((item) => refKey(item) !== refKey(ref)) })}>移出</button></div>)}
      <label className="field-card"><span>添加项目</span><select value="" onChange={(e) => { const item = all.find((ref) => refKey(ref) === e.target.value); if (item) setDraft({ ...draft, items: [...draft.items, { kind: item.kind, id: item.id }] }) }}><option value="">选择已有项目</option>{all.filter((item) => !draft.items.some((ref) => refKey(ref) === refKey(item))).map((item) => <option key={refKey(item)} value={refKey(item)}>{item.name} · {kinds[item.kind]}</option>)}</select></label><div className="compact-toolbar"><button type="button" className="secondary-button" onClick={onAddHabit}>新增习惯 / 运动</button><button type="button" className="secondary-button" onClick={onAddExercise}>新增动作</button></div><div className="compact-toolbar"><button type="submit" className="primary-button" disabled={!draft.name.trim() || !app.canPersist}>保存组合</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>取消</button></div>
    </form>}
  </section>
}
