// V2/V1 remain isolated read-only sources. V3 schema upgrades share this canonical
// lineage only with verified prior-loader version refusal and locked stale-write tests.
export const V3_STORAGE_KEY = 'health-rhythm-web-v3'
export const V2_STORAGE_KEY = 'health-rhythm-web-v2'
export const V1_STORAGE_KEY = 'health-rhythm-web-v1'
export const BACKUP_KEY_PREFIX = 'health-rhythm-web-backup-'
export const BACKUP_INDEX_KEY = 'health-rhythm-web-meta-backups'
export const V3_STORAGE_LOCK = 'health-rhythm-web-v3-persistence'
