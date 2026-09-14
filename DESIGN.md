---
version: alpha
name: 学以致用
description: 温暖纸感的游戏化英语学习平台——米黄底、蓝紫主色、黄色奖励色，圆润柔和，不用黑描边。
colors:
  # ===== 营销外壳(落地页/未登录) —— 米黄方案 =====
  primary: "#4D96FF"
  primary-action: "#2F6FE8"
  primary-deep: "#2563EB"
  primary-soft: "#A29BFE"
  reward: "#FFD93D"
  reward-edge: "#EAC300"
  reward-ink: "#4A3800"
  background: "#FBF7E8"
  surface: "#FFFFFF"
  surface-alt: "#F4F6FA"
  border: "#F0EADA"
  border-cool: "#EEF2F7"
  text: "#0F172A"
  text-muted: "#5B6B80"
  text-subtle: "#7C8AA0"
  # ===== 工作台外壳(登录后) —— 采用目标站 juyouenglish.com 配色 =====
  wb-canvas: "#FFFFFF"
  wb-panel: "#F1F4FD"
  wb-card: "#FFFFFF"
  wb-card-alt: "#F8FAFE"
  wb-accent: "#2C5AF4"
  wb-accent-deep: "#2A64E7"
  wb-accent-soft: "#EFF6FF"
  wb-text: "#1E293B"
  wb-muted: "#666666"
  wb-subtle: "#8D99A9"
  wb-border: "#E5E7EB"
  wb-border-soft: "#F1F5F9"
  wb-warn-bg: "#FFF4E0"
  wb-warn-ink: "#8A4B00"
  wb-danger: "#F20D0D"
  success: "#166534"
  success-bg: "#DCFCE7"
typography:
  h1:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 52px
    fontWeight: 900
    lineHeight: 1.16
    letterSpacing: "-0.5px"
  h2:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 22px
    fontWeight: 900
    lineHeight: 1.3
  h3:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 800
    lineHeight: 1.4
  display-number:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 38px
    fontWeight: 900
    lineHeight: 1
  body:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.85
  body-sm:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 13.5px
    fontWeight: 600
    lineHeight: 1.6
  caption:
    fontFamily: PingFang SC, Microsoft YaHei, system-ui, sans-serif
    fontSize: 12px
    fontWeight: 600
    lineHeight: 1.5
rounded:
  sm: 9px
  md: 12px
  lg: 14px
  xl: 18px
  pill: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 14px
  lg: 18px
  xl: 22px
  2xl: 26px
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: 15px
  # ===== 工作台外壳(登录后) =====
  wb-button-primary:
    backgroundColor: "{colors.wb-accent}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: 10px
  wb-nav-item-active:
    backgroundColor: "{colors.wb-accent-soft}"
    textColor: "{colors.wb-accent}"
    rounded: "{rounded.md}"
    padding: 9px
  wb-card:
    backgroundColor: "{colors.wb-card}"
    textColor: "{colors.wb-text}"
    rounded: "{rounded.md}"
    padding: 16px
  wb-upsell:
    backgroundColor: "{colors.wb-warn-bg}"
    textColor: "{colors.wb-warn-ink}"
    rounded: "{rounded.md}"
    padding: 15px
  button-primary-deep:
    backgroundColor: "{colors.primary-deep}"
    textColor: "#FFFFFF"
    rounded: "{rounded.pill}"
    padding: 15px
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: 15px
  button-reward:
    backgroundColor: "{colors.reward}"
    textColor: "{colors.reward-ink}"
    rounded: "{rounded.pill}"
    padding: 9px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: 20px
  card-tinted:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: 20px
  nav-item-active:
    backgroundColor: "{colors.primary-action}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: 9px
  badge-reward:
    backgroundColor: "{colors.reward}"
    textColor: "{colors.reward-ink}"
    rounded: "{rounded.pill}"
    padding: 4px
  pill-info:
    backgroundColor: "{colors.surface-alt}"
    textColor: "{colors.primary-deep}"
    rounded: "{rounded.pill}"
    padding: 8px
