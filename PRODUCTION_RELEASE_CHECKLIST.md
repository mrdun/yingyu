# Earthworm 商业化上线 Checklist (TASK-002-J-01)

> 适用范围: `feature/commercial-v2` 分支首次生产上线 (会员 + 课程 + Partner + 佣金 + 后台)。
> 本清单基于真实代码审计结果编写; 带 ⚠️ 的条目为审计发现的真实风险点, 必须逐条确认。

---

## 一、环境变量

### 1.1 必须配置 (缺失会导致功能不可用或安全失效)

| 变量                                      | 作用                                      | 缺失后果                                                                    |
| ----------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV=prod`                           | 生产标记                                  | mock 支付不会禁用、多个安全开关失效                                         |
| `DATABASE_URL`                            | PostgreSQL 连接                           | 服务无法启动                                                                |
| `LOGTO_ENDPOINT`                          | Logto 租户地址 (JWKS/issuer)              | ⚠️ 缺省会回退 `http://localhost:3010/`, 全部用户认证失败                    |
| `LOGTO_CLIENT_ID` / `LOGTO_CLIENT_SECRET` | Logto M2M (用户同步)                      | 登录后 users 影子表无法同步                                                 |
| `BACKEND_ENDPOINT`                        | JWT audience (资源标识)                   | ⚠️ 缺省时 jose 会**跳过 audience 校验**, 其它 Logto 应用的 token 可能被接受 |
| `CORS_ORIGINS`                            | 生产站点域名 (逗号分隔)                   | ⚠️ 未配置时浏览器跨域被拦截, 前端无法调用 API                               |
| `PUBLIC_API_BASE_URL`                     | 生成支付回调 `notify_url`                 | 支付渠道无法回调, 订单不会自动入账                                          |
| `PAYMENT_PROVIDER`                        | 默认支付渠道 `wechat` / `alipay` / `mock` | ⚠️ 默认 `mock`; 生产 mock 被禁用会直接下单失败 (fail-closed)                |
| `REDIS_URL`                               | Redis 连接                                | 排行榜/缓存功能异常                                                         |

### 1.2 支付渠道 (启用哪个渠道就必须配齐对应变量)

微信支付 (v2 协议):

```
WECHAT_APP_ID / WECHAT_MCH_ID / WECHAT_API_KEY        # 下单、验签
WECHAT_CERT_PATH / WECHAT_CERT_KEY_PATH               # 退款必需 (mTLS)
WECHAT_CERT_PASSPHRASE                                # 证书有密码时
WECHAT_SPBILL_CREATE_IP                               # 缺省 127.0.0.1, 生产建议填服务器公网 IP
```

支付宝 (当面付 / RSA2):

```
ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY   # 签名 + 回调验签
ALIPAY_SELLER_ID                                        # 可选: 配置后会二次校验 seller_id
ALIPAY_GATEWAY                                          # 缺省正式网关; 沙箱需显式覆盖
```

> 商户密钥、私钥、证书**只允许存在于环境变量/密钥管理服务**。数据库只保存渠道开关
> (`business_settings.payment_wechat_enabled` / `payment_alipay_enabled`)。
> 后台 `/admin/plans` 只展示 `enabled / configured`, 不返回任何密钥内容。

### 1.3 可选配置

| 变量                                  | 说明                                             |
| ------------------------------------- | ------------------------------------------------ |
| `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` | AI 课程生成 / 音频转写; 未配置时相关接口明确报错 |
| `R2_*` / `OSS_*`                      | 对象存储 (音频、封面)                            |
| `REDIS_PASSWORD`                      | Redis 有密码时必填                               |
| `STRIPE_*`                            | 预留, 当前未接入                                 |

### 1.4 危险默认值 (⚠️ 上线前必须覆盖或确认)

| 项目                              | 默认行为                                                      | 风险                                                                  |
| --------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `NODE_ENV` 未设为 prod            | mock 支付可用、AI 调试权限开放 (`AdminOrDevGuard` 非生产放行) | **严重**: 生产可被免费开会员                                          |
| `PAYMENT_PROVIDER` 默认 `mock`    | 生产下单会直接失败                                            | 上线当天无法支付 (fail-closed, 不会错扣款)                            |
| `LOGTO_ENDPOINT` 默认 localhost   | 认证全失败                                                    | 配置错误被掩盖为「登录失败」                                          |
| `BACKEND_ENDPOINT` 未配置         | audience 校验被跳过                                           | token 混用风险                                                        |
| `CORS_ORIGINS` 未配置             | 只允许 localhost 与历史域名                                   | 前端不可用                                                            |
| 无 `JWT_SECRET` / `COOKIE_SECRET` | 本服务**不使用**本地 JWT/签名 cookie                          | 无需配置; 不要把 `apps/api/.env.example` 里的 `SECRET` 当成生产必需项 |

---

## 二、上线前检查

### 2.1 数据库 migration

- [ ] 备份生产库 (见 2.8)
- [ ] 在**全新空库**演练一次: `pnpm -F @earthworm/db migrate` → 必须得到 29 张表 (含 `learning_paths` / `learning_path_items` / `picture_words`, 由 0032 补齐)
- [ ] 生产执行 `pnpm -F @earthworm/db migrate` (不要用 `drizzle-kit push` 代替迁移)
- [ ] 确认 `plans` 有 4 条方案 (migration 0030 幂等 seed) 且价格正确
- [ ] 确认 `partner_commission_rules` 至少 1 条 active 规则 (migration 0030 幂等 seed 默认 40%); **无规则时佣金静默为 0**
- [ ] 确认 `business_settings` 存在: `order_expire_minutes` / `refund_window_hours` / `commission_settlement_days` / `partner_enabled` / `lifetime_partner_required` / `currency`
- [ ] 确认支付渠道开关初始为 `false` (0031 seed), 上线时按计划逐个开启

