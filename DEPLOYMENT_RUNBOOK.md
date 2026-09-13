# DEPLOYMENT_RUNBOOK — Earthworm 生产部署手册 (TASK-002-K-01)

> 目标读者: 负责发布的值班工程师。
> 全程可在单台 2C4G 起 (API + 静态站点) + 托管 PostgreSQL/Redis 的架构上执行。
> 命令默认在仓库根目录执行。**部署顺序不可调换: 备份 → 迁移 → 后端 → 前端 → 冒烟。**

---

## 0. 部署前 10 分钟检查

```bash
git fetch --all --tags
git checkout <发布 tag 或 commit>     # 例如 v1.0.0-mvp
git status --porcelain                # 必须为空
pnpm config:check:prod -- --channels wechat,alipay   # 必须退出码 0
```

- [ ] 已完成 `PAYMENT_MERCHANT_INTEGRATION_CHECKLIST.md` 商户联调
- [ ] 已完成 `PRODUCTION_RELEASE_CHECKLIST.md` 全部勾选
- [ ] 已按 `BACKUP_RECOVERY_PLAN.md` 完成部署前备份

## 1. 服务器初始化 (首次部署)

```bash
# 1.1 基础软件 (Ubuntu 22.04 示例)
sudo apt-get update
sudo apt-get install -y curl git build-essential ca-certificates nginx

# 1.2 Node 20 (项目 engines: >=20.12.2)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v            # >= v20.12.2

# 1.3 pnpm 9 (packageManager: pnpm@9.3.0)
sudo npm i -g pnpm@9
pnpm -v

# 1.4 时区 (定时任务/佣金保护期按本地时间判断, 统一 Asia/Shanghai)
sudo timedatectl set-timezone Asia/Shanghai
```

## 2. 数据库 (PostgreSQL)

推荐托管实例 (RDS/云数据库) 并开启自动备份; 自建示例:

```bash
sudo apt-get install -y postgresql-14
sudo -u postgres psql -c "CREATE USER earthworm WITH PASSWORD '<strong-password>';"
sudo -u postgres psql -c "CREATE DATABASE earthworm OWNER earthworm;"
# 仅监听内网; 不要对公网开放 5432
```

- [ ] `DATABASE_URL=postgres://earthworm:<password>@<host>:5432/earthworm`
- [ ] 已开启自动备份 (见 `BACKUP_RECOVERY_PLAN.md`)
- [ ] 连接数上限 ≥ 50 (PM2 单实例 + 迁移任务)

## 3. Redis

```bash
sudo apt-get install -y redis-server
sudo sed -i 's/^# requirepass .*/requirepass <strong-password>/' /etc/redis/redis.conf
sudo sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sudo systemctl restart redis-server
```

- [ ] `REDIS_URL=redis://127.0.0.1:6379` + `REDIS_PASSWORD=<password>`
- [ ] 持久化按需开启 (RDB 默认即可, 见备份方案)
- [ ] 未对公网开放 6379

## 4. 代码与依赖

```bash
cd /srv/earthworm            # 代码目录
git clone <repo> .           # 首次
git checkout <tag>
pnpm install --frozen-lockfile
```

## 5. Migration 执行顺序 (关键步骤)

```bash
# 5.1 先备份 (必须在迁移前)
bash scripts/backup-db.sh 2>/dev/null || pg_dump "$DATABASE_URL" -Fc -f /backup/earthworm-$(date +%F-%H%M).dump

# 5.2 构建共享 schema 包 (API 依赖它的 dist)
pnpm schema:build

# 5.3 执行迁移 (只跑未应用的迁移; 禁止使用 drizzle-kit push)
pnpm -F @earthworm/db migrate

# 5.4 校验: 29 张业务表 + 商业种子数据
psql "$DATABASE_URL" -c "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';"
psql "$DATABASE_URL" -c "select id, price_fen, duration_days, is_active, is_public from plans order by sort_order;"
psql "$DATABASE_URL" -c "select partner_type, plan_id, rate_bps, status from partner_commission_rules;"
psql "$DATABASE_URL" -c "select key, value from business_settings order by key;"
```

**首次上线还需导入课程内容 (空库没有课程!)**:

```bash
pnpm -F @earthworm/xingrong-courses upload        # 导入课程包/课程/句子
pnpm -F @earthworm/xingrong-courses seed:content  # 学习路线 / 看图学词 示例
```

> ⚠️ `upload` 会**先清空 `course_packs`/`courses`/`statements` 再写入**。
> 仅首次上线执行; 已有用户学习数据后严禁重复执行。

## 6. 后端启动

```bash
pnpm build:server                 # schema build + nest build → apps/api/dist/src/main.js
pnpm -F api start:prod:pm         # pm2 start apps/api/ecosystem.config.js
pm2 status                        # earthworm_api 必须 online
pm2 logs earthworm_api --lines 50 # 启动日志应包含支付渠道就绪/未开启提示
```

