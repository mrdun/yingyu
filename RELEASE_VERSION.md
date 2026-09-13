# RELEASE_VERSION — MVP 上线版本与冻结记录 (TASK-002-K-01)

## 1. 代码冻结检查

| 检查项             | 结果                                                | 说明                                             |
| ------------------ | --------------------------------------------------- | ------------------------------------------------ |
| 分支               | `feature/commercial-v2`                             | 当前唯一交付分支                                 |
| 冻结基线 commit    | `d4a9524` (TASK-002-J-03) + 本次 `K-01` 提交        | 本次只新增文档、检查脚本、健康接口, 未改业务逻辑 |
| 工作区状态         | 干净 (`git status` 无输出)                          | 冻结前必须保持干净                               |
| 提交总数           | 74                                                  | 便于回溯                                         |
| Migration 数量     | 34 个 SQL 文件 (`0000` ~ `0032`, 含历史重复的 0000) | `packages/db/drizzle/`                           |
| Migration 执行方式 | `pnpm -F @earthworm/db migrate`                     | **禁止** `drizzle-kit push` 到生产               |
| 未提交的历史债务   | 无未提交改动                                        | 已知遗留见「上线阻塞项」                         |

### 1.1 发布节奏与 Tag 策略

- **冻结期**: 本文件提交后, 代码进入冻结。只允许「配置 / 内容 / 文档」类变更, 不允许改
  支付状态机、佣金计算、会员模型、数据库结构。
- **Tag 命名**:
  - MVP 首发: `v1.0.0-mvp` (打在当前冻结 commit 上)
  - 上线后修复: `v1.0.1-mvp`、`v1.0.2-mvp` ... (只做 bugfix, 不夹带功能)
  - 功能版本: `v1.1.0`(如有新功能) 必须走完整回归 + 商户联调
- **Tag 命令**:

```bash
git tag -a v1.0.0-mvp -m "Earthworm MVP 首发: 课程 + 会员 + 微信/支付宝支付 + Partner 佣金"
git push origin v1.0.0-mvp
```

- **回滚目标**: 上一 tag (首次上线时回滚到部署前镜像/上一个已部署 commit)

### 1.2 Migration 顺序确认

生产执行顺序 = `meta/_journal.json` 顺序 (idx 0 → 32), 由 `drizzle-kit migrate` 保证,
幂等且只执行未应用的迁移。与本次上线相关的关键迁移:

| 顺序   | 文件                                         | 作用                                                                                                 |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| idx 28 | `0028_salty_karen_page.sql`                  | `business_settings` 配置中心                                                                         |
| idx 29 | `0029_cultured_shadowcat.sql`                | `plans.is_public` + 5 项商业参数 seed                                                                |
| idx 30 | `0030_plan_production_seed.sql`              | **4 个会员方案 + 权益 + 默认佣金规则 seed**                                                          |
| idx 31 | `0031_rapid_preak.sql`                       | 订单 `payment_method` / `provider_transaction_id`, `payment_events.payload`, 订单超时与渠道开关 seed |
| idx 32 | `0032_learning_path_picture_word_tables.sql` | **补齐历史缺失的学习路线 / 看图学词三张表**                                                          |

已在全新空库实测: migration 后共 **29 张业务表**, 与 schema 完全一致 (无缺失表/列)。

## 2. 环境变量清单 (生产)

### 2.1 必需 (缺失会导致启动失败, 由 `startup-config.ts` fail-fast)

```
NODE_ENV=prod
DATABASE_URL=postgres://user:pass@<db-host>:5432/earthworm
REDIS_URL=redis://<redis-host>:6379
LOGTO_ENDPOINT=https://<logto-host>/
LOGTO_CLIENT_ID=<...>
LOGTO_CLIENT_SECRET=<...>
LOGTO_M2M_API=https://<logto-m2m-resource>/api   # M2M resource, 缺失时 Logto 返回 400 invalid_target
BACKEND_ENDPOINT=https://<api-host>/          # JWT audience, 必须与前端一致
PUBLIC_API_BASE_URL=https://<api-host>        # 生成支付回调 notify_url
CORS_ORIGINS=https://<front-host>             # 逗号分隔
PAYMENT_PROVIDER=wechat|alipay                # 默认渠道
```

### 2.2 支付渠道 (启用哪个就必须配齐, 否则启动失败)

```
# 微信 (APIv2)
WECHAT_APP_ID / WECHAT_MCH_ID / WECHAT_API_KEY
WECHAT_CERT_PATH / WECHAT_CERT_KEY_PATH / [WECHAT_CERT_PASSPHRASE]
[WECHAT_SPBILL_CREATE_IP]

# 支付宝
ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY
[ALIPAY_SELLER_ID] / [ALIPAY_GATEWAY]
```

### 2.3 前端构建期变量 (构建时必须写入产物)

```
API_BASE=https://<api-host>
LOGTO_ENDPOINT=https://<logto-host>/
LOGTO_APP_ID=<...>
BACKEND_ENDPOINT=https://<api-host>/
LOGTO_SIGN_IN_REDIRECT_URI=https://<front-host>/callback
LOGTO_SIGN_OUT_REDIRECT_URI=https://<front-host>/
```

