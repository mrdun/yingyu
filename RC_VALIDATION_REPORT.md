# RC 本地生产环境验证报告 (TASK-002-L-01)

> 环境: 本机 PostgreSQL(5480) / Redis(6379) / Logto(3010)
> RC 数据库: `earthworm_rc` (独立库, 与 dev `earthworm` / test `earthworm_test` 隔离)
> 后端: `NODE_ENV=prod` + 编译产物 `apps/api/dist/src/main.js`
> 前端: `nuxt generate` 产物 `.output/public`, 经静态服务器按生产方式提供
> 基线 commit: `b40327b` (本次 RC 修复随后提交)

---

## 1. 环境搭建结果

| 项              | 结果                                                                      |
| --------------- | ------------------------------------------------------------------------- |
| RC 数据库创建   | ✅ `earthworm_rc` (独立库, 不影响其它库)                                  |
| 可复现脚本      | ✅ `scripts/rc-local-prod.ps1` (`-Action reset/migrate/seed/build/start`) |
| RC 环境变量模板 | ✅ `apps/api/.env.rc.example` (本地 `.env.rc` 已加入 .gitignore, 不入库)  |
| 前端静态预览    | ✅ `scripts/rc-static-server.mjs` (无第三方依赖, 含 SPA 回退)             |
| 端口            | API 3001 · 前端 4173 · Logto 3010 · Redis 6379 · PG 5480                  |

## 2. Migration 验证 (全新空库)

```
pnpm -F @earthworm/db migrate   →  migrations applied successfully
```

| 校验项                     | 结果                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| 业务表数量                 | ✅ 29 (与 schema 一致)                                                                            |
| `plans`                    | ✅ 4 条 (1800/4800/16800/19900, active+public)                                                    |
| `plan_entitlements`        | ✅ 4 条 (course_access=all)                                                                       |
| `partner_commission_rules` | ✅ 1 条 (lifetime/4000bps/active)                                                                 |
| `business_settings`        | ✅ 8 项 (退款保护期 24h / 订单超时 120min / 结算 7 天 / 币种 / partner 开关 / 两个渠道开关=false) |

## 3. Seed 验证 (商业 seed + 内容 seed)

| 校验项       | 结果                                                      |
| ------------ | --------------------------------------------------------- |
| 课程内容导入 | ✅ 55 个课程文件 → 1 课程包 / 8865 句子                   |
| 学习路线     | ✅ `新手入门` 已发布 (`is_published=true`), 含 1 个课程包 |
| 看图学词     | ✅ 6 个示例词卡                                           |

### ⚠️ Seed 修复 1: 导入后商城为空 (发现即修复)

**现象**: 迁移 + `upload` 后 `GET /course-pack` 返回 `[]`, 商城为空。
**原因**: 内容导入脚本未显式设置发布状态, 沿用 schema 默认值 `status='draft'`
(且 `access_level='membership'` 与 `is_free=true` 自相矛盾);
而 D-01/D-02 之后商城只展示 `status='published'`。
**影响**: 按 Runbook 在全新生产库执行导入后, **用户看不到任何课程**, 主链路第一步即断。
**修复**: 新增 `coursePackSeedValues.ts` 并让导入脚本显式写入
`status='published' / source='manual' / share_level='public' /
access_level=(is_free?'free':'membership')`; 单元测试锁定该映射。

### ⚠️ Seed 修复 2: 二次导入直接失败 (发现即修复)

**现象**: 再次执行 `upload` 报 FK 违规:
`update or delete on table "course_packs" violates foreign key constraint ... on table "courses"`。
**原因**: 清理顺序为 `course_packs → statements → courses` (父表先删);
首次在空库可成功, 之后任何一次重跑都会失败, 且此时库处于「已清一半」的尴尬状态。
**修复**: 改为按外键依赖顺序删除 `learning_path_items → statements → courses → course_packs`。

修复后实测: 重复执行 `upload` + `seed:content` 成功, 商城返回
`count=1 title=星荣零基础学英语 accessLevel=free accessible=True`。

