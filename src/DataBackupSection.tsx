import { useMemo, useRef, useState } from 'react'

import { listBackups, deleteBackup, BACKUP_KEY_PREFIX, type BackupReason } from './lib/backupStore'
import {
  MAX_IMPORT_BYTES,
  SAFETY_COPIES_KEPT,
  buildExportText,
  exportFileName,
  parseBackup,
  parseImportText,
  replaceWithSafetyCopy,
  summarizeState,
  DATA_ERRORS,
  type DataSummary,
} from './lib/dataTransfer'
import type { AppState } from './lib/domain'

type Pending =
  | { kind: 'import'; state: AppState; summary: DataSummary; fileName: string; exportedAt: string | null }
  | { kind: 'restore'; state: AppState; summary: DataSummary; key: string }

type Message = { tone: 'ok' | 'error'; text: string }

const REASON_LABELS: Record<BackupReason, string> = {
  unreadable: '读取出错时保存的原数据',
  'before-import': '导入前的自动备份',
  'before-restore': '恢复前的自动备份',
}

export function DataBackupSection({
  state,
  canPersist,
  onReplace,
}: {
  state: AppState
  canPersist: boolean
  onReplace: (next: AppState) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null)
  // Bumped after anything that adds or removes a backup, so the list re-reads storage.
  const [backupsRevision, setBackupsRevision] = useState(0)

  const backups = useMemo(() => {
    void backupsRevision
    const now = new Date()
    return listBackups().map((backup) => ({ ...backup, parsed: parseBackup(backup.key, now) }))
  }, [backupsRevision])
  const totalBytes = backups.reduce((total, backup) => total + backup.sizeBytes, 0)

  const isSessionActive = [state.rhythm.status, state.breath.status].some(
    (status) => status === 'running' || status === 'paused',
  )
  const blockedReason = !canPersist
    ? '本次打开时，旧数据无法读取也无法备份。为免覆盖它，导入和恢复暂不可用。'
    : isSessionActive
      ? '请先结束正在进行的节律或呼吸练习，再导入或恢复。'
      : null

  function handleExport() {
    const now = new Date()
    downloadText(exportFileName(now), buildExportText(state, now))
    setMessage({ tone: 'ok', text: `已导出 ${exportFileName(now)}。请把它保存到“文件”或其他安全位置。` })
  }

  async function handleFile(file: File) {
    setMessage(null)
    setPending(null)
    if (file.size > MAX_IMPORT_BYTES) {
      setMessage({ tone: 'error', text: DATA_ERRORS.tooLarge })
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      setMessage({ tone: 'error', text: DATA_ERRORS.invalid })
      return
    }
    const result = parseImportText(text, new Date())
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error })
      return
    }
    setPending({ kind: 'import', state: result.state, summary: result.summary, fileName: file.name, exportedAt: result.exportedAt })
  }

  function startRestore(key: string) {
    setMessage(null)
    setConfirmDeleteKey(null)
    // Re-read at the moment of choosing, in case the backup changed since the list was built.
    const result = parseBackup(key, new Date())
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error })
      return
    }
    setPending({ kind: 'restore', state: result.state, summary: result.summary, key })
  }

  function confirmPending() {
    if (!pending || blockedReason) return
    const result = replaceWithSafetyCopy(
      state,
      pending.state,
      pending.kind === 'import' ? 'before-import' : 'before-restore',
      new Date(),
      pending.kind === 'restore' ? pending.key : undefined,
    )
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.error })
      setPending(null)
      setBackupsRevision((value) => value + 1)
      return
    }
    onReplace(pending.state)
    setMessage({
      tone: 'ok',
      text:
        pending.kind === 'import'
          ? '已导入。原来的数据已自动保存为一份恢复备份（见下方列表）。'
          : '已恢复。替换前的数据已另存为一份恢复备份，所选备份也仍然保留。',
    })
    setPending(null)
    setBackupsRevision((value) => value + 1)
  }

  const current = summarizeState(state)

  return (
    <>
      <section className="card card-compact data-section">
        <div className="section-header">
          <h2>数据与备份</h2>
          <p>所有记录只保存在这台设备的浏览器里。定期导出一份，换手机或清理浏览器时也不会丢。</p>
        </div>
        <p className="data-current">当前数据：{describeSummary(current)}</p>

        {message && (
          <p className={`data-message${message.tone === 'error' ? ' is-error' : ''}`} role="status">
            {message.text}
          </p>
        )}

        <div className="data-block">
          <h3>导出数据</h3>
          <p>把全部记录保存成一个文件，存到设备以外的地方。不会改动 App 里的数据。</p>
          <button className="primary-button" type="button" onClick={handleExport}>
            导出数据
          </button>
        </div>

        <div className="data-block">
          <h3>导入数据</h3>
          <p>用之前导出的文件替换 App 里的全部数据。替换前会先自动备份当前数据。</p>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            aria-label="选择要导入的文件"
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Reset so choosing the same file again still triggers a change.
              event.target.value = ''
              if (file) void handleFile(file)
            }}
          />
          <button
            className="secondary-button"
            type="button"
            disabled={Boolean(blockedReason)}
            onClick={() => fileInputRef.current?.click()}
          >
            选择文件导入
          </button>
        </div>

        {blockedReason && <p className="data-message is-error">{blockedReason}</p>}

        {pending && (
          <div className="data-confirm" role="region" aria-label="确认替换数据">
            <strong>{pending.kind === 'import' ? '确认用这个文件替换当前数据？' : '确认恢复这份备份？'}</strong>
            {pending.kind === 'import' && (
              <p>
                文件：{pending.fileName}
                {pending.exportedAt && `（导出于 ${formatDateTime(pending.exportedAt)}）`}
              </p>
            )}
            <p>将载入：{describeSummary(pending.summary)}</p>
            <p>将被替换：{describeSummary(current)}</p>
            <p className="data-warning">
              今日记录、历史、习惯和动作库设置都会被替换。替换前，当前数据会自动保存为一份恢复备份
              {pending.kind === 'restore' ? '；所选备份本身也会保留' : ''}。
            </p>
            <div className="data-actions">
              <button
                className="primary-button is-danger"
                type="button"
                disabled={Boolean(blockedReason)}
                onClick={confirmPending}
              >
                {pending.kind === 'import' ? '确认替换' : '确认恢复'}
              </button>
              <button className="secondary-button" type="button" onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card card-compact data-section">
        <div className="section-header">
          <h2>恢复备份</h2>
          <p>HealthRhythm 在本机自动保存的安全副本：读取出错时、导入或恢复之前。</p>
        </div>
        <p className="data-current">
          共 {backups.length} 份 · 约 {formatBytes(totalBytes)}。导入/恢复前的备份只保留最近 {SAFETY_COPIES_KEPT}{' '}
          份；读取出错时保存的原数据不会被自动删除。
        </p>

        {backups.length === 0 ? (
          <p className="empty-state">还没有恢复备份。</p>
        ) : (
          <div className="backup-list">
            {backups.map((backup) => {
              const isUnreadable = backup.meta?.reason === 'unreadable'
              return (
                <div key={backup.key} className="backup-row">
                  <div className="backup-row-head">
                    <strong>{backup.meta ? REASON_LABELS[backup.meta.reason] : '自动备份（来源未记录）'}</strong>
                    <span>{backup.meta ? formatDateTime(backup.meta.createdAt) : '时间未知'}</span>
                  </div>
                  <p>
                    {backup.parsed.ok ? `可恢复 · ${describeSummary(backup.parsed.summary)}` : '无法读取，不能恢复（可下载保留）'}
                  </p>
                  <p className="backup-meta">
                    编号 {backup.key.slice(BACKUP_KEY_PREFIX.length)} · {formatBytes(backup.sizeBytes)}
                  </p>

                  {confirmDeleteKey === backup.key ? (
                    <div className="data-confirm">
                      <p className="data-warning">
                        删除后无法找回。
                        {isUnreadable || !backup.parsed.ok ? '这可能是这些数据唯一的副本，建议先下载。' : ''}
                      </p>
                      <div className="data-actions">
                        <button
                          className="primary-button is-danger"
                          type="button"
                          onClick={() => {
                            deleteBackup(backup.key)
                            setConfirmDeleteKey(null)
                            if (pending?.kind === 'restore' && pending.key === backup.key) setPending(null)
                            setBackupsRevision((value) => value + 1)
                            setMessage({ tone: 'ok', text: '已删除这份备份。当前数据没有改变。' })
                          }}
                        >
                          确认删除
                        </button>
                        <button className="secondary-button" type="button" onClick={() => setConfirmDeleteKey(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="backup-actions">
                      <button
                        className="text-button"
                        type="button"
                        disabled={!backup.parsed.ok || Boolean(blockedReason)}
                        onClick={() => startRestore(backup.key)}
                      >
                        恢复
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          downloadText(`healthrhythm-recovery-${backup.key.slice(BACKUP_KEY_PREFIX.length)}.json`, backup.raw)
                        }
                      >
                        下载
                      </button>
                      <button className="text-button is-danger" type="button" onClick={() => setConfirmDeleteKey(backup.key)}>
                        删除
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}

function describeSummary(summary: DataSummary) {
  if (summary.recordedDaysCount === 0) {
    return '还没有记录'
  }
  const range =
    summary.firstDayKey === summary.lastDayKey ? summary.firstDayKey : `${summary.firstDayKey} 至 ${summary.lastDayKey}`
  return `${summary.recordedDaysCount} 天记录（${range}）· 运动 ${summary.movementSessionsCount} 次`
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return '时间未知'
  }
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadText(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking right away can cancel the download in Safari.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
