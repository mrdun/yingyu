# Earthworm 对标句乐部(julebu.co) —— 差距分析与需求规划

> 状态：调研完成（完整功能清单见 `句乐部-julebu.co-产品调研报告.md`，本文件为差距分析+需求规划）
> 关联文档：`2026-08-29_commercial-roadmap.md`（既有分阶段路线图，本文档是其"现状+差距+需求"的细化底座）

## 决策记录（2026-08-27 用户已确认）

| 事项 | 决策 |
|---|---|
| 目标用户 | **国内优先**（微信支付 + ICP 备案为主，Stripe 可后置） |
| 品牌名 | **「学以致用」** |
| 首发定价 | **会员月付 + 永久会员**（具体金额待定） |
| PK 对战 | 后置：先做异步排行榜式，实时对战不做 |
| 学习小组/动态 | 纳入但后置（社区化留存抓手） |
| 口语评测 | 后置（依赖语音模型成本） |
| 音频/视频课程 | **上调 P0**，Phase 1 内容管线核心 |
| Chrome 扩展/推广分销 | 后置 |
| 设计对标 | **等 Tabbit 恢复后自动抓取** julebu.co 截图确认 |
| 开工顺序 | **先做 Phase 1 内容管线**（音频解析 + 看视频/B站导入 + 学习路线 + 看图学词） |
| R1 音频 ASR | **OpenAI Whisper 默认**（provider 接口可插拔，后续可换国内云） |
| R2 B站 URL 抓取 | **不做**，用「粘贴字幕 / 上传 .srt/.vtt 文件」收尾 |

---

## 0. 关键结论（TL;DR）

1. **julebu.co（句乐部）就是 Earthworm 的商业版**：创始人阿崔（cuixueshe/崔学社），由开源 earthworm 演进到约 70 万用户。对标不是"从零做竞品"，而是"把开源版补齐到商业版的完整度"。
2. **底座已具备**：earthworm 现已覆盖核心打字学英语玩法、课程/课程包体系、SM-2 复习、评级、排行榜、金币/每日任务/打卡、会员(月/季/年)、AI 文本拆句(DeepSeek)、模拟支付、成长统计、落地页。近期提交已开始"aligned with Julebu"（3 栏首页、连击、每日打卡、12 个 AI 课程包）。
3. **主要差距集中在句乐部近一年新增的"内容获取 + 学习工具 + 增长"层**：看图学词、学习路线、B 站一键导入、音频解析(MP3→课程)、看视频学习、听力练习、口语评测、AI 助手/学习教练、生词本/错题本/笔记、能量值机制、邀请好友/联盟返利、永久会员、真实支付。
4. **⚠ 需用户重新确认的既有决策**：既有路线图"暂不做"清单里的 **PK 对战、学习小组/动态、Chrome 扩展、口语评测、音频/视频课程**，经调研句乐部**实际上都已上线**（见 §3.1 对账）。若要"全面对标"，这些需重新纳入排序。
5. **设计对标受阻**：本会话 Tabbit 浏览器运行时不可用、pwsh 沙箱网络受限，无法直接抓取 julebu.co 页面截图。已知线索是"GitHub 风"（代码/等宽字体感）。精确配色/视觉规范待确认（见 §6）。

---

## 1. 现状盘点（earthworm 代码）

### 1.1 技术栈
- **前端** `apps/client`：Nuxt 3（`ssr:false` SPA）、Vue 3、Pinia、Tailwind CSS + daisyui + @nuxt/ui、@vueuse、@nuxt/image、@hypernym/nuxt-anime、canvas-confetti、satori(分享图)、vee-validate/yup。版本 1.4.21。
- **后端** `apps/api`：NestJS 10、Drizzle ORM、PostgreSQL(14)、Redis(ioredis)、JWT、@nestjs/schedule、Swagger、argon2。14 个 Controller。
- **认证**：Logto（自托管容器，1.18.0）。
- **AI**：DeepSeek（`ai-content` 模块，文本拆句→翻译→音标）。
- **Monorepo**：pnpm workspace；packages：db、schema(drizzle)、game-data-sdk、xingrong-courses、docs。
- **支付**：`membership` 模块 + `orders` 表，当前 `provider: mock`（预留 wechat）。

### 1.2 数据模型（15 张表）
`courses` / `statements` / `course_packs` / `course_history` / `user_learn_record`(每日打卡) / `user_course_progress` / `memberships` / `user_learning_activities`(时长) / `mastered_elements` / `review_records`(SM-2) / `course_ratings`(C~SSS) / `user_coins` / `coin_transactions` / `daily_tasks` / `orders`

