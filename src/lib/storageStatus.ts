// Tiny external store for storage problems, read in React via useSyncExternalStore.
// Kept outside React state so persistence code can report failures from effects
// without triggering extra renders or setState-in-effect.

export type StorageNoticeKind = 'recovered' | 'unprotected' | 'save-failed'

export interface StorageNotice {
  kind: StorageNoticeKind
  message: string
}

export const STORAGE_NOTICES = {
  recovered: {
    kind: 'recovered',
    message:
      '无法读取存档，已保留本机原数据备份。当前使用空白状态。',
  },
  unprotected: {
    kind: 'unprotected',
    message:
      '无法读取或备份存档，已暂停写入，原数据保留。',
  },
  saveFailed: {
    kind: 'save-failed',
    message: '无法保存到浏览器，存储空间可能已满或被阻止。近期改动尚未保存。',
  },
} as const satisfies Record<string, StorageNotice>

let currentNotice: StorageNotice | null = null
// Set when the user dismisses a save-failed notice; stays set until a save succeeds,
// so a write that keeps failing (e.g. every tick of a running session) cannot re-nag.
let isSaveFailureDismissed = false
const listeners = new Set<() => void>()

export function getStorageNotice() {
  return currentNotice
}

export function setStorageNotice(notice: StorageNotice | null) {
  if (currentNotice?.kind === notice?.kind) {
    return
  }

  currentNotice = notice
  listeners.forEach((listener) => listener())
}

export function dismissStorageNotice() {
  if (currentNotice?.kind === 'save-failed') {
    isSaveFailureDismissed = true
  }
  setStorageNotice(null)
}

export function reportSaveFailure() {
  if (!isSaveFailureDismissed) {
    setStorageNotice(STORAGE_NOTICES.saveFailed)
  }
}

export function reportSaveSuccess() {
  isSaveFailureDismissed = false
  if (currentNotice?.kind === 'save-failed') {
    setStorageNotice(null)
  }
}

export function resetStorageStatus() {
  isSaveFailureDismissed = false
  setStorageNotice(null)
}

export function subscribeStorageNotice(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
