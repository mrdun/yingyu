# apps/admin — Earthworm 管理后台

独立的管理后台前端 (Nuxt 3 + Vue 3 + TypeScript + Tailwind/daisyUI), 端口 `3002`。

## 当前批次 (O-01) 范围

- 骨架: `ssr: false`, 可 `nuxt generate` 出静态产物; runtimeConfig 全部来自环境变量 (构建期门禁见 `nuxt.config.ts`)。
- 认证: 复用 Logto SPA 应用 `earthworm-client` (不新建应用), scope 含 `admin:access`; 全局守卫区分 **401 (未登录 → 登录)** 与 **403 (已登录无权限 → Forbidden)**。
- 布局: 左侧 13 项导航 (12 项已实现, 仅「学习路线」为可见但禁用的占位) + 顶栏 (标题/面包屑/管理员身份)。
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

## O-03 批次 (第三批) 范围: 课程中心

- 页面 (4 个): `/courses` (课程包列表)、`/courses/[id]` (课程包详情)、
  `/courses/[id]/courses/[courseId]` (语句编辑器)、`/courses/ai` (AI 生成入口)。
- 后端增量 (只有 2 个只读接口, 不改任何写行为):
  - `GET /admin/course-packs/:id` —— 单个课程包详情, **不限状态** (draft/review/archived 都能读),
    返回包字段 + courses (按 order 升序, 含每课 statementCount), 不存在 404;
    **不返回语句正文** (一个包可能有上千条语句, 详情接口会被响应体撑爆)。
  - `GET /admin/courses/:courseId/statements` —— 语句列表, 按 order 升序,
    `page` / `pageSize` (默认 20, 上限 100), 返回 `{ items, total, page, pageSize }`, 课程不存在 404。
    这两个接口是必需的: 公开接口对 membership 包直接抛 `ForbiddenException` 且只暴露 `published`,
    管理端此前既读不到草稿包, 也没有任何语句读取方法。
- 状态机: 页面**只调用**既有的 5 个端点 (`submit-review` / `reject` / `publish` / `archive` / `restore`),
  不在前端自建第二套转换规则; 可用动作只是按当前状态的**展示映射** (`utils/courseStatus.ts`,
  注释里明确写了"不是第二套状态机")。后端拒绝时把错误原文展示出来, 并且**不做乐观更新** ——
  失败后照样重新拉取一次, 让界面与后端一致 (`composables/useCoursePackActions.ts`)。
- 排序: 数字 `order` 直接编辑, 或上移/下移 (`utils/reorder.ts` 算出相邻两条的新 order),
  两者都是对既有 `PATCH /admin/courses/:courseId` / `PATCH /admin/statements/:statementId`
  发 `{order}`。**没有**任何批量排序接口。
- AI 生成: 4 个入口 (`split` / `course-pack` / `subtitle` / `audio`) 严格按后端 DTO 传参;
  页面顶部常驻说明「AI 生成的内容一律为草稿且来源标记为 AI, 必须经过审核 → 发布流程,
  不能直接对外可见」, 生成成功后只跳转到该草稿详情页, **没有任何"直接发布"入口**。
  音频走纯 base64 (去掉 dataURL 前缀, 与既有编辑器 `apps/client/pages/editor.vue` 一致),
  超过阈值给出体积提示、超过上限直接报错 (不静默失败)。
- 已知后端缺口 (只报告, 本批次不改后端):
  1. `GET /admin/course-packs` 没有 `keyword` 参数 —— 列表页的关键词只在当前页内过滤, 页面已明确标注。
     注: `PATCH /admin/course-packs/:id` 的 DTO 已接受 `order` (`@IsOptional @IsInt @Min(0)`),
     详情页的排序与 title/description/cover 一起保存, 不再需要只读展示。

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
               memberships / partners / commissions / commissionRules / businessSettings /
               courses (课程中心) / aiContent (AI 生成))
stores/       跨页面状态 (access / session / toast)
composables/  页面复用的状态机 (useAsyncResource / usePagedList / useServerPagedList /
              useCoursePackActions / ...)
components/   layout / ui / table / form / status 五类自建 UI 基元
middleware/   auth.global.ts 全局认证与权限守卫
plugins/      logto / http
utils/        format (金额/时间/佣金比例 bps) / status (状态色调) / nav (导航与面包屑) /
              businessSettings (业务参数中文说明与只读兜底) /
              courseStatus (课程状态/来源/访问级别展示与可用动作) / reorder (相邻 order 交换) /
              statementForm (语句表单取值与校验) / audio (音频转 base64 与大小提示)
types/        管理端 API 契约与 UI 类型
```

## 硬约束 (勿破坏)

1. 不直连数据库, 只通过 NestJS API。
2. 前端不硬编码价格/佣金比例, 一律来自 API (金额单位「分」, 用 `utils/format.ts` 换算)。
3. 不 import `apps/client` 的任何代码 (类型/工具在 `apps/admin` 内刻意复制并注明)。
4. 支付渠道页与系统健康页不展示任何密钥、证书或连接串。
5. 前端权限只是 UX, 后端 `AuthGuard` 才是最终防线。
6. AI 生成的内容只能是草稿 (`draft` + `source=ai`), 后台不得提供跳过审核直接发布的入口。
7. 课程状态机只有后端那 5 个端点; 前端不得自建转换规则、不得乐观改写状态。