### 1.3 已实现功能（对应 API 模块）
| 模块 | 说明 |
|---|---|
| course / course-pack | 课程包 → 课程 → 句子(中/英/音标) 三级结构，`shareLevel`(private/public)、`isFree`、封面 |
| game(mode) | 中译英打字、听写两种模式；连击、计时、评分、分享、掌握标记、tips、学习视频链接 |
| review | SM-2 间隔重复（easeFactor/intervalDays/repetitions/nextReviewAt） |
| mastered-element | 掌握元素(jsonb) |
| rank | 排行榜（周重置 cron-job） |
| coins + daily_tasks | 金币、流水、每日任务幂等记录 |
| membership + orders | 会员(月¥18/季¥48/年¥168)、模拟支付订单 |
| stats + user-learning-activity | 学习时长、热力图(CalendarGraph)、成长报告 |
| ai-content | DeepSeek 文本拆句→生成课程包（已有 12 个 AI 课程包提交） |
| admin / editor | 后台、`/editor` 课程编辑页 |
| tool | 每日一句打卡图(satori) |

### 1.4 信息架构（WorkNav 当前导航）
开始学习(/course-pack) · 复习(/review) · 奖励(/rewards) · 成长报告(/stats) · 掌握列表(/mastered-elements) · 学习档案(/archive) · 会员(/membership) · 设置(/User/Setting)

### 1.5 设计系统现状
- 配色：主强调紫(`purple-400/600`、暗色 `#bea6ff`)，按钮蓝 `#4e80ee`；深色主题底 `#05051d`。
- 字体：Nunito-Bold(自定义 `CustomFont`)。
- 组件：Nuxt UI + daisyui；shadcn 风格 HSL 变量；自定义阴影 even-md/lg/xl；暗色 class 切换。
- 落地页「学以致用」：Banner/Features/Comments/Questions/Contact/NoticeBar/PayCard。

### 1.6 环境状态（本次会话实测）
- Node v24.18.0（`.node-version` 要求 20.12.2，存在版本偏差，argon2 等原生模块需注意）
- corepack 0.35.0 可用，但 **pnpm 未在 PATH**，沙箱内 `corepack pnpm` 因写 `AppData` 被 EPERM 拦截
- Docker Desktop 进程在跑，但沙箱内 `docker ps` 因命名管道受限不可达
- 端口 3000/3001/3010/5433/6379 当前**无监听**（dev 服务未启动）
- `node_modules` 已装、`apps/client/.env` 与 `apps/api/.env` 均存在
- 当前分支 `feature/commercial`，仅 1 个无实质差异的换行符改动(CalendarGraph.vue)

---

## 2. 对标对象：julebu.co（句乐部）调研摘要

> **完整报告（7 章 + 功能清单总表 + 出处链接）见 `句乐部-julebu.co-产品调研报告.md`**。以下为精简版。

**定位**：「像玩游戏一样，用句子学英语」的游戏化打字学英语 Web 应用，70 万+用户，由开源 earthworm（~10k star）商业化而来，创始人 B 站 UP 主阿崔（崔学社），主体「北京句乐部科技有限公司」。**纯网页策略（无原生 App）**，方法论为「用句子学英语 + 连词成句 + i+1 可理解输入」。

### 2.1 版本演进时间线（2025-08-31 v1.0.0 → 2026-06 v1.15+，约 2~3 周一版）
| 版本 | 内容 | 版本 | 内容 |
|---|---|---|---|
| v1.0.0 | 正式上线 | v1.9.0 | **永久会员**权益升级 + 生词本增强 |
| v1.4.0 | **错题本**全面升级 | v1.9.2 | **能量值机制**（免费额度 80 点/日） |
| v1.5.0 | **音频解析**（MP3→课程） | v1.10.0 | **连击系统**（音游式） |
| v1.6.0 | 社交化「无朋友，不学习」 | v1.11.0 | **AI 学习教练 / 智能复习体系** |
| v1.7.0 | 语音输入 + **口语评测** | v1.13.0 | **AI 助手** + 看视频学习 |
| v1.8.0 | 商业化转向（会员） | v1.14.0 | **视频观看模式 + 听力练习模式** |
| — | — | v1.15.0 | **邀请好友 + 笔记 + 复习全面升级** |
| — | — | v1.16(推断) | **看图学词 · 学习路线 v2 · B 站一键导入** |