### 2.4 可选

```
REDIS_PASSWORD / RELEASE_VERSION (健康接口展示用)
DEEPSEEK_API_KEY / OPENAI_API_KEY        # AI 课程生产, 未配置则 AI 接口报错
R2_* / OSS_*                             # 对象存储
CLARITY                                  # 前端埋点
```

## 3. 上线前自动检查 (本次新增)

```bash
pnpm config:check:prod -- --channels wechat,alipay   # 配置门禁, 未通过退出码 1
pnpm smoke:prod -- --base=https://<api-host> [--token=<用户JWT>] [--admin-token=<管理员JWT>]
```

- `config:check:prod`: 必需变量 + 支付凭据 + 危险默认值 (本地地址、非 https、非生产 NODE_ENV)
- `smoke:prod`: `/health` (database/redis/logto) + `/plans` + `/membership/payment-methods` (+ 可选鉴权接口)
- 服务启动时二次强校验: 生产环境「支付渠道已开启但缺密钥」→ **拒绝启动**

## 4. 当前上线阻塞项 (必须人工完成)

> 状态更新 2026-09-13 (业务已确认):
>
> - **支付资质现状**: 已有营业执照; **微信支付商户号与域名 ICP 备案尚未办理**。
>   → 上线策略: 先关闭支付渠道上线卖课 (系统支持「先上课程、后开支付」, 已验证) ;
>   资质齐备后再按 `PAYMENT_MERCHANT_INTEGRATION_CHECKLIST.md` 联调并开启渠道。
> - **lifetime 定价**: 维持 ¥199 占位**不作为阻塞项**; 上线前由业务在后台「会员方案管理」页自行改价
>   (改价只影响新订单, 历史订单保留下单时价格快照; 需先关闭下方第 5 项的 admin 权限问题)。

1. 真实商户联调 (微信/支付宝含退款) — 前置: 微信支付商户号 (需营业执照, 已有) + API 证书;
   已备案域名 + HTTPS 公网入口 (微信回调必须走备案域名)。见 `PAYMENT_MERCHANT_INTEGRATION_CHECKLIST.md`。
   → **不改代码即可先行上线**: 保持 `payment_wechat_enabled` / `payment_alipay_enabled` = false。
2. 课程内容导入 + 至少 1 条已发布学习路线 — 见 `PRODUCTION_RELEASE_CHECKLIST.md` §2.1.1
3. 前端用生产环境变量重新 `pnpm build:client` (缺变量会在构建期直接报错, 见 nuxt.config.ts 门禁)
4. lifetime 价格确认 → **已改为上线前自助改价, 不阻塞** (见上方状态更新)
5. 管理员 `admin:access` scope: 前端原先未申请该 scope → `/admin/*` 全部 403, 后台实际上不可用。
   修复方案 (2026-09-13 业务选择方案 B): 仅在访问管理后台时按需申请 `admin:access`。
   修好后需重跑 `RC_MANUAL_TEST_CHECKLIST.md` A1–A8 (含「普通账号仍必须 403」)。
6. 生产库备份策略落地 + 恢复演练 — 见 `BACKUP_RECOVERY_PLAN.md`。**本机等效演练已于 2026-09-13 完成**:
   pg_dump → 独立库还原 → 29 表/7 CHECK 约束/15 张 A 级表计数与源库一致 → 还原库起 API smoke 全绿。
   生产侧仍需按文档落地 cron 与告警。
7. **CI 环境补齐 e2e 依赖**: `pnpm -F api test` 会先跑 unit 再跑 e2e
   (`jest.config.e2e.ts`), e2e 需要 test Redis (`127.0.0.1:6380`) 与可用的
   Logto M2M 凭据 (`.env.test` 的 `LOGTO_CLIENT_ID/SECRET`)。当前本地环境缺少这两项,
   e2e 会失败 (失败原因为环境, 非代码)。发布流水线必须提供上述依赖, 否则流水线恒红。
   **CI 侧已就绪** (2026-09-13): `feature/commercial-v2` 的 CI 上 unit 53 suites/420 tests、
   e2e 4 suites/15 tests、client 42 files 全部通过。

> 代码层面无 P0 阻塞; 上述均为环境/内容/商务确认类前置条件。

## 5. 启动装配验证 (本次新增防线)

```bash
node apps/api/dist/src/main.js      # 编译产物真实启动
curl -s http://127.0.0.1:3001/health
# → {"status":"degraded|ok","checks":{"database":"ok","redis":...,"logto":...}}
```

- 已在本地用编译产物实测: 服务成功启动, `/health` 返回 200, `database=ok`
  (redis/logto 在本机未运行, 故为 fail/degraded — 属预期)
- 新增单元测试 `payment/tests/payment.module.spec.ts`: 用 Nest 容器装配支付模块,
  断言三个 Provider 与注册表都能被正确注入 (防止只跑单元测试时漏掉 DI 装配问题)
- 注意: 请勿用 `tsx src/main.ts` 启动服务, esbuild 不产出 `design:paramtypes` 元数据,
  会导致 Nest 按类型注入失败; 开发请用 `pnpm dev:serve`, 生产请用编译产物
