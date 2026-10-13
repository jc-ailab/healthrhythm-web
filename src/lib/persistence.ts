import { V3_STORAGE_KEY, V3_STORAGE_LOCK } from './storageKeys'
import { setStorageNotice, type StorageNotice } from './storageStatus'

export const CONFLICT_NOTICE: StorageNotice = {
  kind: 'unprotected',
  message: '另一标签页已更新 V3 存档，本页已停止保存。请先在管理中导出本页未保存的改动，再刷新载入最新记录。',
}
export const RECOVERY_NOTICE: StorageNotice = {
  kind: 'unprotected',
  message: '存档无法安全读取，已暂停记录，原数据保留。请在管理中下载原数据备份，确认后导入有效备份恢复；不要清除浏览器数据。',
}

// One session per mounted app/tab. The exact loaded bytes are the optimistic concurrency
// token; Web Locks make check + backup + write atomic relative to other V3 tabs.
export class PersistenceSession {
  canBootstrap: boolean
  constructor(allowBootstrap = false) { this.canBootstrap = allowBootstrap }
  expectedRaw: string | null = null
  recoveryRaw: string | null = null
  readKnown = false
  generation = 0
  notice: StorageNotice | null = null
  private writable = false
  private recoverable = false
  private listeners = new Set<() => void>()
  getCanPersist = () => this.writable
  getCanRecover = () => this.recoverable
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  activate() {
    this.writable = true
    this.recoverable = false
    this.notice = null
    setStorageNotice(null)
    this.emit()
  }
  block(message: string | StorageNotice, canRecover = false) {
    this.writable = false
    this.canBootstrap = false
    this.recoverable = canRecover
    this.notice = typeof message === 'string' ? { kind: 'unprotected', message } : message
    setStorageNotice(this.notice)
    this.emit()
  }
  private emit() { this.listeners.forEach((listener) => listener()) }
  async exclusive<T>(operation: () => T | Promise<T>): Promise<T | undefined> {
    try {
      if (typeof navigator === 'undefined' || !navigator.locks?.request) {
        this.block('浏览器不支持安全的多页保存，已暂停写入。请通过 HTTPS 使用支持 Web Locks 的浏览器（iPhone Safari 15.4 或更新版本）。')
        return undefined
      }
      return await navigator.locks.request(V3_STORAGE_LOCK, { mode: 'exclusive' }, operation)
    } catch {
      this.block('无法读取、锁定或核验本机存储，已停止保存。请导出可用数据，检查存储空间与权限后刷新；不要清除浏览器数据。')
      return undefined
    }
  }
  readCanonical() {
    this.expectedRaw = localStorage.getItem(V3_STORAGE_KEY)
    this.readKnown = true
    return this.expectedRaw
  }
  checkCurrent() {
    if (!this.readKnown || localStorage.getItem(V3_STORAGE_KEY) !== this.expectedRaw) {
      this.block(CONFLICT_NOTICE)
      return false
    }
    return true
  }
  // Must be called under exclusive(). Verify exact bytes, then validate the stored value.
  writeVerified(raw: string, validate: (value: unknown) => void) {
    validate(JSON.parse(raw))
    if (raw !== this.expectedRaw) localStorage.setItem(V3_STORAGE_KEY, raw)
    const actual = localStorage.getItem(V3_STORAGE_KEY)
    if (actual !== raw) throw new Error('Storage read-back mismatch')
    validate(JSON.parse(actual))
    this.expectedRaw = actual
    this.readKnown = true
  }
  observeStorage(event: Pick<StorageEvent, 'key' | 'newValue'>) {
    if ((event.key === V3_STORAGE_KEY || event.key === null) && event.newValue !== this.expectedRaw) {
      this.block(CONFLICT_NOTICE)
    }
  }
}