---

## Overview

「学以致用」是一个**游戏化英语学习平台**，同时卖会员（¥199 永久）。视觉要在两件事之间取平衡：

1. **游戏化**——用户要感到"好玩、有奖励、想再来一局"；
2. **值得付费**——不能让用户觉得"这是个儿童玩具，不值 199 元"。

这个平衡点的做法是：**温暖纸感的米黄底 + 柔和彩色阴影 + 蓝紫渐变主色 + 黄色只做奖励色**。
整体气质：活泼、温暖、圆润、可亲，但**不用黑描边、不用硬阴影**（那是儿童向的做法，会拉低客单价感知）。

参考来源：竞品「句游英语」（juyouenglish.com）的**配色思路与游戏化元素**——米黄底、亮蓝主色、鹅黄奖励色、
圆角胶囊、连击/关卡/金币徽章。我们采其配色与游戏化语言，**但不采它的新粗野主义外壳**（2px 黑描边 + 硬阴影）。

## Colors

- **Primary (#4D96FF)**：**亮蓝，只用于大字（≥24px）、图标、装饰与渐变光晕**。⚠️ 它**不能承载白字**——白字在它上面只有 2.95:1，低于 WCAG AA 4.5:1。
- **Primary-action (#2F6FE8)**：**填充按钮与侧边栏高亮的默认底色**（白字 4.61:1，通过 AA）。与 `primary-deep` 组成按钮渐变 `135deg, #2F6FE8 → #2563EB`。
- **Primary-deep (#2563EB)**：主色**文字**（链接、进度数字）与渐变深端（白字 5.17:1）。
- **Primary-soft (#A29BFE)**：渐变的柔和端，**只用于装饰性渐变**，不单独承担文字、不承裁白字。
- **Reward (#FFD93D)**：**唯一的奖励色**——连续打卡、金币、已得奖励、完成度。见 Do's and Don'ts 第一条。
- **Reward-ink (#4A3800)**：黄底上的文字。**不要用纯白**——黄底白字在米黄环境里几乎读不出来。
- **Background (#FBF7E8)**：全站底色（米黄）。比纯白温暖、比灰更"纸质"。
- **Surface (#FFFFFF)**：卡片。**白卡在米黄底上必须带 1px border**（`colors.border`），否则边缘会"飘"。
- **Text (#0F172A)**：标题与正文主色。
- **Text-muted (#5B6B80)**：次要说明文字。**不要用 `text-subtle` 承载需要阅读的正文**（在米黄底上对比不足）。
- **Text-subtle (#7C8AA0)**：**仅限纯装饰**（如"少/多"图例）。⚠️ 它只有 3.26:1，**达不到 AA**，不得承载需要阅读的文字；需要阅读的次要文字一律用 `text-muted`。层次改用字号/字重区分，不要靠继续调淡颜色。
- **Success (#166534 / #DCFCE7)**：完成态胶囊。绿色是第四色，**克制使用**，只用于"已完成"。

### 工作台外壳调色板（登录后页面专用）

**用户已明确：会员中心等登录后页面按参考站 `juyouenglish.com` 的配色走 —— 白底 + 浅蓝面板，而不是落地页的米黄。**
色值取自目标站**真实页面计算样式**（非目测）：`.mainBox` = `#F1F4FD`、`.bgwhite` = `#F8FAFE`、
`body` = `#fff`、激活/链接主色 = `#2C5AF4`（该色在它的 CSS 中出现频次最高）。

- **WB-CANVAS (#FFFFFF)**：页面底 —— 纯白（不是米黄）。
- **WB-PANEL (#F1F4FD)**：内容面板底色（目标站 `.mainBox` 的原值），圆角 10px。
- **WB-CARD (#FFFFFF)** / **WB-CARD-ALT (#F8FAFE)**：面板上的卡片；白卡配 `wb-border` 1px 边。
- **WB-ACCENT (#2C5AF4)**：主色。**白字在它上面 5.42:1，通过 AA**，可作按钮底与激活文字。
- **WB-ACCENT-SOFT (#EFF6FF)**：侧栏**激活态**底色 —— 注意目标站的激活态是
  **"浅蓝底 + 蓝字 + 左侧蓝条"**，不是彩色实心胶囊。这一点必须照做。
- **WB-TEXT (#1E293B)** / **WB-MUTED (#666666, 5.74:1)**：正文与次要文字。
- **WB-SUBTLE (#8D99A9, 2.89:1)**：**不达 AA，仅限纯装饰**，不得承载需要阅读的文字。
- **WB-BORDER (#E5E7EB)** / **WB-BORDER-SOFT (#F1F5F9)**：卡片边与分隔线。
- **WB-WARN-BG (#FFF4E0) / WB-WARN-INK (#8A4B00)**：付费转化横幅（目标站用橙色系）。
  ⚠️ 目标站的橙底**白字**只有 2.20:1（不达标）—— 所以横幅**文字用深棕 `wb-warn-ink`，CTA 按钮用 `wb-accent` 蓝**，
  不照抄它的"橙底白字"。
- 卡片**几乎不用阴影**，靠"白卡 vs 浅蓝底"的色差分层（目标站风格）；仅在需要时给极轻投影。

**两套调色板不得混用**：营销外壳（落地页、`/game`、`/privacy-policy`、`/terms`）用米黄一组；
工作台外壳（登录后业务页）用 `wb-*` 一组。判据见下方 `## Layout`。

## Typography

系统中文字体栈（`PingFang SC` / `Microsoft YaHei`）+ `system-ui`，**不引入 web font**（构建期无 CDN 依赖）。

- **h1 (52px/900)**：仅落地页主标语。第二行用 primary→primary-soft 渐变裁字（`background-clip: text`）。
- **h2 (22px/900)**：页面标题、问候语。
- **h3 (14px/800)**：卡片区块标题（"每日任务""我的课程"）。
- **display-number (38px/900)**：打卡天数这类"成就数字"，用 primary 色。
- **body (15px/1.85)**：说明段落，行高要松（1.85）——中文长句在米黄底上需要呼吸。
- **body-sm (13.5px/600)**：列表项、侧边栏、表格。
- **caption (12px/600)**：脚注。**最小字号 12px**，再小在米黄底上就读不动了。

字重用法：**标题一律 800–900**（这是"活泼"的主要来源，比颜色更关键）；正文 400–600；数字用 900。

## Layout

**两种外壳，按登录态与页面性质切换：**

### 1. 游客营销外壳（落地页 `/` 未登录、`/privacy-policy`、`/terms`）

- 顶部导航 + 单栏居中；内容最大宽度 **1180px**，hero 最大宽度 860px。
- 区块之间垂直间距 **≥ 40px**（大留白是"舒服"的来源）。

### 2. 工作台外壳（app-shell —— 登录后所有业务页）

**参考 juyouenglish.com `/User/Index` 的骨架（用户已确认"全面照搬"）。**

```
┌──────────────┬──────────────────────────────────────────┐
│ 侧栏 rail     │  内容面板 panel                            │
│ fixed left:0 │  margin-left: rail + 10px                 │
│ 宽 212px     │  margin-top/bottom/right: 10px            │
│ 通高 100vh   │  圆角 16px · 内底色 #F8FAFC · 自身滚动       │
│ 无顶部通栏    │  内部卡片按 12px 堆叠                       │
└──────────────┴──────────────────────────────────────────┘
```

**硬性要点（照搬目标站的关键，别偷改）：**

1. **没有顶部通栏 Navbar。** Logo 移进侧栏顶部（可点回 `/`）。
2. 侧栏 **`position: fixed; left: 0; top: 0; height: 100vh`**，宽度 **212px**（目标站 176px，我们项多取宽一点），
   内部为**三张白卡**：品牌卡 / 导航卡 / 底部用户卡，卡片间距 10px，左右内边距 12px。
3. 导航卡内**分三组**，组标题 `caption` 字号 + `text-muted` 色：
   - **主导航**：主页 `/` · 课程广场 `/course-pack` · 课程向导 `/learning-path` · 我的课程 `/my-courses`
   - **学习工具**：看图学词 `/picture-word` · 复习 `/review` · 奖励 `/rewards` · 成长报告 `/stats`
   - **账户**：会员 `/membership` · 推广中心 `/partner` · 设置 `/User/Setting`
4. 底部用户卡：头像 + 用户名 + 会员状态标签；点击展开既有的 `UserMenu`。
5. 内容面板：**独立圆角面板（10px，与目标站一致）**，四周留 10px 间隙，内底色 **`wb-panel` #F1F4FD**，
   卡片白底 `wb-border` 1px 边、圆角 10–14px、间距 12px。真实实现里面板**自身滚动**（`overflow-y: auto`），
   侧栏不随内容滚动。**本外壳一律使用 `wb-*` 调色板**（见 Colors 节），不要用米黄一组的色值。
6. 侧栏**激活态**照目标站：`wb-accent-soft` 浅蓝底 + `wb-accent` 文字 + 左侧 3px 蓝条，
   **不要**用实心彩色胶囊（那是我们落地页的做法）。
7. **不做侧栏折叠**（用户已决定）：11 项不需要，省掉一套交互与状态记忆。
8. **断点**：`< 1024px` 时侧栏收起为顶栏 + 汉堡抽屉（沿用目标站的抽屉思路，带半透明遮罩）；
   实现上可先退化为"保留原顶部导航"，但**不得出现布局错乱**。

### 3. 会员中心 `/` （登录后）内容顺序（照搬目标站的信息架构）

1. **用户概览条**：头像 + 问候 + 副文案；中部 3 个胶囊（金币余额 / 今日练习 x/10 带进度条 / 连续打卡 n 天）；
   右侧 4 个圆形图标按钮（设置 / 会员 / 主题 / 退出）。
2. **会员转化横幅**（仅非会员显示）：黄底 `reward` 系 + 「了解会员权益 →」按钮（`button-reward`）。
3. **学习数据 4 列**：今日练习时长 / 今日练习句数 / 累计掌握句数 / 连续天数（四色浅底 + 大数字 + 右下角水印图标）。
4. **打卡 + 每日任务**：左打卡卡（大号连续天数 + 周历 7 格 + 底部 3 项统计）｜右每日任务（3 条进度 + 今日已得）。
   周历语义：已完成=浅蓝填充+✓；今天=蓝底实心；**未来日=虚线空框**（不要用几乎看不见的小圆点）。
5. **我的课程**：4 列课程卡（封面/标题/进度/按钮）+ 最后一格虚线「+ 添加课程」。
6. **学习热力图 + 最近 7 天柱状图**（1:1 双栏）。
7. **千句进度条**：左侧激励文案 + 右侧大号百分比 + 进度条 + `x / 1000 句`（目标常量 `SENTENCE_GOAL = 1000`，在 `utils/memberCenter.ts`）。

- 栅格：课程卡等宽 4 列 `repeat(4, 1fr)`，间距 12px。
- 断点沿用项目现状：**480 / 768 / 1024**。

## Elevation & Depth

**阴影一律带暖调**（因为底色是米黄，冷灰阴影会显脏）：

- 卡片：`0 12px 30px -18px rgba(120,95,20,.30)` —— 大扩散、低透明，像"纸片轻轻浮起"。
- 主按钮（蓝）：`0 6px 18px rgba(77,150,255,.42)` —— 彩色光晕，强化"可点"。
- 奖励按钮（黄）：`0 3px 0 rgba(180,146,0,.35)` —— **唯一允许的硬阴影**，且只用在黄色奖励元素上，制造一点点"贴纸感"。
- **禁止**：黑描边、`rgba(0,0,0,.1)` 的硬偏移大阴影（那是新粗野主义的做法，本设计明确不用）。

## Shapes

- 卡片 18px，小卡 14px，内部元素 12px，输入/按钮 9px，**胶囊 999px**。
- **Pill 是主按钮的默认形状**（圆润 = 可亲 + 游戏感）；方形按钮只在密集工具区使用。
- 圆形只用于装饰底纹，且**必须是卡片自身的背景渐变**，不要用绝对定位的圆盖在内容上（会遮字）。

## Components

- **button-primary**：全站唯一高强调操作（开启学习、继续游戏、登录后主按钮）。蓝紫 135° 渐变 + 胶囊 + 彩色光晕。
- **button-reward**：黄色胶囊 + `reward-ink` 文字 + 3px 硬阴影。**只用于"领取/奖励/金币"语义**。
- **button-ghost**：白底 + 1px `border-cool` 边 + 极轻阴影。次级操作（"看演示"）。
- **card**：白面 + 1px `border` 边 + 圆角 18px + 暖调阴影。**白卡必须带边**。
- **card-tinted**：米黄底 + 蓝向渐变（如打卡卡 `linear-gradient(135deg,#fff 58%,#F1F6FF)`）。用于需要与白卡区分的"重点卡"，**渐变必须写进背景而不是叠加层**。
- **nav-item-active**：蓝紫渐变胶囊 + 白字 + 彩色光晕；非激活态 `text-muted` 文字无背景。
- **badge-reward**：黄底 + `reward-ink` 文字 + 1px `reward-edge` 边。用于"连续 12 天""+8 币"。
- **pill-info**：浅蓝底 `rgba(77,150,255,.10)` + `primary-deep` 文字。用于"🎮 像玩游戏一样练英语"这类说明胶囊。
- **progress**：8px 高、胶囊；进度填充蓝紫渐变；**奖励类进度用 `#FFB300→#FFC72E`**（比 `reward` 深一档，否则在米黄底上糊掉）。

## Do's and Don'ts

- **对比度是硬门槛，不是口味问题。** 白字只放在 `primary-action` / `primary-deep` 上（4.61 / 5.17:1）；`primary`（#4D96FF）只放大字与装饰。可读文字的亮度下限是 `text-muted`（5.07:1 on 米黄底）。改色前先算比例，别凭眼睛估。
- **黄色是奖励色，不是装饰色。** 只用于"金币 / 连续打卡 / 完成度 / 已得奖励"。到处加黄会让它失去语义，并变成视觉噪音。
- **米黄底上，黄色元素必须自带边界**（1px `reward-edge` 边或 3px 硬阴影）。纯黄直接铺在 `background` 上会"陷进去"——这是实测结论，不是理论。
- **一个画面里只允许一个暖色锚点。** 黄色按钮和黄色徽章不要同时大面积出现。
- **不要用黑描边 / 大硬阴影。** 那会把产品拉向"儿童向"，和 ¥199 会员的定价感知冲突。
- **白卡必须带 1px 边。** 米黄底 + 纯白卡的边界在低亮度屏幕上会消失。
- **黄底不要用白字**，用 `reward-ink`。
- **不要为了图标好看混用图标库。** 现状是线性与填充混排，需统一为一套（建议 Phosphor，项目已装 iconify）。
- **不要引入 web font 或 CDN 资源。** 构建与本地预览都无外网保障。
- **装饰性图形只做背景渐变，不做绝对定位叠加层**（会遮内容，已在设计稿上踩过一次）。
- **标题字重不低于 800。** "活泼"主要靠字重与圆角，不靠高饱和撞色。
