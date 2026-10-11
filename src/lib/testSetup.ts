import { beforeEach, vi } from 'vitest'

// A real serialized lock queue, shared across simulated tabs in each test.
export function mockWebLocks() {
  let tail: Promise<unknown> = Promise.resolve()
  return {
    request: vi.fn((_name: string, _options: unknown, callback: () => unknown) => {
      const next = tail.then(callback)
      tail = next.catch(() => {})
      return next
    }),
  }
}
beforeEach(() => {
  vi.stubGlobal('navigator', { locks: mockWebLocks() })
})
