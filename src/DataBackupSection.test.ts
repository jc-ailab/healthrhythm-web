import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PersistenceSession } from './lib/persistence'
import { DataBackupSection } from './DataBackupSection'
import { createInitialState, type AppState } from './lib/domain'
import { ensureCurrentDay, toggleBreathState, toggleRhythmState } from './lib/state'

const NOW = new Date(2026, 3, 15, 10)

beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    get length() {
      return data.size
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function fileInputIn(state: AppState, canPersist = true) {
  const html = renderToStaticMarkup(createElement(DataBackupSection, { state, canPersist, onReplace: () => {} }))
  const input = html.match(/<input[^>]*type="file"[^>]*>/)?.[0]
  if (!input) throw new Error('file input not rendered')
  return input
}

const idle = () => ensureCurrentDay(createInitialState(NOW), NOW)

describe('import file input', () => {
  it('is enabled when import is allowed', () => {
    expect(fileInputIn(idle())).not.toMatch(/\sdisabled=/)
  })

  it.each([
    ['a running Rhythm session', () => toggleRhythmState(idle(), NOW)],
    ['a paused Rhythm session', () => toggleRhythmState(toggleRhythmState(idle(), NOW), NOW)],
    ['a running Breath session', () => toggleBreathState(idle(), NOW)],
  ])('is disabled during %s', (_, makeState) => {
    expect(fileInputIn(makeState())).toMatch(/\sdisabled=""/)
  })

  it('allows explicit recovery only after the raw original is safely protected', () => {
    const session = new PersistenceSession()
    session.recoveryRaw = '{original-unreadable}'
    session.block('Recovery needed', true)
    const html = renderToStaticMarkup(createElement(DataBackupSection, { state: idle(), canPersist: false, canRecover: true, session, onReplace: () => {} }))
    expect(html.match(/<input[^>]*type="file"[^>]*>/)?.[0]).not.toMatch(/\sdisabled=/)
    expect(html).toContain('下载原始数据')
    expect(html).toContain('已暂停记录')
  })

  it('is disabled when unreadable data could not be backed up', () => {
    expect(fileInputIn(idle(), false)).toMatch(/\sdisabled=""/)
  })
})