## 4. 后端生产模式启动验证

| 校验项                        | 结果                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| 编译产物启动                  | ✅ `node apps/api/dist/src/main.js` (NODE_ENV=prod) 成功                           |
| `/health`                     | ✅ HTTP 200 `{"status":"ok","checks":{"database":"ok","redis":"ok","logto":"ok"}}` |
| `/plans`                      | ✅ 4 档方案, 含 `entitlements`                                                     |
| `/course-pack`                | ✅ 1 个已发布课程包, `accessible=true`                                             |
| `/learning-path`              | ✅ 1 条已发布路线                                                                  |
| `/membership/payment-methods` | ✅ `[wechat_native, wechat_jsapi]` (渠道已启用且凭据已配置)                        |
| CORS                          | ✅ 允许来源回显 `http://127.0.0.1:4173`; 未知来源无 allow-origin 头                |

### 启动门禁验证 (negative)

| 场景                      | 结果                                                                           |
| ------------------------- | ------------------------------------------------------------------------------ |
| 生产 + 缺必需环境变量     | ✅ 退出码 1, 日志列出缺失项 (`LOGTO_CLIENT_ID/SECRET`, `WECHAT_*`)             |
| 生产 + 渠道已开启但缺密钥 | ✅ 退出码 1: `生产环境支付渠道缺少凭据: wechat — 请补齐环境变量或先关闭该渠道` |

## 5. 前端生产构建验证

| 校验项              | 结果                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| `nuxt generate`     | ✅ 成功产出 `apps/client/.output/public`                                              |
| 产物内容            | ✅ `index.html` / `200.html` / `404.html` / `_nuxt/*`                                 |
| 环境变量注入        | ✅ 产物中烘焙了 RC 的 `API_BASE=http://127.0.0.1:3001`                                |
| 残留错误配置        | ✅ 产物中**无** `localhost:3001` / `localhost:3010` 残留                              |
| 静态服务 (生产等价) | ✅ `/`、`/callback`、`/membership`、`/partner` 全部 200 且返回应用外壳 (SPA 回退正常) |

## 6. 自动化冒烟结果

```
pnpm smoke:prod -- --base=http://127.0.0.1:3001
✅ health endpoint / database / redis / logto
✅ plans api (4) / payment methods api (2)
⏭️ membership status / partner / payment channel admin (未提供 token, 跳过)
结论: 通过 ✅ (退出码 0)
```

## 7. 本次发现的问题与处置

| 级别   | 问题                                                                                           | 处置                                                   |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **P0** | 内容导入后课程包为 `draft`, 商城为空 (主链路第一步断裂)                                        | 已修导入脚本 + 单元测试                                |
| **P1** | 内容导入脚本二次执行必然 FK 失败 (清理顺序错误)                                                | 已修删除顺序; 实测可重复执行                           |
| **P1** | `LOGTO_M2M_API` 未列入必需变量 (缺失时 Logto 返回 400 `invalid_target`, 用户同步/健康检查失败) | 已加入 `REQUIRED_PRODUCTION_ENV` + 测试 + 文档         |
| P2     | 本机 `pnpm` (Codex 内置 shim) 无法执行 workspace 脚本, 需用仓库自带 `pnpm.cmd`                 | 环境问题, 不影响部署 (部署机使用项目锁定的 pnpm 9.3.0) |
| P2     | e2e 套件需要 test Redis(6380) 与 Logto M2M 凭据, 本机缺失                                      | 已记录为 CI 前置条件 (见 `RELEASE_VERSION.md`)         |

## 8. 未覆盖 / 需人工执行

1. 真实微信/支付宝支付与退款 → `PAYMENT_MERCHANT_INTEGRATION_CHECKLIST.md`
2. 用户主链路点击验收、后台运营验收、移动端验收 → `RC_MANUAL_TEST_CHECKLIST.md`
3. 备份/恢复演练 → `BACKUP_RECOVERY_PLAN.md` §5
