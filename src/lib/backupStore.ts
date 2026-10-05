// Local recovery backups kept in localStorage.
//
// Each backup is stored verbatim under `health-rhythm-web-backup-<hash>-<length>`. When and why
// a backup was made lives in a separate, best-effort index: losing or corrupting the index
// never touches backup contents, it only makes those backups show as "time unknown".

export const BACKUP_KEY_PREFIX = 'health-rhythm-web-backup-'
// Deliberately outside BACKUP_KEY_PREFIX so it is never listed as a backup itself.
const BACKUP_INDEX_KEY = 'health-rhythm-web-meta-backups'

/**
 * - unreadable: saved data that could not be loaded (possibly the only copy of it)
 * - before-import / before-restore: the live state, saved just before it was replaced
 */
export type BackupReason = 'unreadable' | 'before-import' | 'before-restore'

const BACKUP_REASONS: readonly BackupReason[] = ['unreadable', 'before-import', 'before-restore']
/** Only these are ever pruned automatically. */
const SAFETY_COPY_REASONS: ReadonlySet<BackupReason> = new Set(['before-import', 'before-restore'])

export interface BackupMeta {
  createdAt: string
  reason: BackupReason
}

export interface StoredBackup {
  key: string
  raw: string
  sizeBytes: number
  meta: BackupMeta | null
}

// The key is derived from the content so repeating a recovery (e.g. React StrictMode
// running initializers twice) rewrites the same backup instead of creating copies.
export function backupKeyFor(rawValue: string) {
  let hash = 5381
  for (let index = 0; index < rawValue.length; index += 1) {
    hash = ((hash * 33) ^ rawValue.charCodeAt(index)) >>> 0
  }
  return `${BACKUP_KEY_PREFIX}${hash.toString(36)}-${rawValue.length}`
}

export function isBackupKey(key: string) {
  return key.startsWith(BACKUP_KEY_PREFIX)
}

/**
 * Stores `raw` as a backup. Identical content is never stored twice, and an existing backup
 * with different content is never overwritten (a hash collision gets a suffixed key).
 * Returns null when the backup could not be written.
 */
export function writeBackup(raw: string, reason: BackupReason, now: Date): string | null {
  const baseKey = backupKeyFor(raw)
  let key = baseKey
  try {
    for (let attempt = 2; ; attempt += 1) {
      const existing = localStorage.getItem(key)
      if (existing === raw) {
        break
      }
      if (existing === null) {
        localStorage.setItem(key, raw)
        break
      }
      key = `${baseKey}-${attempt}`
    }
  } catch {
    return null
  }

  // A backup that already existed keeps its original time and reason, so re-saving the same
  // content can never turn a protected copy into a prunable one.
  updateIndex((index) => (index[key] ? index : { ...index, [key]: { createdAt: now.toISOString(), reason } }))
  return key
}

export function readBackup(key: string): string | null {
  if (!isBackupKey(key)) {
    return null
  }
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Newest first; backups without a known time come last. */
export function listBackups(): StoredBackup[] {
  const index = readIndex()
  const backups: StoredBackup[] = []
  for (const key of listStorageKeys().filter(isBackupKey)) {
    const raw = readBackup(key)
    if (raw !== null) {
      backups.push({ key, raw, sizeBytes: byteLength(raw), meta: index[key] ?? null })
    }
  }
  return backups.sort((left, right) => {
    const leftTime = left.meta?.createdAt ?? ''
    const rightTime = right.meta?.createdAt ?? ''
    return leftTime === rightTime ? left.key.localeCompare(right.key) : leftTime < rightTime ? 1 : -1
  })
}

export function deleteBackup(key: string) {
  if (!isBackupKey(key)) {
    return false
  }
  try {
    localStorage.removeItem(key)
  } catch {
    return false
  }
  updateIndex((index) => {
    const next = { ...index }
    delete next[key]
    return next
  })
  return true
}

/**
 * Keeps the newest `keep` safety copies (made before an import or restore), plus every key in
 * `protectedKeys` (e.g. the copy just made and the backup just restored). Copies of unreadable
 * data and backups of unknown origin are never removed here.
 */
export function pruneSafetyCopies(keep: number, protectedKeys: readonly string[]) {
  const safetyCopies = listBackups().filter((backup) => backup.meta && SAFETY_COPY_REASONS.has(backup.meta.reason))
  // Protected safety copies are always kept, so they use up places in `keep` first.
  const protectedCount = safetyCopies.filter((backup) => protectedKeys.includes(backup.key)).length
  const removable = safetyCopies
    .filter((backup) => !protectedKeys.includes(backup.key))
    .slice(Math.max(0, keep - protectedCount))
  for (const backup of removable) {
    deleteBackup(backup.key)
  }
  return removable.map((backup) => backup.key)
}

function listStorageKeys() {
  const keys: string[] = []
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key !== null) {
        keys.push(key)
      }
    }
  } catch {
    // Storage unavailable: nothing to list.
  }
  return keys
}

function readIndex(): Record<string, BackupMeta> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(BACKUP_INDEX_KEY) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {}
    }
    const index: Record<string, BackupMeta> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const meta = value as Partial<BackupMeta> | null
      if (
        isBackupKey(key) &&
        meta &&
        typeof meta.createdAt === 'string' &&
        BACKUP_REASONS.includes(meta.reason as BackupReason)
      ) {
        index[key] = { createdAt: meta.createdAt, reason: meta.reason as BackupReason }
      }
    }
    return index
  } catch {
    return {}
  }
}

function updateIndex(update: (index: Record<string, BackupMeta>) => Record<string, BackupMeta>) {
  try {
    const current = readIndex()
    const next = update(current)
    if (next !== current) {
      localStorage.setItem(BACKUP_INDEX_KEY, JSON.stringify(next))
    }
  } catch {
    // Best effort: the backup itself is already stored.
  }
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}