- [ ] 启动失败时先看日志: 缺环境变量会 fail-fast 并列出缺失项
- [ ] 若日志提示「支付渠道缺少凭据」→ 补齐密钥或先在后台关闭该渠道
- [ ] 生产环境**不要**设置 `PAYMENT_PROVIDER=mock`(mock 在生产被禁用, 下单直接失败)

## 7. 前端部署 (静态站点)

```bash
# 7.1 用生产环境变量构建 (变量在构建期写入产物, 改完必须重新构建)
cat > apps/client/.env.production <<'EOF'
API_BASE=https://<api-host>
LOGTO_ENDPOINT=https://<logto-host>/
LOGTO_APP_ID=<app-id>
BACKEND_ENDPOINT=https://<api-host>/
LOGTO_SIGN_IN_REDIRECT_URI=https://<front-host>/callback
LOGTO_SIGN_OUT_REDIRECT_URI=https://<front-host>/
EOF

pnpm build:client                 # → apps/client/.output/public
```

- [ ] 产物中不含 `localhost` (抽查: `grep -r "localhost" apps/client/.output/public | head`)
- [ ] 上传 `.output/public` 到静态托管目录 (例如 `/srv/earthworm-web`)
- [ ] Logto 应用已把 `https://<front-host>/callback` 加入 Redirect URI, 前端域名加入 CORS 白名单

## 8. Nginx (HTTPS + 静态 + API 反代)

```nginx
# /etc/nginx/sites-available/earthworm
server {
  listen 80;
  server_name <front-host> <api-host>;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name <api-host>;

  ssl_certificate     /etc/letsencrypt/live/<api-host>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<api-host>/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 20m;      # AI 课程音频上传
  }
}

server {
  listen 443 ssl http2;
  server_name <front-host>;

  ssl_certificate     /etc/letsencrypt/live/<front-host>/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/<front-host>/privkey.pem;

  root /srv/earthworm-web;
  index index.html;
  location / { try_files $uri $uri/ /200.html; }   # SPA 回退 (nuxt ssr:false)

  location ~* \.(js|css|png|jpg|svg|woff2)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
  location = /index.html { add_header Cache-Control "no-cache"; }
}
```

```bash
sudo certbot --nginx -d <api-host> -d <front-host>   # HTTPS 证书 + 自动续期
sudo nginx -t && sudo systemctl reload nginx
```

## 9. CDN 配置 (可选但建议)

- 静态资源 (JS/CSS/图片) 走 CDN 回源 `<front-host>`, 缓存 30 天; `index.html`/`200.html` 不缓存。
- **不要**把 `/payment/callback/*` 与 `/api` 类接口放到 CDN 缓存规则里 (支付回调必须直达源站)。
- 若 CDN 代理 API, 必须透传 `Authorization`、`X-Forwarded-Proto`, 且不缓存 `POST`。

## 10. 发布后冒烟与验收

```bash
pnpm smoke:prod -- --base=https://<api-host> \
  --token=<普通用户JWT> --admin-token=<管理员JWT>
```

- [ ] 9 项检查全部 ✅ (`/health` 的 database/redis/logto、`/plans`、支付方式、会员状态、Partner、支付渠道)
- [ ] 用微信真机走一遍: 首页 → 会员页 → 扫码支付 → 会员生效 → 进入课程
- [ ] 后台开启渠道后复查 `/admin/payment-channels` 的 `configured=true`

## 11. 回滚流程

**代码回滚 (首选, migration 为 add-only 无需回滚数据库)**

```bash
git checkout <上一个 tag>
pnpm install --frozen-lockfile
pnpm schema:build && pnpm build:server
pnpm -F api start:prod:pm        # 或 pm2 reload earthworm_api
```

**前端回滚**: 用上一版本的 `.output/public` 覆盖静态目录 (建议每次发布保留上一版目录, 例如
`releases/web-<version>` + 软链切换)。

**数据回滚 (仅在数据被破坏时)**: 见 `BACKUP_RECOVERY_PLAN.md` 的恢复演练流程。

**回滚判定**: 出现以下任一情况立即回滚

1. `/health` database 持续 fail
2. 支付成功率 < 80% 且定位不到配置问题
3. 会员/佣金数据出现不一致 (订单 paid 但无权益, 或退款后权益仍在)
4. 全站 5xx 比例 > 1% 持续 5 分钟

## 12. 发布记录 (每次填写)

| 项                 | 值                         |
| ------------------ | -------------------------- |
| 发布版本 / tag     |                            |
| 发布 commit        |                            |
| 执行人 / 时间      |                            |
| migration 是否执行 |                            |
| smoke test 结果    |                            |
| 商户联调状态       |                            |
| 回滚判定           | ☐ 未回滚 ☐ 已回滚 (原因: ) |
