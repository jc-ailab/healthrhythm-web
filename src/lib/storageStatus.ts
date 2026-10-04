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
      'Your saved data could not be read, so the app started fresh. A backup copy of the old data was kept on this device.',
  },
  unprotected: {
    kind: 'unprotected',
    message:
      'Your saved data could not be read or backed up. To avoid overwriting it, changes in this session will not be saved.',
  },
  saveFailed: {
    kind: 'save-failed',
    message: 'Could not save to this browser (storage may be full or blocked). Recent changes may be lost.',
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