### 2.2 完整功能面（对照 earthworm）
内容/课程：看图学词、学习路线(v1→v2)、B 站一键导入、音频解析、看视频学习、影视/教材资源库
学习辅助：生词本、错题本、笔记、复习/智能复习(间隔重复)、AI 助手/AI 学习教练、口语评测、听力练习
游戏化/激励：连击系统、每日任务与金币、打卡/成长记录/学习分析、PK 对战与排行榜、能量值机制
社交/社区：学习小组与动态、社区互动、投稿课程(UGC+官方奖励)、分享/推广激励、邀请好友
商业化：会员(月/季/年) + 永久会员 + 能量值免费额度
其他：个性化设置、Chrome 扩展、课程包/自定义编辑器、联盟返利(`/aff/<邀请码>`)

### 2.3 设计线索
第三方评测定性为「**GitHub 风**」：代码/等宽字体界面语言、键盘打字为中心、连击借鉴音游爽感；句子 + 影视画面结合。精确配色/字体/深色模式**待确认**（需截图）。

---

## 3. 差距分析（功能维度总表）

> 图例：✅ 已对齐 ｜ 🟡 部分实现 ｜ ❌ 缺失 ｜ ⚠️ 待确认

| # | 功能域 | julebu.co | earthworm 现状 | 差距 |
|---|---|---|---|---|
| 1 | 打字学英语(核心) | ✅ | ✅ 中译英打字 | ✅ |
| 2 | 听写模式 | ✅ | ✅ DictationMode | ✅ |
| 3 | 听力练习模式 | ✅(v1.14) | ❌ 仅发音朗读 | ❌ |
| 4 | **口语评测** | ✅(v1.7) | ❌(pronunciation 合成，无评测) | ❌ |
| 5 | **看图学词** | ✅ | ❌ | ❌ |
| 6 | **学习路线**(v1→v2) | ✅ | ❌(仅课程包列表) | ❌ |
| 7 | **B 站一键导入** | ✅ | ❌ | ❌ |
| 8 | **音频解析**(MP3→课程) | ✅(v1.5) | 🟡 仅文本 AI 拆句，无音频切分 | ❌ |
| 9 | **看视频学习** | ✅(v1.13/1.14) | 🟡 course.video 字段+StudyVideoLink | 🟡 |
| 10 | **AI 助手/AI 学习教练** | ✅(v1.11/1.13) | 🟡 仅 DeepSeek 拆句，无对话浮窗/教练 | ❌ |
| 11 | **生词本** | ✅(v1.9 增强) | 🟡 mastered_elements(jsonb)，无生词本概念 | 🟡 |
| 12 | **错题本** | ✅(v1.4) | ❌ | ❌ |
| 13 | **笔记** | ✅(v1.15) | ❌ | ❌ |
| 14 | SRS 复习/智能复习 | ✅ 全面升级 | ✅ SM-2 | 🟡(算法/AI 化待对齐) |
| 15 | 成长记录/学习分析 | ✅ | ✅ stats+热力图 | 🟡 |
| 16 | 连击/评级(C~SSS) | ✅(v1.10) | ✅ combo+course_ratings | ✅ |
| 17 | 排行榜 | ✅ | ✅ rank | ✅ |
| 18 | **PK 对战** | ✅(guide-pk) | ❌(路线图已排除) | ❌→待确认 |
| 19 | **学习小组与动态** | ✅(guide-groups) | ❌(路线图已排除) | ❌→待确认 |
| 20 | 打卡/每日任务 | ✅ | ✅ check-in+daily_tasks | ✅ |
| 21 | 金币/积分 | ✅ | ✅ coins | ✅ |
| 22 | **能量值机制**(免费额度 80点/日) | ✅(v1.9.2) | ❌(仅金币，无免费额度限制) | ❌ |
| 23 | **邀请好友** | ✅(v1.15) | ❌ | ❌ |
| 24 | **联盟返利/推广激励**(/aff/) | ✅ | ❌ | ❌ |
| 25 | 分享(生成卡片) | ✅ | 🟡 share composable+Share 组件 | 🟡 |
| 26 | 用户投稿/社区课程(UGC) | ✅ | 🟡 editor+shareLevel=public | 🟡 |
| 27 | 会员(月/季/年) | ✅ | ✅ | ✅ |
| 28 | **永久会员** | ✅(v1.9) | ❌(plans.ts 无 lifetime) | ❌ |
| 29 | 真实支付 | ✅(Stripe/微信) | ⚠️ mock | ❌ |
| 30 | **Chrome 扩展** | ✅(Chrome Store) | ❌(路线图已排除) | ❌→待确认 |

### 3.1 ⚠ 与既有路线图"暂不做"清单的对账（需用户重新确认）

既有 `2026-08-29_commercial-roadmap.md` 曾明确排除以下项，但调研确认**句乐部均已上线**：

