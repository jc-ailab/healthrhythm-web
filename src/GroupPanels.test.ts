import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from './lib/domain'
import { newGroupSession, logGroupItem, editGroupSession } from './lib/groups'
import { dayRecord } from './lib/v31'
import { ensureCurrentDay, buildTodayTimeline, type HealthRhythmViewModel } from './lib/state'
import { GroupList, GroupTimeEditor, GroupRecordDetails, GroupManager } from './GroupPanels'
import { ActivityTimeline } from './V31Panels'
const now = new Date(2026, 9, 13, 8, 30)
function sample() {
  let state = newGroupSession(ensureCurrentDay(createInitialState(now), now), 'group-core-trio', '2026-10-13', now)
  const id = state.today.groupSessions![0].id
  state = logGroupItem(logGroupItem(state, id, 'exercise:lowerAbs', now), id, 'exercise:lowerBack', now)
  return { state, app: { state, canPersist: true, movementDefaultsFor: () => ({ durationMinutes: 30 }) } as unknown as HealthRhythmViewModel, session: state.today.groupSessions![0] }
}
describe('compact shared Group controls', () => {
  it('Strength quick access shows a partial Core Trio with original names and no completion Save form', () => {
    const { app } = sample()
    const html = renderToStaticMarkup(createElement(GroupList, { app, location: 'strength', onManage: vi.fn() }))
    for (const name of ['核心三件套 · 2/3', '下腹核心', '腰背稳定', '盆底肌', '共享时间', '再做一次']) expect(html).toContain(name)
    expect(html).not.toContain('<form'); expect(html.match(/盆底肌/g)).toHaveLength(1)
  })
  it('there is one time/precision/note form per session regardless of item count', () => {
    const { app, session } = sample()
    const html = renderToStaticMarkup(createElement(GroupTimeEditor, { app, session, onClose: vi.fn() }))
    expect(html.match(/type="time"/g)).toHaveLength(1); expect(html.match(/type="date"/g)).toHaveLength(2)
    expect(html.match(/<textarea/g)).toHaveLength(1)
    for (const name of ['发生日期', '发生时间', '时间精度', '计入哪一天', '记录时间', '组合备注']) expect(html).toContain(name)
  })
  it('Today aggregates strength children into one compact details row', () => {
    const { state, app } = sample(), events = buildTodayTimeline(state, state.library.habits, [])
    const html = renderToStaticMarkup(createElement(ActivityTimeline, { app, events, day: state.currentDayKey, onEdit: vi.fn() }))
    expect(html.match(/class="event-row"/g)).toHaveLength(1)
    expect(html).toContain('编辑组合记录'); expect(html).toContain('✓ 下腹核心'); expect(html).toContain('○ 盆底肌')
  })
  it('expanded movement details retain duration and existing individual notes', () => {
    const { app } = sample()
    let state = newGroupSession(app.state, 'domino-morning', app.state.currentDayKey, now)
    const id = dayRecord(state, state.currentDayKey).groupSessions!.at(-1)!.id
    state = logGroupItem(state, id, 'habit:jingang', now, { typeId: 'jingang', durationMinutes: 45, note: '第三式比较熟练' })
    const session = state.today.groupSessions!.at(-1)!
    const html = renderToStaticMarkup(createElement(GroupRecordDetails, { app: { ...app, state }, session }))
    expect(html).toContain('45 分钟'); expect(html).toContain('第三式比较熟练')
  })
  it('unknown and approximate shared times use honest labels in collapsed rows', () => {
    const { state, app, session } = sample()
    for (const [occurredTime, precision, label] of [[null, 'unknown', '时间未指定'], ['08:00', 'approximate', '约 08:00']] as const) {
      const saved = editGroupSession(state, session.id, { ...session.info, occurredTime, precision })
      const html = renderToStaticMarkup(createElement(ActivityTimeline, { app: { ...app, state: saved }, events: buildTodayTimeline(saved, saved.library.habits, []), day: saved.currentDayKey, onEdit: vi.fn() }))
      expect(html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)![1]).toContain(label)
    }
  })
  it('Library offers shared group management without another editing application', () => {
    const { app } = sample()
    const html = renderToStaticMarkup(createElement(GroupManager, { app, onAddHabit: vi.fn(), onAddExercise: vi.fn() }))
    expect(html).toContain('管理组合'); expect(html).toContain('新建组合'); expect(html).toContain('晨间多米诺'); expect(html).toContain('睡前多米诺')
  })
})
