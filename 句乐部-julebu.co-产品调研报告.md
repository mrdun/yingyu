# 句乐部（julebu.co）产品调研报告

> 调研目标：为开源项目 **earthworm** 做全面对标，摸清商业化产品「句乐部」在 2026 年的产品形态。
> 调研方式：仅使用 `web_search`（环境网络受限，无法直接抓取网页正文）。所有结论均标注来源 URL；无法从搜索结果确认的细节一律标注「待确认」，不编造。

---

## 0. 核心结论速览

- **定位**：面向中文母语者的「打字学英语」游戏化 Web 应用，Slogan 为「**像玩游戏一样，用句子学英语**｜70万+用户推荐」。
- **核心玩法**：以「句子」为单位，通过**连词成句 / 打字拼写**训练，配合 i+1 可理解输入法。
- **出身**：由开源项目 [earthworm](https://github.com/cuixueshe/earthworm)（约 10k Star）商业化而来，创始人为 B 站英语教学 UP 主 **阿崔（崔学社）**，运营主体「北京句乐部科技有限公司」。
- **商业化形态**：免费 + 会员（含「永久会员」），并引入「能量值」机制做免费额度限制；配套邀请/推广/投稿等增长机制。
- **产品演进**：2025-08-31 发布 v1.0.0，至 2026-06 已演进至 v1.15+，节奏约每 2~3 周一个大版本。

---

## 1. 产品定位与核心玩法

### 1.1 定位与口号
- 首页标题/SEO 标题：「句乐部 - 像玩游戏一样，用句子学英语 | 70万+用户推荐」（[julebu.co](https://julebu.co/)）。
- 第三方导航站 Kuakua 的描述（多语言一致）：「句乐部是一个面向中文使用者的英语学习网页应用，通过句子构造练习和**连词成句、i+1**等语言学习技巧来帮助（用户）学习」——[Kuakua 中文版](https://kuakua.app/zh-CN/explore/julebu-english-learning) / [Kuakua 英文版](https://kuakua.app/explore/julebu-english-learning)。

### 1.2 方法论
官方帮助文档明确以「为什么用句子学英语」为方法论核心（[为什么用句子学英语](https://julebu.co/docs/method-sentence-learning)），并延伸出：
- **用句子学英语**（反对孤立背单词，主张在句子/语境中习得）。
- **连词成句 + i+1** 可理解输入（Krashen i+1 假说）。
- 面向**亲子/孩子学英语**场景的方法论（[如何陪孩子学英语](https://julebu.co/docs/method-parent-guide)），说明产品兼顾成人与儿童用户。

### 1.3 核心学习流程
- 「**打字学英语**」：把一句英文（通常来自课程音频/视频）拆散，用户听/看后逐词**在键盘上打出**，完成连词成句，实现「三分学七分练」。
- 官方抖音文案反复强调「**拆散句子，重新在你脑部融合**」的体验（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)）。
- 学习流程大致为：**选课程/路线 → 进入某种学习模式 → 逐句连词成句/打字 → 系统即时判对错 → 错题/生词沉淀 → 间隔重复复习**（综合 [快速上手](https://julebu.co/docs/quick-start)、[学习模式](https://julebu.co/docs/guide-learning-modes)、[复习与巩固](https://julebu.co/docs/guide-review) 推断）。

### 1.4 学习模式（多模态）
官方设有独立文档《学习模式》[julebu.co/docs/guide-learning-modes](https://julebu.co/docs/guide-learning-modes)。结合更新日志可确认至少包含以下模式：
| 模式 | 说明 | 来源 |
|---|---|---|
| 打字/连词成句 | 基础模式，逐词打字还原句子 | [简介](https://julebu.co/docs/) |
| 拼写（单词拼写） | 单词拼写训练 | 待确认（由「生词本/拼写」推断） |
| 听力练习模式 | v1.14.0 上线 | [v1.14.0](https://julebu.co/releases/2026-03-24) |
| 口语（语音输入 + 口语评测） | v1.7.0 上线，语音输入进化 + 口语评测 | [v1.7.0](https://julebu.co/releases/2025-12-13) |
| 视频观看/看视频学习 | v1.13.0 支持、v1.14.0 完善 | [v1.13.0](https://julebu.co/releases/2026-03-09) |
| 看图学词 | v1.16 版（2026-06-18）上线 | [看图学词·学习路线 v2·B站一键导入](https://julebu.co/releases/2026-06-18) |

---

## 2. 完整功能清单

> 逐项确认调研要求中列出的功能关键词。功能点名称后标注对应来源。

### 2.1 内容 / 课程类
- **看图学词**：2026-06-18 版本新上，图片 + 词汇的学习功能（[看图学词·学习路线 v2·B站一键导入](https://julebu.co/releases/2026-06-18)）。
- **学习路线（v1 → v2）**：官方系统化的进阶路线，2026-06-18 升级到 v2（同上）。早期 v1 存在但具体上线版本待确认。
- **B 站一键导入**：2026-06-18 上线，从 Bilibili 视频一键导入生成学习材料（同上）。
- **音频解析（MP3 转课程）**：上传 MP3 自动按句切分，一键生成可逐句学习的课程。v1.5.0 首发「连音频也能生成练习」（[v1.5.0](https://julebu.co/releases/2025-11-06)）；官方抖音进一步描述为「上传 MP3 → 自动切分每一句 → 生成结构化课程」（[抖音·音频解析](https://www.douyin.com/video/7565825612338810166)）。微信教程《如何创建音频/音乐课程》[mp.weixin.qq.com](https://mp.weixin.qq.com/s/exZi_CB5CELomp9a-t7PMg)。
- **看视频学习 / 视频观看模式**：v1.13.0「支持看视频学习」、v1.14.0「视频观看模式」上线（[v1.13.0](https://julebu.co/releases/2026-03-09)、[v1.14.0](https://julebu.co/releases/2026-03-24)）。
- **课程资源**：官方持续扩充影视作品练习资源（如《疯狂动物城》等「近百部影视作品」）（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)）；经典教材如《新概念英语》第 1-4 册美音全辑（由社区用户投稿）（[抖音·音频解析](https://www.douyin.com/video/7565825612338810166)）。

### 2.2 学习辅助类
- **生词本**：v1.9.0「生词本功能增强」，另有《如何批量添加生词》文档（[v1.9.0](https://julebu.co/releases/2025-12-30)、[批量添加生词](https://julebu.co/docs/guide-custom-vocabulary)）。
- **错题本**：v1.4.0「错题本全面升级」（[v1.4.0](https://julebu.co/releases/2025-10-11)）。
- **笔记**：v1.15.0 新增（[v1.15.0](https://julebu.co/releases/2026-04-19)）。
- **复习 / 间隔重复**：官方文档《复习与巩固》[julebu.co/docs/guide-review](https://julebu.co/docs/guide-review)；v1.11.0 推出「智能复习体系」（[v1.11.0](https://julebu.co/releases/2026-01-30)），v1.15.0「复习全面升级」（[v1.15.0](https://julebu.co/releases/2026-04-19)）。
- **AI 助手 / AI 学习教练**：v1.11.0「你的专属 AI 学习教练——智能复习体系」（[v1.11.0](https://julebu.co/releases/2026-01-30)）；v1.13.0「AI 助手来啦」（[v1.13.0](https://julebu.co/releases/2026-03-09)）；官方文档《AI 智能助手》[julebu.co/docs/guide-ai-assistant](https://julebu.co/docs/guide-ai-assistant)。
- **口语评测**：v1.7.0「语音输入全面进化，口语评测上线」（[v1.7.0](https://julebu.co/releases/2025-12-13)）。

### 2.3 游戏化 / 激励类
- **连击（Combo）系统**：v1.10.0「像玩音游一样，让英语“流淌”指尖，连击系统来啦」（[v1.10.0](https://julebu.co/releases/2026-01-19)）；官方文档《连击激励》[julebu.co/docs/guide-combo](https://julebu.co/docs/guide-combo)。
- **每日任务与金币**：官方文档《每日任务与金币》[julebu.co/docs/guide-tasks-coins](https://julebu.co/docs/guide-tasks-coins)。
- **打卡 / 成长记录 / 学习分析**：官方文档《成长记录与学习分析》[julebu.co/docs/guide-growth-analytics](https://julebu.co/docs/guide-growth-analytics)。（「打卡」的具体连续签到形式待确认，但成长记录/分析已确认存在。）
- **PK 对战与排行榜**：官方文档《PK 对战与排行榜》[julebu.co/docs/guide-pk-leaderboard](https://julebu.co/docs/guide-pk-leaderboard)；v1.6.0 主打「无朋友，不学习」的社交化方向（[v1.6.0](https://julebu.co/releases/2025-11-30)）。
- **能量值机制**：免费额度限制机制，v1.9.2 将「能量值」调整为 80 点（[v1.9.2](https://julebu.co/releases/2026-01-03)）。具体消耗/恢复规则**待确认**。

### 2.4 社交 / 社区类
- **学习小组与动态**：官方文档《学习小组与动态》[julebu.co/docs/guide-study-groups](https://julebu.co/docs/guide-study-groups)。
- **社区互动**：官方文档《社区互动》[julebu.co/docs/guide-community](https://julebu.co/docs/guide-community)。
- **社区 / 投稿课程**：官方鼓励用户投稿课程并给奖励（例：投稿《新概念英语》获得「1 个月会员」官方奖励）（[抖音·音频解析](https://www.douyin.com/video/7565825612338810166)）。
- **分享**：见「推广与激励」文档（[推广与激励](https://julebu.co/docs/guide-promotion-rewards)）。
- **邀请好友**：v1.15.0 上线（[v1.15.0](https://julebu.co/releases/2026-04-19)）。

### 2.5 创作 / 自定义类
- **课程包 / 自定义课程编辑器（编辑端）**：官方文档《制作课程包》[julebu.co/docs/guide-create-course](https://julebu.co/docs/guide-create-course)；创始人 B 站视频称「全新的编辑端已就绪」，并规划「允许用户上传 or 基于模型来（生成）」（[B站·编辑端](https://www.bilibili.com/video/BV1jjBYYdEsN/)）。

### 2.6 会员 / 权益类
- **会员 / 永久会员**：官方文档《会员介绍》[julebu.co/docs/membership](https://julebu.co/docs/membership) 与《常见问题-会员与付费》[julebu.co/docs/faq-membership](https://julebu.co/docs/faq-membership)；v1.9.0「永久会员权益升级」（[v1.9.0](https://julebu.co/releases/2025-12-30)）。详见第 4 章。

### 2.7 其他
- **个性化设置**：官方文档《个性化设置》[julebu.co/docs/guide-settings](https://julebu.co/docs/guide-settings)。
- **浏览器扩展**：官方 Chrome 扩展「julebu — 学习内容收集与管理插件」（[Chrome Web Store](https://chromewebstore.google.com/detail/julebu/gmkofomdaojpfmeejhfffmjgikfpfgbg)）。
- **第三方增强脚本**：社区油猴脚本「句乐部 - 增强学习助手」（[Greasy Fork](https://greasyfork.org/en/scripts/557495-%E5%8F%A5%E4%B9%90%E9%83%A8-%E5%A2%9E%E5%BC%BA%E5%AD%A6%E4%B9%A0%E5%8A%A9%E6%89%8B/versions)）。

---

## 3. 页面 / 导航结构（站点信息架构推断）

> 说明：以下基于帮助文档目录 + 首页 + 第三方评测推断，未直接抓取 DOM，标注推断性质。

- **首页 / 落地页**：品牌口号 + 用户量背书（70万+）+ 课程入口；示例 URL 带 `?courseId=21`，说明支持课程直达分享链接（[julebu.co](https://julebu.co/)）。
- **学习页（游戏页）**：打字/连词成句主界面，含上一题/下一题样式控制等（对应 earthworm Issue #430「更改游戏页上一个/下一个题目样式控制」，[GitHub Issue](https://github.com/cuixueshe/earthworm/issues/430)）。
- **课程列表 / 学习路线页**：按「学习路线 v2」组织课程；含影视、教材、自建课程包等分类（[看图学词·学习路线 v2](https://julebu.co/releases/2026-06-18)）。
- **个人中心**：承载生词本、错题本、笔记、成长记录/学习分析、每日任务、金币、设置等（综合各 guide 文档推断）。
- **会员页**：会员介绍 + 权益分层 + 开通入口（[会员介绍](https://julebu.co/docs/membership)）。
- **数据统计页 / 成长记录页**：学习分析、打卡、成长曲线（[成长记录与学习分析](https://julebu.co/docs/guide-growth-analytics)）。
- **排行榜 / PK 页**：[PK 对战与排行榜](https://julebu.co/docs/guide-pk-leaderboard)。
- **社区 / 学习小组页**：[学习小组与动态](https://julebu.co/docs/guide-study-groups)、[社区互动](https://julebu.co/docs/guide-community)。
- **帮助文档中心**：`julebu.co/docs/*` 下约 20 篇文档，覆盖快速上手、方法论、功能指南、会员、FAQ、联系我们（[帮助文档](https://julebu.co/docs/)）。
- **法务页**：用户服务协议（[terms](https://julebu.co/terms)）。
- **推广/邀请落地页**：`julebu.co/aff/<邀请码>`（如 `aff/P0A0AAYR`），说明存在联盟/邀请注册落地页（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)）。

---

## 4. 会员与定价

- **会员体系**：存在「会员」与「永久会员（终身）」两个概念，v1.9.0 标题即为「永久会员权益升级」（[v1.9.0](https://julebu.co/releases/2025-12-30)）。
- **免费额度限制**：以「能量值」机制做免费额度控制，v1.9.2 将能量值调整为「80 点」（[v1.9.2](https://julebu.co/releases/2026-01-03)）。推测免费用户每日 80 点能量、会员不限（**具体规则待确认**）。
- **权益对象（推断）**：AI 助手/智能复习、视频/音频高级模式、更多课程等通常为会员权益（**逐项权益待确认**，来源仅指向会员文档本身：[会员介绍](https://julebu.co/docs/membership)、[FAQ-会员与付费](https://julebu.co/docs/faq-membership)）。
- **具体价格（月卡/季卡/年卡/永久会员金额）**：**待确认**。搜索结果未能返回具体人民币金额，仅能确认存在「月/季/年/永久」多档（由「永久会员」「会员」多个概念 + 抖音「1 个月会员」奖励文案推断）。
- **促销/早鸟**：v1.9.2 能量值调整、v1.9.0 永久会员权益升级暗示会员权益/定价发生过调整；「限时注册领取超久时长」等抖音文案说明存在限时赠送活动（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)）。具体价格仍**待确认**。

---

## 5. 设计风格与品牌调性

> 以下主要从第三方评测/标题描述推断，未直接截图，标注推断性。

- **「GitHub 风」**：有评测文章直接以「发现一款“GitHub 风”的英语学习工具，交互设计深得我心」为题（[CSDN](https://blog.csdn.net/m0_73399245/article/details/156304886)），说明产品视觉带有**代码/GitHub 式界面语言**（等宽、暗色/代码块感），这与 earthworm 开源出身一致。
- **键盘/打字为中心**：核心交互是打字，界面围绕「逐词敲击」「连词成句」设计，连击系统借鉴「音游」的爽感（[v1.10.0](https://julebu.co/releases/2026-01-19)），强调连击动画/反馈。
- **配色**：earthworm 开源项目以绿色为主题色（对应用户直觉中的「绿色打字/学习」印象），句乐部具体主色**待确认**（无直接截图描述来源）。
- **品牌调性**：轻快、游戏化、社区化（「无朋友，不学习」「像玩游戏一样」），主理人阿崔以 B 站教学 UP 主身份背书，品牌人格化强。
- **内容展示**：抖音宣传语「让每个句子都清晰如画」「近百部影视作品」暗示学习页有**句子 + 影视画面**结合的视觉呈现（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)）。
- **深色模式 / 主题**：存在「个性化设置」文档（[guide-settings](https://julebu.co/docs/guide-settings)），是否含深色主题**待确认**。

---

## 6. 更新日志时间线（产品演进）

> 均来自 `julebu.co/releases/*` 官方更新日志标题。v1.1~v1.3 的具体日志未能检索到，标待确认。

| 日期 | 版本 | 标题 / 主要内容 | 来源 |
|---|---|---|---|
| 2025-08-31 | v1.0.0 | 全新的开始！（正式上线） | [v1.0.0](https://julebu.co/releases/2025-08-31) |
| 2025-09~10 | v1.1~v1.3 | **待确认**（检索未命中，推测为功能补齐/学习路线初版阶段） | — |
| 2025-10-11 | v1.4.0 | 「错题本」全面升级 | [v1.4.0](https://julebu.co/releases/2025-10-11) |
| 2025-10-30 | v1.4.1 | 更新几个小功能 | [v1.4.1](https://julebu.co/releases/2025-10-30) |
| 2025-11-06 | v1.5.0 | 除了文字，连音频也能直接生成英语练习（音频解析） | [v1.5.0](https://julebu.co/releases/2025-11-06) |
| 2025-11-30 | v1.6.0 | 全新版本「无朋友，不学习」（社交化） | [v1.6.0](https://julebu.co/releases/2025-11-30) |
| 2025-12-13 | v1.7.0 | 语音输入全面进化 + 口语评测上线 | [v1.7.0](https://julebu.co/releases/2025-12-13) |
| 2025-12-25 | v1.8.0 | 致句乐部伙伴的一封信：关于改变、压力与未来（商业化转向） | [v1.8.0](https://julebu.co/releases/2025-12-25) |
| 2025-12-30 | v1.9.0 | 永久会员权益升级 & 生词本功能增强 | [v1.9.0](https://julebu.co/releases/2025-12-30) |
| 2026-01-03 | v1.9.2 | 能量值机制调整为 80 点（免费额度） | [v1.9.2](https://julebu.co/releases/2026-01-03) |
| 2026-01-19 | v1.10.0 | 连击系统（音游式爽感） | [v1.10.0](https://julebu.co/releases/2026-01-19) |
| 2026-01-30 | v1.11.0 | 专属 AI 学习教练——智能复习体系 | [v1.11.0](https://julebu.co/releases/2026-01-30) |
| 2026-02-15 | v1.12.0 | 新年快乐（节日版） | [v1.12.0](https://julebu.co/releases/2026-02-15) |
| 2026-03-09 | v1.13.0 | AI 助手 + 支持看视频学习 | [v1.13.0](https://julebu.co/releases/2026-03-09) |
| 2026-03-24 | v1.14.0 | 视频观看模式 + 听力练习模式 | [v1.14.0](https://julebu.co/releases/2026-03-24) |
| 2026-04-19 | v1.15.0 | 邀请好友 + 笔记功能 + 复习全面升级 | [v1.15.0](https://julebu.co/releases/2026-04-19) |
| 2026-06-18 | （v1.16，推断） | 看图学词 · 学习路线 v2 · B 站一键导入 | [看图学词·学习路线 v2·B站一键导入](https://julebu.co/releases/2026-06-18) |

**演进主线小结**：基础打字/连词 → 错题/复习沉淀 → 音频内容生产（MP3→课程）→ 社交化（小组/排行榜/无朋友不学习）→ 口语（语音+评测）→ 商业化（会员/永久会员/能量值）→ 游戏化强化（连击/金币/任务）→ AI 化（AI 教练/智能复习/AI 助手）→ 多媒体化（视频/听力/看图学词）→ 增长工具（邀请/笔记/复习升级）→ 内容入口扩张（B 站导入/学习路线 v2）。

---

## 7. 社区 / 增长机制

- **邀请好友**：v1.15.0 正式上线邀请功能（[v1.15.0](https://julebu.co/releases/2026-04-19)）。
- **推广与激励（分享/返利）**：官方文档《推广与激励》[julebu.co/docs/guide-promotion-rewards](https://julebu.co/docs/guide-promotion-rewards)；存在联盟邀请链接格式 `julebu.co/aff/<邀请码>`（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)），说明有**邀请注册返利/奖励**体系。
- **分享奖励 / 赠会员**：官方在抖音等渠道以「限时注册领取超久时长」「官方奖励 1 个月会员」刺激拉新与投稿（[抖音·疯狂动物城](https://www.douyin.com/video/7584813077200211240)、[抖音·音频解析](https://www.douyin.com/video/7565825612338810166)）。
- **社群运营**：官方主页挂「粉丝群」（主页粉丝群获得课程链接），并运营学习小组、社区互动（[抖音·音频解析](https://www.douyin.com/video/7565825612338810166)、[学习小组与动态](https://julebu.co/docs/guide-study-groups)、[社区互动](https://julebu.co/docs/guide-community)）。
- **内容增长**：以「投稿课程」激励用户生产内容（UGC 课程包），官方给投稿用户奖励会员（[抖音·音频解析](https://www.douyin.com/video/7565825612338810166)）。
- **媒体/达人背书**：创始人阿崔参与播客访谈传播（《超越之路》《502 播客》《狗熊有话说》等），多平台内容矩阵（B站/抖音/小红书/微信/少数派评测）。（[EarsOnMe 超越之路](https://earsonme.com/podcasts/ZNcaI2Lh/episodes)、[502 播客·Snipd](https://share.snipd.com/episode/f969b565-11c0-4f36-b32b-a8814366486b)、[少数派评测](https://sspai.com/post/105203)）

---

## 附：功能清单总表

> 「是否有会员限制」列为**推断**，凡未在搜索结果中明确证据的标注「待确认」。来源为可点击链接或文档名。

| 功能名 | 说明 | 是否有会员限制 | 来源 |
|---|---|---|---|
| 打字学英语 / 连词成句 | 核心玩法，逐词打字还原句子 | 免费（核心功能） | [简介](https://julebu.co/docs/) |
| 学习模式（打字/拼写/听力/口语/视频/看图） | 多模态训练 | 部分模式可能受限（待确认） | [学习模式](https://julebu.co/docs/guide-learning-modes) |
| 看图学词 | 图片+词汇学习 | 待确认 | [2026-06-18](https://julebu.co/releases/2026-06-18) |
| 学习路线（v1→v2） | 系统化进阶路线 | 待确认 | [2026-06-18](https://julebu.co/releases/2026-06-18) |
| B 站一键导入 | 从 Bilibili 视频导入生成课程 | 待确认 | [2026-06-18](https://julebu.co/releases/2026-06-18) |
| 音频解析（MP3→课程） | 上传 MP3 自动切句生成课程 | 待确认 | [v1.5.0](https://julebu.co/releases/2025-11-06)、[抖音](https://www.douyin.com/video/7565825612338810166) |
| AI 助手 / AI 学习教练 | AI 答疑、智能复习 | 很可能会员（待确认） | [v1.11.0](https://julebu.co/releases/2026-01-30)、[v1.13.0](https://julebu.co/releases/2026-03-09)、[AI 助手文档](https://julebu.co/docs/guide-ai-assistant) |
| 看视频学习 / 视频观看模式 | 视频内容学习 | 待确认 | [v1.13.0](https://julebu.co/releases/2026-03-09)、[v1.14.0](https://julebu.co/releases/2026-03-24) |
| 听力练习模式 | 听力训练 | 待确认 | [v1.14.0](https://julebu.co/releases/2026-03-24) |
| 口语评测 | 语音输入 + 口语评测 | 待确认 | [v1.7.0](https://julebu.co/releases/2025-12-13) |
| 生词本 | 生词收集与批量添加 | 免费（增强） | [v1.9.0](https://julebu.co/releases/2025-12-30)、[批量添加生词](https://julebu.co/docs/guide-custom-vocabulary) |
| 错题本 | 错题沉淀 | 免费 | [v1.4.0](https://julebu.co/releases/2025-10-11) |
| 笔记 | 学习笔记 | 待确认 | [v1.15.0](https://julebu.co/releases/2026-04-19) |
| 复习 / 间隔重复 / 智能复习 | 复习体系 | AI 智能复习可能会员（待确认） | [复习与巩固](https://julebu.co/docs/guide-review)、[v1.11.0](https://julebu.co/releases/2026-01-30) |
| 每日任务与金币 | 任务 + 金币激励 | 免费 | [每日任务与金币](https://julebu.co/docs/guide-tasks-coins) |
| 连击（Combo）激励 | 音游式连击反馈 | 免费 | [v1.10.0](https://julebu.co/releases/2026-01-19)、[连击激励](https://julebu.co/docs/guide-combo) |
| PK 对战与排行榜 | 好友/全局对战排行 | 待确认 | [PK 对战与排行榜](https://julebu.co/docs/guide-pk-leaderboard) |
| 学习小组与动态 | 小组社交 | 待确认 | [学习小组与动态](https://julebu.co/docs/guide-study-groups) |
| 成长记录 / 学习分析 | 学习数据与打卡分析 | 待确认 | [成长记录与学习分析](https://julebu.co/docs/guide-growth-analytics) |
| 能量值机制 | 免费额度（80 点/日） | 免费额度受限，会员免限（待确认） | [v1.9.2](https://julebu.co/releases/2026-01-03) |
| 会员 / 永久会员 | 付费权益 | —（即付费本身） | [会员介绍](https://julebu.co/docs/membership)、[v1.9.0](https://julebu.co/releases/2025-12-30) |
| 课程包 / 自定义课程编辑器 | 用户自制/编辑课程 | 待确认 | [制作课程包](https://julebu.co/docs/guide-create-course)、[B站·编辑端](https://www.bilibili.com/video/BV1jjBYYdEsN/) |
| 社区 / 投稿课程 | UGC 内容 + 官方奖励 | 免费（投稿有奖励） | [社区互动](https://julebu.co/docs/guide-community)、[抖音](https://www.douyin.com/video/7565825612338810166) |
| 邀请好友 | 邀请注册 | 免费 | [v1.15.0](https://julebu.co/releases/2026-04-19) |
| 分享 / 推广与激励 | 分享、联盟返利 | 免费 | [推广与激励](https://julebu.co/docs/guide-promotion-rewards) |
| 个性化设置 | 学习偏好设置 | 免费 | [个性化设置](https://julebu.co/docs/guide-settings) |
| Chrome 扩展 | 学习内容收集与管理 | 免费 | [Chrome Web Store](https://chromewebstore.google.com/detail/julebu/gmkofomdaojpfmeejhfffmjgikfpfgbg) |

---

## 待确认 / 缺口清单

1. **会员具体价格**（月卡/季卡/年卡/永久会员的人民币金额）——搜索未能命中，需直接访问会员页确认。
2. **会员权益逐项边界**（哪些功能免费、哪些会员专享）——仅能定位到会员文档入口，细节待确认。
3. **能量值机制具体规则**（每日 80 点如何消耗、恢复、会员是否无限）——待确认。
4. **v1.1 ~ v1.3 更新日志**——检索未命中具体标题。
5. **精确配色 / 视觉规范**（主色、深色模式、字体）——仅有「GitHub 风」的描述性线索，需截图确认。
6. **学习模式完整枚举**（拼写、单词等模式是否独立存在）——由文档名与更新日志推断，细节待确认。
7. **打卡/连续签到**的具体形态——仅有「成长记录与学习分析」「每日任务」佐证，连续签到规则待确认。

> 调研环境说明：本会话 pwsh 沙箱网络受限（实测 `Invoke-WebRequest` 到 r.jina.ai 超时），无法直接抓取 julebu.co 页面正文；以上结论全部来自 `web_search` 返回的标题、摘要与来源 URL。如需精确到「价格/权益边界/配色」等细节，建议在有网络的环境直接访问 `julebu.co/docs/*` 与 `julebu.co/releases/*` 页面。
