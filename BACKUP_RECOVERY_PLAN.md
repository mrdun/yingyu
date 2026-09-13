# BACKUP_RECOVERY_PLAN — 数据备份与恢复方案 (TASK-002-K-01)

> 适用对象: Earthworm 生产环境 (PostgreSQL = 唯一权威数据源; Redis = 缓存/排行榜, 可重建)。
> 核心原则: **支付与会员相关的数据 (orders / memberships / membership_periods /
> commission_records / payment_events) 任何情况下都不能丢**, 备份目标 RPO ≤ 5 分钟、RTO ≤ 1 小时。

---

## 1. 数据分级

| 级别     | 数据                                                                                                                                                                    | 丢失影响                    | 备份要求                   |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------- |
| A 关键   | `orders` `memberships` `membership_periods` `commission_records` `payment_events` `partners` `referrals` `partner_commission_rules` `plans` `business_settings` `users` | 资金/权益纠纷, 不可恢复     | 每日全量 + WAL 归档 (PITR) |
| B 重要   | `course_packs` `courses` `statements` `plan_entitlements` `learning_paths` `learning_path_items` `picture_words`                                                        | 内容丢失, 可由脚本/后台重建 | 每日全量                   |
| C 可重建 | Redis 全部数据 (排行榜/缓存)                                                                                                                                            | 短时体验下降                | 可选 RDB, 不要求 PITR      |

## 2. PostgreSQL 备份

### 2.1 每日全量 (逻辑备份, 跨版本可恢复)

```bash
#!/usr/bin/env bash
# scripts/backup-db.sh (建议部署为 cron: 每日 03:30)
set -euo pipefail
BACKUP_DIR=${BACKUP_DIR:-/backup/postgres}
RETENTION_DAYS=${RETENTION_DAYS:-30}
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%F-%H%M)
pg_dump "$DATABASE_URL" -Fc --no-owner --no-privileges -f "$BACKUP_DIR/earthworm-$STAMP.dump"
# 校验备份可读 (只列目录, 不恢复)
pg_restore --list "$BACKUP_DIR/earthworm-$STAMP.dump" >/dev/null
find "$BACKUP_DIR" -name "earthworm-*.dump" -mtime +"$RETENTION_DAYS" -delete
echo "backup ok: earthworm-$STAMP.dump"
```

```cron
30 3 * * * BACKUP_DIR=/backup/postgres DATABASE_URL=postgres://... /srv/earthworm/scripts/backup-db.sh >> /var/log/earthworm-backup.log 2>&1
```

### 2.2 持续归档 / PITR (托管数据库请直接开启自动备份 + 时间点恢复)

自建 PostgreSQL 开启 WAL 归档 (RPO 可到分钟级):

```conf
# postgresql.conf
wal_level = replica
archive_mode = on
archive_command = 'test ! -f /backup/wal/%f && cp %p /backup/wal/%f'
```

- [ ] `archive_command` 目录与 `pg_dump` 备份目录不在同一块磁盘
- [ ] 备份每日异机/异地同步一次 (对象存储 `rclone sync` / `aws s3 sync`)
- [ ] 备份文件保留 30 天, 每月保留 1 份归档到冷存储

### 2.3 迁移前强制备份

每次执行 `pnpm -F @earthworm/db migrate` **之前**必须完成一次全量备份 (见 `DEPLOYMENT_RUNBOOK.md` §5.1)。
判断备份成功的两个条件: 命令退出码 0 + `pg_restore --list` 能列出内容。

## 3. Redis 备份

Redis 只存排行榜/缓存等可重建数据 (C 级), 策略从简:

```conf
# redis.conf —— 每小时最多落盘一次, 保留最近 7 天快照
save 3600 1
appendonly no
dir /var/lib/redis
```

- [ ] 每日一次 `cp /var/lib/redis/dump.rdb` 到备份目录 (可选)
- [ ] **不需要** PITR; 数据丢失后重建方式: 重启服务, 排行榜按业务数据重新计算
- [ ] 明确: 任何"必须依赖 Redis 才能恢复"的逻辑都不允许存在 (当前业务无此依赖)

## 4. Migration 恢复策略

| 场景                    | 处置                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 迁移执行失败 (中途报错) | 迁移在事务中执行, 失败通常自动回滚; 检查 `drizzle.__drizzle_migrations` 已应用记录, 修复后重跑 `migrate` |
| 迁移成功但业务异常      | 代码回滚到上一版本 (migration 均为 add-only, 旧代码可与新表结构共存); 不要临时删列                       |
| 迁移导致数据错误        | 用迁移前备份 PITR 恢复到故障点前, 再单独重放已确认安全的迁移                                             |
| 需要重建整个库          | 见 §5 恢复演练流程                                                                                       |

> 本项目所有 migration 均为**新增表/新增列/幂等 seed**, 不回删字段, 因此"代码回滚不需要数据库回滚"。

## 5. 恢复演练流程 (每季度一次, 首次上线前必须做一次)

演练目标: 从备份恢复出一个可对外服务的完整环境, 并验证关键商业数据一致。

```bash
# 5.1 准备独立恢复环境 (不要在生产库上操作)
createdb earthworm_restore

# 5.2 恢复最近一次全量备份
pg_restore --no-owner --no-privileges -d earthworm_restore /backup/postgres/earthworm-<stamp>.dump

# 5.3 (PITR 场景) 用 WAL 恢复到指定时间点, 略

# 5.4 数据一致性校验 (A 级表)
psql earthworm_restore -c "select count(*) from orders;"
psql earthworm_restore -c "select count(*) from orders where status='paid';"
psql earthworm_restore -c "select count(*) from membership_periods;"
psql earthworm_restore -c "select count(*) from commission_records;"
psql earthworm_restore -c "select count(*) from payment_events;"
# 一致性断言: 每条 paid 订单都应有对应权益 (除非历史数据未回填)
psql earthworm_restore -c "
  select count(*) from orders o
  left join membership_periods p on p.order_id = o.id
  where o.status = 'paid' and p.id is null;"

# 5.5 用恢复库启动 API (临时环境变量指向 earthworm_restore), 跑冒烟
DATABASE_URL=postgres://.../earthworm_restore pnpm -F api start:prod   # 另开终端
pnpm smoke:prod -- --base=http://127.0.0.1:3001

# 5.6 记录结果
```

演练判定标准:

- [ ] 恢复命令无错误, 表数量 = 29
- [ ] A 级表记录数与非空校验通过
- [ ] `paid 订单无权益` 的孤儿数量为 0 (或均为已登记的历史遗留)
- [ ] 冒烟测试 9 项通过
- [ ] 记录实际 RTO/RPO 数值, 若 RTO > 1 小时需调整备份/恢复流程

## 6. 备份监控与告警

| 检查           | 频率   | 判定                              |
| -------------- | ------ | --------------------------------- |
| 备份任务执行   | 每日   | 日志出现 `backup ok` 且退出码 0   |
| 备份文件新鲜度 | 每日   | 最新 `.dump` 文件 mtime < 26 小时 |
| 备份可读性     | 每周   | `pg_restore --list` 成功          |
| 磁盘水位       | 每日   | 备份目录使用率 < 80%              |
| 恢复演练       | 每季度 | 演练报告归档                      |

告警接入: 备份失败 → 立刻人工介入 (无备份期间禁止执行任何 migration)。

## 7. 明确不做 (当前阶段)

- 不做跨云多活 / 逻辑复制读写分离 (MVP 阶段成本过高)
- 不做 Redis 高可用集群 (数据可重建)
- 不做备份加密之外的合规归档 (如需等保/审计要求, 另行规划)