| 路线图"暂不做" | 句乐部实际 | 建议 |
|---|---|---|
| PK 实时对战(WebSocket) | ✅ 有 PK 对战与排行榜 | 重新评估：可先做"异步排行榜式 PK"或后置，实时对战成本高 |
| 学习小组/动态 | ✅ 有学习小组与动态 | 重新评估：社区化是句乐部留存抓手之一 |
| 口语测评 AI 打分 | ✅ v1.7.0 上线 | 重新评估：依赖语音模型成本，建议后置 |
| 音频/视频/音乐课程类型 | ✅ 音频解析(v1.5)+视频(v1.13) | **应上调为 P0**（内容管线核心） |
| 浏览器插件、推广分销 | ✅ Chrome 扩展 + 联盟返利(/aff/) | 重新评估：属增长层，可后置 |

> 原生 App 仍可保持排除（句乐部确实是纯网页，决策正确）。

---

## 4. 需求梳理（优先级）

### P0 — 补齐"内容供给"（决定留存，先做）
- R1 音频解析：MP3 上传 → ASR/切句 → 对齐到 statement(中/英/音标) → 生成课程包（扩展现有 ai-content）
- R2 看视频学习 + B 站一键导入：视频/B 站链接导入 → 字幕切句 → 逐句学习（结合 course.video）
- R3 学习路线(v2)：把课程包组织成「路线」导航（新手→进阶），替代/叠加现有平铺商城
- R8 看图学词：图片词卡模式（MVP 可用现有 cover/图床 + 词条）

### P1 — 学习工具与复习闭环
- R4 错题本：错句自动入本 + 独立复习入口（复用 review 数据源，新增"错误"标记）
- R5 生词本：从句子中收藏单词/短语，独立词表 + 批量添加 + 抽认复习
- R6 笔记：句级/课程级笔记
- R7 AI 助手/AI 学习教练：学习页浮窗，上下文=当前句子，DeepSeek 问答 + 智能复习建议（免费额度+会员/金币）
- R13 听力练习模式：盲听→慢速→看字幕（复用已有 audio/pronunciation composable）

### P2 — 商业化与增长
- R9 永久会员(lifetime) + 会员权益分层梳理（对齐句乐部"能量值"分层）
- R10 真实支付：Stripe（海外）/ 微信 Native（国内，依赖 ICP 备案）
- R11 邀请好友 + 邀请奖励 + 联盟返利(`/aff/<邀请码>`)
- R12 社区投稿课程审核流 + 投稿奖励（赠会员）
- R14 能量值机制：免费用户每日 80 点额度（具体规则待确认），会员免限

### P3 — 重新评估项（句乐部有、路线图曾排除，由用户决定是否纳入）
- R15 口语评测（语音输入 + AI 打分，依赖语音模型成本）
- R16 PK 对战（可先做异步排行榜式，实时对战成本高）
- R17 学习小组与动态（社区化留存抓手）
- R18 Chrome 扩展（内容收集插件）

### P4 — 部署与合规（与开发并行）
- ICP 备案、生产 docker-compose、云 PG/Redis、CDN+对象存储、备份、rate-limit、埋点

---

## 5. 实施规划（在既有路线图基础上细化）

> 与 `2026-08-29_commercial-roadmap.md` 的 Phase 0–4 对齐，并按 §4 的新需求增补。

| 阶段 | 目标 | 主要任务 | 对应需求 |
|---|---|---|---|
| Phase 0 | 工程准备(半天) | 提交换行符改动、确认 feature 分支、补 `.env.example`、建 E2E 冒烟基线、**恢复本地 dev 环境**(pnpm/docker) | — |
| Phase 1 | 内容管线 | ① 音频解析 ② 视频/字幕导入+B站导入 ③ 学习路线 ④ 图文词卡(看图学词 MVP) | R1 R2 R3 R8 |
| Phase 2 | 学习与复习闭环 | ① 错题本 ② 生词本 ③ 笔记 ④ AI 助手/教练 ⑤ 听力练习 ⑥ 复习算法对齐 | R4 R5 R6 R7 R13 |
| Phase 3 | 游戏化/商业化 | ① 永久会员+权益分层 ② 能量值机制 ③ 真实支付 ④ 邀请好友+联盟返利 ⑤ 投稿审核 | R9 R14 R10 R11 R12 |
| Phase 4 | 重新评估项(可选) | PK 对战 / 学习小组 / 口语评测 / Chrome 扩展 —— 由用户确认是否纳入 | R15 R16 R17 R18 |
| Phase 5 | 部署 | ICP/生产环境/CDN/备份/安全/埋点 | P4 |

