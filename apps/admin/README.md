# apps/admin — Earthworm 管理后台

独立的管理后台前端 (Nuxt 3 + Vue 3 + TypeScript + Tailwind/daisyUI), 端口 `3002`。

## 当前批次 (O-01) 范围

- 骨架: `ssr: false`, 可 `nuxt generate` 出静态产物; runtimeConfig 全部来自环境变量 (构建期门禁见 `nuxt.config.ts`)。
- 认证: 复用 Logto SPA 应用 `earthworm-client` (不新建应用), scope 含 `admin:access`; 全局守卫区分 **401 (未登录 → 登录)** 与 **403 (已登录无权限 → Forbidden)**。
- 布局: 左侧 13 项导航 (4 项已实现, 9 项为可见但禁用的占位) + 顶栏 (标题/面包屑/管理员身份)。
- 页面: `/dashboard`、`/plans`、`/payment-channels`、`/system/health`。
- Service 层: 统一入口 `services/admin-api.ts` (transport), 页面禁止直接 `$fetch`/`fetch`。

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
stores/       跨页面状态 (access / session / toast)
composables/  页面复用的状态机 (useAsyncResource / usePagedList / ...)
components/   layout / ui / table / form / status 五类自建 UI 基元
middleware/   auth.global.ts 全局认证与权限守卫
plugins/      logto / http
utils/        format (金额/时间) / status (状态色调) / nav (导航与面包屑)
types/        管理端 API 契约与 UI 类型
```

## 硬约束 (勿破坏)

1. 不直连数据库, 只通过 NestJS API。
2. 前端不硬编码价格/佣金比例, 一律来自 API (金额单位「分」, 用 `utils/format.ts` 换算)。
3. 不 import `apps/client` 的任何代码 (类型/工具在 `apps/admin` 内刻意复制并注明)。
4. 支付渠道页与系统健康页不展示任何密钥、证书或连接串。
5. 前端权限只是 UX, 后端 `AuthGuard` 才是最终防线。
