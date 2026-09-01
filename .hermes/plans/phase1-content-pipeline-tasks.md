# Phase 1 内容管线 — 任务拆解（TDD）

> 目标验证基线：「粘贴/上传任意英文素材 → 一键变课程 → 实际可学」
> 决策见 `benchmark-gap-analysis.md` 顶部决策记录（国内优先 / 学以致用 / 会员月付+永久会员）

## 进度快照（Round 3 完成）

- ✅ R3 学习路线：schema + API + 前端 + 测试 + seed（Round 1）
- ✅ R8 看图学词：schema + API + 前端 + seed（Round 1）
- 🟡 R2 看视频/字幕导入：字幕(.srt/.vtt)解析→课程包链路已通 + editor 文件上传（Round 2/3）；**B站 URL 抓取待方案决策**
- 🟡 R1 音频解析：**架构已搭**（AsrProvider 接口 + ASR_PROVIDER token + WhisperAsrProvider 参考实现 + `/ai-content/audio` 端点 + AudioDto + TDD 测试，已 Node TS-strip 验证加载）；**待定实际 ASR 服务商 + key**
- ✅ 验证方法：Node 24 原生 TS 剥离可跑纯函数（subtitle-parser、asr-provider 已实测；注意不支持 TS 参数属性，已规避）
- ⚠️ 完整构建/测试仍需用户侧：`pnpm schema:build` + `pnpm db:init` + `pnpm -F api test:unit`

## ✅ 用户侧验证结果（2026-08-27）

`pnpm -F api test:unit` 全部通过：
- **subtitle-parser**：6 tests PASS（SRT/VTT 解析、NOTE 跳过、内联标签、自动识别、文本合并）
- **learning-path**：PASS（findAll 只返回已发布+计数、findOne 按序返回+NotFound）
- **ai-content-audio**：3 tests PASS（base64→转写→createCoursePack、空结果 400、ASR 失败 500）

> 说明：learning-path 首次因 test DB 未初始化 FAIL，`db:init:test` 后通过 —— 符合预期（测试需 testdb）。

## 最终决策（已确认）
- R1 ASR：**OpenAI Whisper 默认**（provider 接口可插拔）
- R2：**不做 B站 URL 抓取**，字幕文件(.srt/.vtt)粘贴/上传版收尾
- `.env.example` 已补 `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` 占位

## 剩余（用户侧动作，代码已全齐）
- 把 `OPENAI_API_KEY` + `DEEPSEEK_API_KEY` 填入 `apps/api/.env`，重启后端试 `/editor` 音频+字幕导入
- 前端页面浏览器验证（`dev:client` 后看 `/learning-path`、`/picture-word`、`/editor`；先跑 `seed:content` 造数据）
- 跑一次 `pnpm -F api test:unit` 验证新增的 picture-word spec

## 环境
- ✅ pnpm 9.3.0：通过 `$env:COREPACK_HOME="$PWD\.corepack"` 在沙箱内可用
- ⚠️ Docker：沙箱内 CLI 不可达命名管道，Postgres/Redis 容器需用户侧 `docker compose up -d`
- ✅ 后端测试可用 pglite（devDeps 已有 `@electric-sql/pglite`），无需 Docker

## 依赖与决策点（需尽早定）
1. **ASR 服务商**（R1 音频解析）：国内优先 → 阿里云/腾讯云/智谱 GLM-4 音频；需用户提供 key
2. **B 站字幕获取**（R2）：B 站视频 cc 字幕 API / 三方解析；需确认稳定性与是否需登录
3. **图片存储**（R8 看图学词）：先用现有封面图床/静态资源，对象存储后置

## 任务分解（bite-sized，TDD，每任务独立可验收）

### T0 — 内容模型基座（schema，先做）
- [ ] statement 表增加 `sourceType`(text/audio/video) + `audioUrl` + 时间戳字段（为 R1/R2 逐句回放）
- [ ] 新增 `learning_paths` / `learning_path_items` 表（R3）
- [ ] 新增 `picture_words` 表（R8）
- [ ] drizzle 迁移 + `pnpm schema:build`

### R3 — 学习路线（无外部依赖，先做）
- [ ] T3.1 schema：learning_paths + learning_path_items（路线 → 有序课程包）
- [ ] T3.2 API：learning-path 模块（列表/详情/按路线取课程包）
- [ ] T3.3 前端：`/learning-path` 页 + WorkNav 入口 + 路线卡片导航
- [ ] T3.4 预置 1 条示例路线（现有 12 个 AI 课程包组织成「新手→进阶」）

### R8 — 看图学词
- [ ] T8.1 schema：picture_words（word/中文/音标/图片/关联）
- [ ] T8.2 API：picture-word 模块
- [ ] T8.3 前端：看图学词学习模式（图 + 打字/选择）
- [ ] T8.4 预置图片词数据

### R2 — 看视频 / B 站导入
- [ ] T2.1 字幕提取服务（B 站 cc 字幕 API / 通用字幕）
- [ ] T2.2 API：video-import（链接 → 字幕 → 复用文本拆句 → 课程包）
- [ ] T2.3 前端：`/editor` 增加视频导入入口
- [ ] T2.4 视频学习页（视频 + 逐句对齐）

### R1 — 音频解析（MP3 → 课程）
- [ ] T1.1 ASR 服务抽象（provider 接口，默认国内云 ASR）
- [ ] T1.2 API：audio-import（MP3 上传 → ASR → 切句 → 课程包）
- [ ] T1.3 前端：`/editor` 增加音频上传入口
- [ ] T1.4 逐句音频回放（statement 时间戳对齐）

## 验收基线（每任务 + 每阶段）
- 每任务 TDD：先写测试 → 实现 → 全绿
- `pnpm -F api test` / `pnpm -F client test:unit:run` 通过
- 阶段冒烟：上传素材 → 生成课程 → 实际可学（真实浏览器）

## 执行顺序建议
T0 基座 → R3（路线）→ R8（看图学词）→ R2（视频/B站）→ R1（音频，需先定 ASR 服务商）
