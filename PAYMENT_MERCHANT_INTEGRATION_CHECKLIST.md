# 真实商户支付联调清单 (TASK-002-J-03)

> 本清单**必须由人工在真实商户环境执行**。自动化测试只能覆盖协议与数据一致性
> (签名/验签/幂等/权益/佣金), 无法替代与微信、支付宝真实网关的联调。
>
> 执行环境: 预发布 (staging) 环境或已备案的生产域名, 使用真实商户号 + 最小金额实付。
> 完成后请填写「执行记录」并签字确认。

---

## 0. 前置条件 (缺一不可)

### 0.0 资质办理顺序 (业务侧, 2026-09-13 状态: 已有营业执照; 商户号与 ICP 备案待办)

代码侧已就绪, 这一节是**业务/资质**动作, 按顺序做完才能进入 §1 联调。
(具体材料与时效以微信支付商户平台 / 云服务商备案系统的当期要求为准。)

| 顺序 | 事项               | 关键点                                                                                                                                                                                                                                                                                                            |
| ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 域名 + 大陆服务器  | 域名需**实名认证**; 备案要求由国内接入商承载 (阿里云/腾讯云等中国站账号, 国际站不支持备案)                                                                                                                                                                                                                        |
| 2    | **ICP 备案**       | 通过云服务商备案系统提交: 填写订单/主办者信息/网站信息 → 上传资料与真实性核验 → 提交管局审核。周期最长, **建议第一个启动**; 微信支付回调必须是**已备案域名 + HTTPS**                                                                                                                                              |
| 3    | **微信支付商户号** | 主体为企业/个体工商户 (个人主体不能申请商户模式)。材料: 营业执照彩色扫描件/照片、法人身份证、对公账户或个体户法人对私账户、按经营类目可能需行业资质。流程: 商户平台「成为商家」→ 法人微信扫码 → 选主体类型 → 提交主体与经营资料 → 账户验证 (对公打款回填金额) → 签约 → 绑定业务 AppID (产品中心 → APPID 授权管理) |
| 4    | 商户平台内配置     | 开通 **Native 支付(扫码)**; 配置 **APIv2 密钥**; 下载 **API 证书** (退款 mTLS 必需); 服务器出口 IP 加入白名单; 「产品中心 → 开发配置」填回调地址 `https://<API域名>/payment/callback/wechat`                                                                                                                      |
| 5    | (可选) 支付宝商户  | 开放平台创建应用并签约**当面付**; 配 APPID + 应用私钥 + 支付宝公钥                                                                                                                                                                                                                                                |
| 6    | 交付凭据给工程侧   | **不要发在聊天里**: 直接写入部署环境变量 (`apps/api/.env` 或部署平台的环境变量), 只告知"已配置"                                                                                                                                                                                                                   |

> ⚠️ 本项目实现的是微信 **APIv2** (XML + MD5/HMAC)。若开通的商户号只能用 v3, 需另行改造后再联调。
>
> ✅ 资质未办齐**不阻塞上线**: 保持两个支付渠道开关为 false, 先上线卖课 (系统支持「先上课程、后开支付」); 资质齐备后再开渠道。

### 0.1 域名与网络

- [ ] API 域名已备案并可公网访问, 且为 **HTTPS** (微信/支付宝回调强制 https)
- [ ] `PUBLIC_API_BASE_URL` = `https://<API域名>` (不带结尾斜杠)
- [ ] 前端域名已加入 `CORS_ORIGINS`, 且会员页在微信内置浏览器可正常打开
- [ ] 回调地址可被公网访问: `curl -X POST https://<API域名>/payment/callback/wechat` 有响应 (401/400 均属正常, 只要能到达服务)

### 0.2 微信商户配置

- [ ] 商户号已开通 **Native 支付** (扫码)
- [ ] `WECHAT_APP_ID` / `WECHAT_MCH_ID` / `WECHAT_API_KEY` 与商户平台一致 (APIv2 密钥)
- [ ] 商户平台「产品中心 → 开发配置」回调地址填写: `https://<API域名>/payment/callback/wechat`
- [ ] 已下载 **API 证书** 并挂载到 `WECHAT_CERT_PATH` / `WECHAT_CERT_KEY_PATH` (退款必需, mTLS)
- [ ] 服务器出口 IP 已加入商户平台「IP 白名单」
- [ ] 确认商户号走的是 **APIv2** 协议 (本项目实现的是 v2; 若为 v3 需要另行改造, 见风险)