### 2.2 服务与域名

- [ ] 服务启动会校验必需环境变量 (`DATABASE_URL` / `LOGTO_*` / `BACKEND_ENDPOINT` / `PUBLIC_API_BASE_URL` / `CORS_ORIGINS`), 缺失时**直接拒绝启动** (fail-fast, 见 `apps/api/src/app/startup-config.ts`)
- [ ] API 域名 HTTPS 证书有效 (微信/支付宝回调必须是 https 且公网可达)
- [ ] 前端域名加入 `CORS_ORIGINS`
- [ ] `PUBLIC_API_BASE_URL` 指向 API 公网地址 (非前端地址)
- [ ] 数据库/Redis 不暴露公网端口

### 2.3 微信支付配置

- [ ] 商户号已开通 Native 支付 (扫码)
- [ ] 回调地址配置为 `https://<API域名>/payment/callback/wechat`
- [ ] 商户 API 密钥与商户号一致
- [ ] 退款用 API 证书已挂载 (`WECHAT_CERT_PATH`/`WECHAT_CERT_KEY_PATH`), 权限 600
- [ ] 服务器出口 IP 已加入商户平台白名单

### 2.4 支付宝配置

- [ ] 应用已签约「当面付」
- [ ] 异步通知地址配置为 `https://<API域名>/payment/callback/alipay`
- [ ] 上传应用公钥, 并将**支付宝公钥**填入 `ALIPAY_PUBLIC_KEY`
- [ ] `ALIPAY_SELLER_ID` 与商户账号一致 (建议配置以启用二次校验)

### 2.5 管理员与权限

- [ ] 在 Logto 中为管理员账号授予 `admin:access` scope (API 只认 scope, 不认本地角色表)
- [ ] 用普通账号验证: 访问 `/admin/*` 返回 **403** (不是 401, 也不是 200)
- [ ] 确认 `/admin/payment-channels` 响应中**不包含**任何密钥/证书字段

### 2.6 测试支付 (每渠道各一次, 真实小额)

- [ ] 下单 → 出现二维码/支付链接
- [ ] 支付成功 → 前端轮询到 `paid` → 会员立即生效
- [ ] `orders` 记录 `status=paid` / `provider_transaction_id` 非空
- [ ] `membership_periods` 生成 1 条 (order_id 关联), `memberships` 状态 active
- [ ] 有归因时 `commission_records` 生成 1 条, `status=holding`, `hold_until ≈ paid_at + refund_window_hours`
- [ ] 重复发送同一回调 → 不重复开通、不重复佣金 (`payment_events` 幂等)

### 2.7 退款测试

- [ ] 后台 `POST /admin/orders/:id/refund` → 渠道退款成功
- [ ] 订单 `refunded` + `refunded_at`
- [ ] 会员权益撤销 (`membership_periods.status=revoked`, 会员降级/取消)
- [ ] 佣金 `holding/pending/payable/paid → reversed`
- [ ] 再次退款 → 被拒 (`Only paid orders can be refunded` / 退款处理中)

### 2.8 备份与回滚

- [ ] 上线前完整备份 (`pg_dump` 全库 + WAL 归档策略)
- [ ] 记录当前 migration 版本 (`drizzle/0032`), 明确回滚点
- [ ] 回滚预案: 代码回滚到上一 tag; 数据库 migration 为 add-only, 不强制回滚
- [ ] 备份恢复演练至少一次 (目标 RTO 记录在案)

---

## 三、第一天监控指标

| 指标                     | 口径 / 来源                                                                              | 阈值 (建议)            | 处置                                  |
| ------------------------ | ---------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------- |
| 支付成功率               | `paid / (paid+pending+failed)` 按渠道分                                                  | 微信/支付宝 < 90% 告警 | 查渠道配置与 `payment_events`         |
| Callback 失败率          | 日志 `支付回调验签失败` / `支付回调找不到订单` / 金额不一致                              | > 0 即排查             | 多数为配置错误 (密钥/回调地址)        |
| 退款失败率               | 日志 `退款失败, 订单恢复 paid`                                                           | > 0 立即处理           | 查证书、余额、渠道状态                |
| 订单异常数量             | `orders.status='refunding'` 超过 15 分钟; `payment_events.event_type='expire_reconcile'` | > 0 需要人工介入       | 调 `POST /admin/orders/:id/reconcile` |
| 订单长期 pending         | `pending` 且超过 `order_expire_minutes`                                                  | > 5 单告警             | 定时任务会自动关单/入账               |
| 佣金异常                 | `holding` 停留超过保护期 (定时任务未转 pending)、`reversed` 异常增长                     | 与退款量匹配           | 查 `commission_records` 与规则配置    |
| 支付/佣金相关 ERROR 日志 | 日志中 `provider=` / `orderId=` 关键字                                                   | 出现即关注             | 日志已脱敏, 不含密钥                  |

日志规范: 支付相关日志必须包含 `orderId` / `provider` / `status` / `error`,
禁止输出密钥、证书、token、银行卡号; 回调原始报文入库前已脱敏
(`openid`、`buyer_id`、`buyer_logon_id` 等只保留前 2 位)。

---

## 四、上线后首日操作

1. 逐个开启支付渠道 (`PATCH /admin/payment-channels/:provider`), 每开一个做一次小额实付验证。
2. 观察 2.1 的关键指标至少 4 小时。
3. 人工检查一次 `refunding` / `expire_reconcile` / `holding` 三类记录是否为 0。
4. 确认定时任务已生效 (订单超时 10 分钟一次、退款恢复 15 分钟一次、佣金确认 30 分钟一次)。