**建议执行顺序**：P0 内容管线 → P1 学习闭环 → P2 商业化；每阶段 TDD 小步 + 验收基线（冒烟脚本全绿、`pnpm -r test`、真实浏览器走通注册→学→复习→看报告）。

---

## 6. 设计对标（待补全）

**当前限制**：Tabbit 浏览器运行时不可用（`BROWSER_RUNTIME_UNAVAILABLE`）、pwsh 沙箱网络受限（curl 无法访问外网），无法直接截图 julebu.co。

**补全方案（择一或并行）**：
1. 用户在浏览器打开 julebu.co 提供各页面截图（首页/课程商城/学习页/个人中心/会员页）；
2. 待 Tabbit 运行时恢复后，用 Playwright 抓取 julebu.co 关键页面截图 + DOM/样式提取；
3. 用 agent-reach/web_search 从评测文章（少数派等）提取设计描述与截图 URL。

**已可确定的本项目设计基线**（供后续比对）：紫/蓝强调色、Nunito 字体、暗色主题 #05051d、daisyui+nuxt-ui、shadcn HSL 变量、3 栏首页(左导航/中内容/右热力图)。

**对标设计线索（来自评测）**：句乐部是「GitHub 风」—— 代码/等宽字体界面语言、键盘打字为中心、连击借鉴音游爽感、句子+影视画面结合；这与 earthworm 的开源/代码出身同源，说明设计方向上本项目与句乐部有天然亲和度，重点补「打字交互反馈 + 音游式连击动效 + 影视画面质感」。精确配色/字体/深色模式仍待截图确认。

---

## 7. 插件与技能准备

### 7.1 技能（本会话已加载，覆盖后续开发全流程）
- `web-secondary-development`：二次开发摸底/小步改/回归 → 已遵循
- `web-frontend-practices`：前端/主题/响应式/构建链 → 已加载
- `website-debugging`：分层排障 → 已加载
- `agent-reach`：互联网调研 → 已加载（julebu.co 调研）
- `agentkey`：实时网络调用 → 已加载（本会话 MCP 工具不可见，未启用）
- `tabbit`：浏览器自动化 → 已加载（运行时当前不可用）

### 7.2 插件/依赖
- VSCode 扩展：已在 `.vscode/extensions.json`（iconify/goto-alias/tailwindcss/prettier/editorconfig/volar），用户侧安装即可
- 项目依赖：`node_modules` 已装；新增能力(音频 ASR、视频字幕解析、微信支付 SDK)需按阶段评估引入

### 7.3 环境待办（开工前需解决）
1. **pnpm**：沙箱内无法全局安装（EPERM）。需用户在终端执行 `corepack enable && corepack prepare pnpm@9.3.0 --activate`（或 `npm i -g pnpm@9`）；否则 agent 侧每次需沙箱提权
2. **Docker daemon**：沙箱内 `docker` CLI 不可达命名管道。`docker:start`/`db:init` 需在用户终端执行，或需沙箱提权
3. **Node 版本**：本机 v24.18.0 vs `.node-version` 20.12.2，建议用 nvm/fnm 对齐 20.12.2，避免 argon2 等原生模块兼容问题
4. **恢复服务**：`docker compose up -d` → `pnpm db:init` → `pnpm db:upload` → `pnpm dev:serve` + `pnpm dev:client`（首启）
5. **密钥**：`DEEPSEEK_API_KEY` 等 AI 变量需补进 `apps/api/.env`（当前 `.env.example` 未含 AI/支付/对象存储占位）

---

## 8. 开放问题（需用户确认）

### A. 决策类
1. **目标用户**：国内优先还是海外优先？（决定支付与备案优先级、品牌/域名）
2. **品牌名**：继续用「学以致用/Earthworm」还是启用「句乐部」同名（涉及商标）
3. **首发定价**：会员月付价位、是否上线永久会员及价格
4. **"暂不做"重新确认**：PK 对战 / 学习小组 / 口语评测 / Chrome 扩展，是否按句乐部现状重新纳入（见 §3.1）
5. **设计对标方式**：由用户提供 julebu.co 截图（最稳），或等 Tabbit 恢复后自动抓取

### B. 待补硬数据（需有网络环境直访 julebu.co，见调研报告末尾）
1. 会员具体人民币价格（月/季/年/永久）
2. 会员权益逐项边界（哪些功能免费/会员专享）
3. 能量值机制细则（每日 80 点如何消耗/恢复/会员是否无限）
4. v1.1~v1.3 更新日志、精确配色/视觉规范、学习模式完整枚举、连续签到规则