### 0.3 支付宝商户配置

- [ ] 应用已签约 **当面付** (`alipay.trade.precreate`)
- [ ] `ALIPAY_APP_ID` / `ALIPAY_PRIVATE_KEY`(应用私钥) / `ALIPAY_PUBLIC_KEY`(**支付宝公钥**) 配置正确
- [ ] `ALIPAY_SELLER_ID` 与商户 PID 一致 (建议配置, 会启用 seller_id 二次校验)
- [ ] 开放平台「异步通知地址」填写: `https://<API域名>/payment/callback/alipay`
- [ ] 正式网关 `ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do` (沙箱需显式覆盖)

### 0.4 系统初始状态

- [ ] `pnpm -F @earthworm/db migrate` 已执行 (29 张表; 含 0032 补齐的 learning paths/picture words)
- [ ] `plans` 有 4 条方案且价格经业务确认 (lifetime 默认价 ¥199 是占位值)
- [ ] `partner_commission_rules` 至少 1 条 active 规则 (默认 40%)
- [ ] 课程内容已导入 (`pnpm -F @earthworm/xingrong-courses upload`, 注意该脚本会先清空课程表, **仅限首次导入**)
- [ ] 后台支付渠道初始为 `disabled` (联调时再逐个开启)

---

## 1. 微信支付联调用例

在后台 `/admin/plans` 打开微信渠道 (`PATCH /admin/payment-channels/wechat {"enabled":true}`) 后执行。

| #   | 场景         | 操作步骤                                                              | 预期结果                                                                                        | 通过 |
| --- | ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---- |
| W1  | Native 下单  | 会员页选择微信支付 → 点击某方案                                       | 返回二维码/支付链接; `orders.status=pending`, `provider=wechat`, `payment_method=wechat_native` | ☐    |
| W2  | 扫码支付成功 | 用微信扫码并按最小金额支付                                            | 页面自动变为「支付成功, 会员已生效」; `orders.status=paid`, `provider_transaction_id` 非空      | ☐    |
| W3  | 权益生效     | 支付成功后访问会员课程                                                | 可正常学习; `membership_periods` 新增 1 条且 `order_id` 为该订单                                | ☐    |
| W4  | 回调幂等     | 联系技术重复投递同一回调 (或手工重放原始报文)                         | 不重复开通、不重复佣金; `payment_events` 只有 1 条 callback                                     | ☐    |
| W5  | 回调验签     | 修改报文任意字段后重放                                                | 返回 401, 订单不变化                                                                            | ☐    |
| W6  | 金额篡改     | 用真实密钥签一个金额更小的通知                                        | 返回 400; 订单保持 pending                                                                      | ☐    |
| W7  | 订单查询兜底 | 支付成功但人为阻断回调 (临时改错回调地址), 打开订单页等待             | 轮询发现已支付并自动入账 (调用渠道查单)                                                         | ☐    |
| W8  | 超时关单     | 下单后不支付, 等 `order_expire_minutes` (默认 120) 或手工触发关单任务 | 订单变 `expired`; 渠道侧订单已关闭; 用户再次扫码无法支付                                        | ☐    |
| W9  | 退款         | 后台 `POST /admin/orders/:id/refund`                                  | 渠道退款成功; `orders.status=refunded`; 会员权益撤销; 佣金 `reversed`                           | ☐    |
| W10 | 重复退款     | 对同一订单再次调用退款                                                | 返回 400 (Only paid orders / 退款处理中); 渠道只收到 1 次退款                                   | ☐    |
| W11 | 退款失败回滚 | 用未开通退款的证书/错误证书发起退款                                   | 退款失败, 订单恢复 `paid`, 会员仍有效, 佣金仍为 `holding`                                       | ☐    |

对账字段核对 (微信): `orders.provider_order_id` 应等于本地 `orders.id`;
微信后台商户订单号 `out_trade_no` 与之完全一致。

## 2. 支付宝联调用例

关闭微信渠道、打开支付宝渠道 (`payment_alipay_enabled=true`) 后执行。

