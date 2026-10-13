import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createInitialState } from './lib/domain'
import { ensureCurrentDay, buildTodayTimeline, type HealthRhythmViewModel } from './lib/state'
import { logDomino } from './lib/v31'
import { ActivityTimeline, DominoHabitPage, JournalComposer } from './V31Panels'
const now = new Date(2026, 9, 13, 8)
const state = () => ensureCurrentDay(createInitialState(now), now)
describe('compact Chinese V3.1 components', () => {
  it('renders the exact Domino names and a single jingang logging control', () => {
    const saved = state()
    const app = { state: saved, habitLibrary: saved.library.habits, canPersist: true } as unknown as HealthRhythmViewModel
    const html = renderToStaticMarkup(createElement(DominoHabitPage, { app, onManage: vi.fn(), onManageBlocks: vi.fn() }))
    for (const name of ['晨间多米诺', '睡前多米诺', '虔信时刻', '晨习', '无压', '日常习惯', '其他运动', '管理组合']) expect(html).toContain(name)
    expect(html.match(/金刚功/g)).toHaveLength(1)
    expect(html).not.toContain('<form')
  })
  it('Today journal stays collapsed until requested', () => {
    const html = renderToStaticMarkup(createElement(JournalComposer, { day: '2026-10-13', onSave: vi.fn() }))
    expect(html).toContain('今日随记')
    expect(html).not.toContain('<textarea')
  })
  it('night occurrence is unknown in the collapsed row while recording time is explicitly secondary', () => {
    const original = state()
    const saved = logDomino(original, 'foot-soak', original.currentDayKey, original.library.dominoBlocks![1], now)
    const html = renderToStaticMarkup(createElement(ActivityTimeline, { day: saved.currentDayKey, events: buildTodayTimeline(saved, saved.library.habits, []), onEdit: vi.fn() }))
    const summary = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)![1]
    expect(summary).toContain('昨晚 · 时间未指定')
    expect(summary).not.toContain('08:00')
    expect(html).toContain('录入于')
    expect(html).toContain('编辑记录 / 添加备注')
  })
})
