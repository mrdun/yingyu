# Earthworm 商业化二次开发总规划（对标句乐部）

> **For Hermes:** 分阶段执行。每个 Phase 先由 Hermes 细化为 subagent-driven-development 任务清单（bite-sized、TDD），再派发 Codex / subagent 实现，Hermes 负责验收与部署。

**Goal:** 以开源 Earthworm（本地 `C:\Users\mrdun\Documents\codex\2026-08-27\qin\work\earthworm`，6 容器 + dev 服务已运行）为底座，对标句乐部（julebu.co，即 Earthworm 的商业版）打造可商用的英语学习平台。

**定位决策（用户已确认）：** 商业化产品，对外服务。**明确排除：PK 对战（实时 1v1）、学习小组** 两项。

**Architecture:** 保留 Nuxt 3 (client) + NestJS (api) + PostgreSQL + Redis + Logto 架构与 pnpm monorepo 结构；商业化能力以新增 NestJS 模块 + Nuxt 页面为主，少改核心 game 逻辑；支付走 Stripe（海外）/微信支付（国内，视备案情况）；AI 能力复用用户已有 DeepSeek/GLM API key。

**Tech Stack:** Nuxt 3、NestJS、Prisma（packages/db）、PostgreSQL、Redis、Logto、pnpm monorepo、Docker Compose。

---

## 现状基线（已核实）

- 本地项目运行正常：client:3000 / api:3001 / logto:3010，6 容器 healthy
- 已有模块：course、course-pack、course-history、membership（骨架）、rank、user-course-progress、user-learning-activity、mastered-element、cron-job、logto
- 已有 packages：db、schema、game-data-sdk、xingrong-courses、docs
- 未提交改动：docker-compose.yml（127.0.0.1 端口收紧补丁）、pnpm-lock.yaml、pnpm-workspace.yaml
- 开源版仅有：中译英打字、连击/评分、基础排行榜、课程包结构

## Phase 0 — 工程准备（先做，半天）

1. 提交现有 3 个未提交改动（commit 到 main）
2. 创建 `feature/commercial` 长期分支；Codex 所有改动进 feature 分支，Hermes 审后合入
3. 补 `.env.example` 完整化（AI key、支付、对象存储占位）
4. 建立 E2E 冒烟脚本：注册→学习 1 句→看进度，作为每阶段回归基线

## Phase 1 — 内容管线（最高优先级，约 1-2 周）

没有内容其他功能空转。目标是"粘贴任何英文素材 → 一键变课程"。

- **1.1 AI 拆句服务**（api 新模块 `ai-content`）：输入长文本 → DeepSeek/GLM 自动分句、翻译、生成音标与知识点讲解；输出符合现有 course/course-pack 数据结构
- **1.2 批量导入接口**：粘贴文本 / 上传 .txt/.srt / URL 抓取三种入口
- **1.3 简易编辑端页面**（client 新增 `/editor` 路由）：创建课程包 → 粘贴素材 → AI 处理 → 人工校对句子/翻译 → 发布；复用 game-data-sdk
- **1.4 首发内容**：预置 3-5 个免费课程包（如日常口语 100 句、新概念一节选），保证上线即有东西可练

验证：导入一篇 500 词文章 → 全自动生成课程 → 实际 playable

## Phase 2 — 学习模式与复习（约 2 周）

- **2.1 听写模式**：接 TTS（Edge TTS 免费 / Azure）播句子 → 用户打字；评分复用现有比对逻辑
- **2.2 听力模式**：盲听→慢速→看字幕三阶段
- **2.3 SRS 复习系统**（api 新模块 `review`）：SM-2 类算法，基于 user-course-progress 的错句数据调度；复习本 + 生词本 UI；每日复习队列
- **2.4 成长报告页**：学习时长、掌握度、连续打卡天数的可视化（已有 user-learning-activity 数据）

验证：练错的句子次日出现在复习队列；报告页数据与实际练习记录一致

## Phase 3 — 游戏化与商业化（约 2 周）

- **3.1 SSS 评级**：C→SSS 六级评级，得分率 ≥95% 为 SSS；课程最高评级持久化展示
- **3.2 每日任务 + 金币**：每日学习 X 句/复习打卡 → 金币；cron-job 模块已有基础
- **3.3 会员体系落地**（membership 模块已存在）：免费内容 + 会员课程包两级；会员=更多 AI 助手提问次数 + 付费课程包访问权
- **3.4 支付接入**：海外 Stripe Checkout；国内微信 Native 支付（依赖 ICP 备案，可后置）
- **3.5 AI 英语老师**：学习页右下角浮窗，上下文=当前句子；免费额度 2 次/天，超出扣金币/需会员（复用 DeepSeek/GLM）

验证：完成一次模拟支付 → 会员权限实时生效；AI 助手带上下文回答语法问题

## Phase 4 — 线上部署（与 Phase 3 并行推进）

1. **ICP 备案立即启动**（2-3 周周期，域名购买 + 阿里云/腾讯云备案）—— 国内商业化必须；备案期间可先部署海外节点试运营
2. 生产 docker-compose：api/client 容器化，云 PostgreSQL + 云 Redis（或同机容器 + 卷备份）
3. Logto：自托管（现有镜像）+ HTTPS 反代（Caddy/Nginx + certbot）
4. CDN + 对象存储（音频素材/未来音视频课程）：R2 或 OSS
5. 备份策略：Postgres 每日 dump 到对象存储；`.env` 密钥清单化
6. 基础安全：rate limit（api 全局）、Logto 邮箱验证、admin 后台最小化
7. 埋点（可选）：Umami 自托管，看留存与学习时长

## 暂不做（用户明确排除 + 主动 YAGNI）

- ❌ PK 实时对战（WebSocket 房间，成本高、非核心）
- ❌ 学习小组/动态
- ❌ 原生 App（对齐句乐部"纯网页"策略）
- ❌ 口语测评 AI 打分（三期后再评估，依赖音频模型成本）
- ❌ 音频/视频/音乐课程类型（Phase 5 再议；先文字 + 听写）
- ❌ 浏览器插件、推广分销

## 风险与开放问题

1. **合规**：商业化对外服务需 ICP 备案 + 主体资质；付费功能上线前确认收单路径
2. **AI 内容版权**：AI 拆句的素材由用户上传，需在条款里约定用户对素材版权负责（terms.vue 已有占位页）
3. **上游同步**：earthworm 上游（cuixueshe/earthworm）可能更新，feature 分支定期 rebase，核心 game 逻辑改动越少越容易合并
4. **Codex 产出质量**：每 Phase 用 TDD 任务粒度派发，Hermes 逐任务验收，避免大爆炸合并
5. **开放问题（待用户确认）**：① 目标用户国内还是海外（决定支付与备案优先级）② 域名/品牌名 ③ 首发定价（会员月付价位）

## 验收基线（每 Phase 完成后跑）

- E2E 冒烟脚本全绿
- `pnpm -r test` 通过
- 真实浏览器走完：注册 → 学课 → 复习 → 看报告 →（Phase 3 后）付费 → 解锁
