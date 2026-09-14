# RC Local Environment

> 版本: `feature/commercial-v2` @ `ec2702d` · 模式: 生产模式 (`NODE_ENV=prod`) + 生产构建产物
> 启动时间: 2026-09-13 · 一键启动/停止见文末

## Backend API

URL: <http://localhost:3001>
Health: <http://localhost:3001/health> →

```json
{
  "status": "ok",
  "version": "v1.0.0-mvp-rc",
  "env": "prod",
  "checks": { "database": "ok", "redis": "ok", "logto": "ok" }
}
```

其他入口:

- API 文档 (Swagger): <http://localhost:3001/swagger>
- 会员方案: `GET /plans` (4 档, 价格来自数据库)
- 课程商城: `GET /course-pack` (1 个已发布免费课程包, `accessible=true`)

## Frontend

URL: <http://localhost:3000>

> ⚠️ 端口必须是 **3000**: 本地 Logto 应用只登记了 `http://localhost:3000/callback`
> 与 `http://127.0.0.1:3000/callback`, 换端口会导致登录回调失败。

已验证路由 (均返回 HTTP 200):

| 路由                        | 用途                                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `/`                         | 首页 (未登录为落地页); 「开启学习」直接进入默认课程第一组练习 (不经过商城/会员页) |
| `/game/<课程包ID>/<课程ID>` | 练习页 (默认学习入口, 游客可练免费课)                                             |
| `/course-pack`              | 课程广场 (商城入口)                                                               |
| `/membership`               | 会员方案 / 支付入口                                                               |
| `/partner`                  | 推广中心                                                                          |

## Test Accounts

登录由本地 Logto 提供 (<http://localhost:3010>), 账号密码在 Logto 中管理
(管理台: <http://localhost:3011>)。**密码由你注册时设置, 本项目不存储任何密码。**

| 角色     | 账号                    | 说明                                                                   |
| -------- | ----------------------- | ---------------------------------------------------------------------- |
| 游客     | 无需账号                | 直接访问 `http://localhost:3000` 即为游客态; 免费课程可直接学习        |
| 普通用户 | Logto 账号 `borogov`    | 本地 Logto 已有该用户 (首次登录会自动同步到 RC `users` 表)             |
| 会员用户 | 任意普通账号 + 授予会员 | 见下方「授予会员」命令 (本地无真实支付, 用后台赠送接口模拟)            |
| 管理员   | Logto 账号 `mrdun`      | 该账号在 Logto 中已分配 `default:admin` 角色 (含 `admin:access` scope) |

查看 / 刷新当前 Logto 账号列表:

```bash
node scripts/rc-grant-membership.mjs --list-users
```

若忘记密码: 打开 Logto 管理台 <http://localhost:3011> → User Management → 选中用户 → 重置密码。

### 授予会员 (制造「会员用户」)

本地 RC 使用占位支付凭据, 不走真实支付; 用既有的管理员赠送接口即可得到会员态:

```bash
# 1) 取管理员 token: 用 mrdun 登录 http://localhost:3000 →
#    F12 → Network → 任意带 Authorization 的请求 (如 /membership/status)
#    → 复制 Bearer 后面的 JWT

# 2) 授予 lifetime 会员 (把 <logtoUserId> 换成 --list-users 输出的 id)
node scripts/rc-grant-membership.mjs --userId=cqj3bi1p7g4n --planId=lifetime --token=<管理员JWT>
```

授予后刷新 `/membership` 即显示「会员生效中」, `/partner` 可走「申请成为 Partner」路径
(P2 需要 lifetime 会员资格)。

## Dependencies

| 依赖       | 地址                                                                       | 说明                                                                       |
| ---------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| PostgreSQL | host `127.0.0.1` · port `5480` · database `earthworm_rc`                   | RC 专用库, 与开发库/测试库隔离; 29 张表 + 商业 seed + 课程内容 (8865 句子) |
| Redis      | host `127.0.0.1` · port `6379`                                             | 缓存 / 排行榜                                                              |
| Logto      | endpoint `http://localhost:3010/` (state: 运行中, `/health` 中 `logto=ok`) | 认证; 管理台 <http://localhost:3011>                                       |

数据库快速自检:

```bash
node packages/db/scripts/rc-db.mjs verify earthworm_rc
# 关注 checks: tableCountOk / plansSeeded / commissionRuleSeeded / coursePacksVisible 均为 true
```

## Manual Test Start

按照 `RC_MANUAL_TEST_CHECKLIST.md` 开始测试。建议顺序:

1. 第 1 节 用户主链路 (U1–U13) — 从游客开始, 需要时用上面的「授予会员」制造会员态
2. 第 2 节 推广 / 佣金 (P1–P11) — 先用 lifetime 会员账号走 Partner 申请与归因
3. 第 3 节 后台运营 (A1–A8) — 用管理员账号 `mrdun`
4. 第 4 节 异常与边界 (E1–E8)
5. 第 5 节 移动端 (M1–M6) — 微信内置浏览器或 375×812 模拟

**真实支付/退款链路**请勿在本 RC 环境验证 (占位凭据), 按
`PAYMENT_MERCHANT_INTEGRATION_CHECKLIST.md` 在商户环境执行。

## 启动 / 停止

```bash
# 一键启动 (检查依赖 → 校验 RC 库 → 后端 3001 → 用户端 3000 → 后台 3002 → health + 地址)
pwsh scripts/start-rc-demo.ps1
# 或 Windows PowerShell 5.1: powershell -File scripts/start-rc-demo.ps1
# 只要用户端、不要管理后台: 加 -SkipAdmin

# 停止 (三个进程一起停)
pwsh scripts/start-rc-demo.ps1 -Stop
```

脚本内固定: 后端 `node apps/api/dist/src/main.js` (生产模式, **不使用 tsx**);
用户端 `node scripts/rc-static-server.mjs` (端口 3000, SPA 回退);
管理后台 `node apps/admin/scripts/serve.mjs` (端口 3002, SPA 回退; 产物缺失时自动跳过)。
日志: `rc-api.log` / `rc-web.log` / `rc-admin.log`; 进程号: `rc-demo.pids.json` (api / web / admin)。

> 不要把脚本的输出接进管道 (如 `... | tail -20`): 它启动的服务进程会继承 stdout 句柄,
> 管道永远收不到 EOF, 调用方会一直挂着 (看起来像"脚本卡死")。要留档请 `> rc-boot.log 2>&1`。

重建环境 (如数据库被改乱):

```bash
cp apps/api/.env.rc.example apps/api/.env.rc     # 首次需要, 填入本机 Logto 凭据
pwsh scripts/rc-local-prod.ps1 -Action reset      # 重建 RC 库 + migration + 内容 seed
pwsh scripts/rc-local-prod.ps1 -Action build      # 后端生产构建
pnpm build:client                                 # 前端 (需 API_BASE/LOGTO_* 指向本机)
```