| #   | 场景         | 操作步骤                       | 预期结果                                                                   | 通过 |
| --- | ------------ | ------------------------------ | -------------------------------------------------------------------------- | ---- |
| A1  | 预下单       | 会员页选择支付宝 → 点击某方案  | 返回 `qr_code`; `orders.payment_method=alipay_qr`, `provider=alipay`       | ☐    |
| A2  | 扫码支付成功 | 用支付宝扫码支付               | 页面自动确认; `orders.status=paid`, `provider_transaction_id`=支付宝交易号 | ☐    |
| A3  | 权益 + 佣金  | 支付后检查                     | 会员生效 + `commission_records` 1 条 `holding`                             | ☐    |
| A4  | 通知验签     | 篡改 `total_amount` 后重放通知 | 验签失败 (401), 订单不变                                                   | ☐    |
| A5  | 商户校验     | 用其它 app_id 的正常通知重放   | 被拒 (验签/商户不匹配)                                                     | ☐    |
| A6  | 通知幂等     | 重复投递同一通知               | 不重复入账                                                                 | ☐    |
| A7  | 查单兜底     | 阻断通知后打开订单页           | 轮询查单后自动入账                                                         | ☐    |
| A8  | 关单         | 未支付订单触发关单             | 订单 `expired`, 支付宝侧订单已关闭                                         | ☐    |
| A9  | 退款         | 后台退款                       | `refunded` + 权益撤销 + 佣金 `reversed`                                    | ☐    |
| A10 | 重复退款     | 再次退款                       | 被拒; 渠道仅 1 次退款 (`out_request_no` 固定为 `RF<orderId>`)              | ☐    |

## 3. 联调过程中的异常处置

| 现象                              | 处置                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| 支付成功但本地仍 pending          | 优先等前端轮询/10 分钟超时任务查单; 仍不行则管理员调用 `POST /admin/orders/:orderId/reconcile`      |
| 订单卡在 `refunding` 超过 15 分钟 | 15 分钟恢复任务会自动处理; 也可手工 `POST /admin/orders/:orderId/reconcile` 立即重试                |
| 关单失败且渠道可能已收款          | 订单保持 pending 并写入 `payment_events.event_type='expire_reconcile'`, 需人工对账后手工入账/退款   |
| 回调持续 4xx                      | 检查签名密钥、回调地址、金额币种是否与本地订单一致; 日志含 `orderId/provider/status/error` 便于定位 |

常用核对 SQL:

```sql
SELECT id, user_id, plan_id, amount_fen, status, provider, payment_method,
       provider_order_id, provider_transaction_id, paid_at, refunded_at
FROM orders ORDER BY created_at DESC LIMIT 20;

SELECT e.order_id, e.provider, e.event_type, e.processed_at, e.payload
FROM payment_events e ORDER BY e.created_at DESC LIMIT 20;

SELECT order_id, status, start_at, end_at FROM membership_periods ORDER BY created_at DESC LIMIT 20;

SELECT order_id, order_amount_fen, rate_bps, commission_fen, status, hold_until
FROM commission_records ORDER BY created_at DESC LIMIT 20;
```

## 4. 联调结论 (人工填写)

- 微信 Native: ☐ 通过 ☐ 不通过 — 说明: \_\_\_\_
- 支付宝当面付: ☐ 通过 ☐ 不通过 — 说明: \_\_\_\_
- 退款 (微信/支付宝): ☐ 通过 ☐ 不通过 — 说明: \_\_\_\_
- 回调丢失恢复 (查单/对账入口): ☐ 通过 ☐ 不通过 — 说明: \_\_\_\_
- 执行人 / 日期: \_\_\_\_
- 遗留问题与处置: \_\_\_\_

## 5. 明确限制 (需知悉)

1. 本项目实现的是**微信支付 APIv2** (XML + MD5/HMAC-SHA256)。若商户号只能走 APIv3 (证书+序列号+平台证书验签), 需要单独改造 Provider, 不能直接使用。
2. 微信 **JSAPI** 需要用户 `openid` (公众号/小程序网页授权), 本项目 Logto 未采集 openid, 因此当前可用的微信方式是 **Native 扫码**。
3. 联调期间的支付金额为真实资金流动; 退款链路会真实原路退回, 请使用最小金额并做好账务记录。
