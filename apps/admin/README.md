# apps/admin — Earthworm 管理后台

独立的管理后台前端 (Nuxt 3 + Vue 3 + TypeScript + Tailwind/daisyUI), 端口 `3002`。

## 当前批次 (O-01) 范围

- 骨架: `ssr: false`, 可 `nuxt generate` 出静态产物; runtimeConfig 全部来自环境变量 (构建期门禁见 `nuxt.config.ts`)。
- 认证: 复用 Logto SPA 应用 `earthworm-client` (不新建应用), scope 含 `admin:access`; 全局守卫区分 **401 (未登录 → 登录)** 与 **403 (已登录无权限 → Forbidden)**。
- 布局: 左侧 13 项导航 (11 项已实现, 2 项为可见但禁用的占位) + 顶栏 (标题/面包屑/管理员身份)。
- 页面 (O-01): `/dashboard`、`/plans`、`/payment-channels`、`/system/health`。
- Service 层: 统一入口 `services/admin-api.ts` (transport), 页面禁止直接 `$fetch`/`fetch`。

## O-02 批次 (第二批) 范围

- 页面 (7 个): `/users`、`/orders`、`/memberships`、`/partners`、`/commissions`、`/commission-rules`、`/settings/business`。
- 后端增量 (唯一): `GET /admin/commissions` —— 分页 (`page`/`pageSize`, 上限 100) + 按 `status` 过滤的只读佣金列表
  (状态枚举以 `packages/schema` 的 `commission_records` CHECK 约束为准: holding/pending/payable/paid/reversed)。
  佣金状态推进仍只有既有三个 POST (`confirm` / `:id/payable` / `:id/settle`)。
- 佣金比例: 后端整数 bps ↔ 界面百分比**只**通过 `utils/format.ts` 的 `formatBps` / `parsePercentToBps` 换算
  (页面里不得出现任何写死的比例或自行做除法)。
- 危险操作 (退款 / 授予会员 / Partner 审批与暂停 / 佣金结算 / 佣金规则启停 / 业务参数保存) 一律走
  `AppConfirmDialog` 二次确认; 所有写操作的成功与否以接口返回为准, 前端不改状态。
- 安全边界: 用户页与支付渠道页不展示任何凭证 (密码/token/密钥); 业务设置页只编辑 `business_settings`
  里的业务参数, **系统密钥与连接串 (DATABASE*URL / REDIS_URL / LOGTO*\* / 支付私钥) 不在后台可编辑范围**。
- 服务端分页复用 `composables/useServerPagedList.ts` (loading/empty/error/401/403/分页), 前端分页仍用 `usePagedList`。

## 常用命令

```bash
pnpm -F admin dev          # 开发 (端口 3002)
pnpm -F admin type-check   # nuxi typecheck
pnpm -F admin test         # 源码级断言 (vitest)
pnpm -F admin generate     # 静态产物 → .output/public
pnpm -F admin preview:static   # 用内置静态服务器预览产物 (端口 3002, 支持 SPA 回退)
```

## 环境变量

复制 `.env.example` 为 `.env` (已被根 `.gitignore` 忽略)。**禁止**在源码里硬编码后端地址或任何密钥。

| 变量                          | 说明                                             |
| ----------------------------- | ------------------------------------------------ |
| `ADMIN_API_BASE_URL`          | NestJS API 地址 (管理后台只走 API, 不直连数据库) |
| `LOGTO_ENDPOINT`              | Logto 服务地址                                   |
| `LOGTO_APP_ID`                | Logto SPA 应用 id (与用户端共用)                 |
| `BACKEND_ENDPOINT`            | Logto 资源标识 (access token 的 audience)        |
| `LOGTO_SIGN_IN_REDIRECT_URI`  | 登录回调 (`http://localhost:3002/callback`)      |
| `LOGTO_SIGN_OUT_REDIRECT_URI` | 登出回调 (`http://localhost:3002/`)              |

## 目录结构

```
api/          HTTP 传输 (ofetch 实例: baseURL / token / 错误归一化)
services/     统一入口 admin-api.ts (transport) + 各模块 service
              (dashboard / plans / paymentChannels / system / users / orders /
               memberships / partners / commissions / commissionRules / businessSettings)
stores/       跨页面状态 (access / session / toast)
composables/  页面复用的状态机 (useAsyncResource / usePagedList / useServerPagedList / ...)
components/   layout / ui / table / form / status 五类自建 UI 基元
middleware/   auth.global.ts 全局认证与权限守卫
plugins/      logto / http
utils/        format (金额/时间/佣金比例 bps) / status (状态色调) / nav (导航与面包屑) /
              businessSettings (业务参数中文说明与只读兜底)
types/        管理端 API 契约与 UI 类型
```

## 硬约束 (勿破坏)

1. 不直连数据库, 只通过 NestJS API。
2. 前端不硬编码价格/佣金比例, 一律来自 API (金额单位「分」, 用 `utils/format.ts` 换算)。
3. 不 import `apps/client` 的任何代码 (类型/工具在 `apps/admin` 内刻意复制并注明)。
4. 支付渠道页与系统健康页不展示任何密钥、证书或连接串。
5. 前端权限只是 UX, 后端 `AuthGuard` 才是最终防线。
