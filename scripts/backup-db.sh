#!/usr/bin/env bash
#
# PostgreSQL 每日全量备份 (见 BACKUP_RECOVERY_PLAN.md §2.1)
#
# 用法:
#   DATABASE_URL=postgres://... BACKUP_DIR=/backup/postgres ./scripts/backup-db.sh
#
# 建议 cron (每日 03:30):
#   30 3 * * * DATABASE_URL=... BACKUP_DIR=/backup/postgres /srv/earthworm/scripts/backup-db.sh >> /var/log/earthworm-backup.log 2>&1
#
set -euo pipefail

: "${DATABASE_URL:?缺少 DATABASE_URL}"
BACKUP_DIR="${BACKUP_DIR:-/backup/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
STAMP="$(date +%F-%H%M)"
TARGET="${BACKUP_DIR}/earthworm-${STAMP}.dump"

mkdir -p "${BACKUP_DIR}"

pg_dump "${DATABASE_URL}" -Fc --no-owner --no-privileges -f "${TARGET}"

# 校验备份可读 (不恢复, 只列目录)
pg_restore --list "${TARGET}" >/dev/null

# 清理过期备份
find "${BACKUP_DIR}" -name 'earthworm-*.dump' -mtime +"${RETENTION_DAYS}" -delete

SIZE="$(du -h "${TARGET}" | cut -f1)"
echo "backup ok: ${TARGET} (${SIZE})"
