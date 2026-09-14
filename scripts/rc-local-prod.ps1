<#
.SYNOPSIS
  本地 RC (Release Candidate) 生产环境验证脚本 — TASK-002-L-01

.DESCRIPTION
  在本地以「生产模式」准备并启动后端, 用于上线前 RC 验证:
    1. 创建/重建 RC 专用数据库 (earthworm_rc, 与开发库/测试库隔离)
    2. 执行生产 migration (drizzle-kit migrate)
    3. 导入商业 seed (migration 内置) 与课程内容 seed
    4. 生产构建后端 (schema build + nest build)
    5. 以 NODE_ENV=prod 启动 (读取 apps/api/.env.rc)

  前置: PostgreSQL(5480) / Redis(6379) / Logto(3010) 已启动 (docker compose up -d).
  配置文件: 复制 apps/api/.env.rc.example → apps/api/.env.rc 并填写本机值 (该文件不提交).

.EXAMPLE
  pwsh scripts/rc-local-prod.ps1 -Action reset    # 重建 RC 库 + 迁移 + 内容 seed
  pwsh scripts/rc-local-prod.ps1 -Action migrate  # 只跑迁移
  pwsh scripts/rc-local-prod.ps1 -Action seed     # 只导入课程内容
  pwsh scripts/rc-local-prod.ps1 -Action build    # 生产构建后端
  pwsh scripts/rc-local-prod.ps1 -Action start    # 生产模式启动 (前台)
#>
param(
  [ValidateSet("reset", "migrate", "seed", "build", "start")]
  [string]$Action = "migrate",
  [string]$RcDbName = "earthworm_rc"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot "apps/api/.env.rc"

# 优先使用仓库自带的 pnpm (Windows), 避免 PATH 中的其它 pnpm 干扰
$pnpmCmd = Join-Path $repoRoot "pnpm.cmd"
$pnpm = if (Test-Path $pnpmCmd) { $pnpmCmd } else { "pnpm" }

if (-not (Test-Path $envFile)) {
  throw "缺少 $envFile — 请先复制 apps/api/.env.rc.example 并填写本机值"
}

# 解析 .env.rc (简单 key=value, 支持引号)
$rcEnv = @{}
foreach ($line in Get-Content $envFile) {
  $trimmed = $line.Trim()
  if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
  $idx = $trimmed.IndexOf("=")
  if ($idx -lt 0) { continue }
  $key = $trimmed.Substring(0, $idx).Trim()
  $value = $trimmed.Substring($idx + 1).Trim().Trim('"')
  $rcEnv[$key] = $value
}

if (-not $rcEnv.ContainsKey("DATABASE_URL")) { throw "apps/api/.env.rc 缺少 DATABASE_URL" }
if ($rcEnv["DATABASE_URL"] -notmatch [regex]::Escape($RcDbName)) {
  throw "安全保护: DATABASE_URL 必须指向 RC 专用库 '$RcDbName' (当前: $($rcEnv['DATABASE_URL']))"
}

function Invoke-InRepo([string]$Command) {
  Push-Location $repoRoot
  try { Invoke-Expression $Command } finally { Pop-Location }
}

switch ($Action) {
  "reset" {
    Write-Host "== 重建 RC 数据库 $RcDbName (仅影响 RC 库) ==" -ForegroundColor Cyan
    Invoke-InRepo "& '$pnpm' exec node packages/db/scripts/rc-db.mjs reset $RcDbName"
    $env:DATABASE_URL = $rcEnv["DATABASE_URL"]
    Invoke-InRepo "& '$pnpm' -F @earthworm/db migrate"
    Invoke-InRepo "& '$pnpm' -F @earthworm/xingrong-courses upload"
    Invoke-InRepo "& '$pnpm' -F @earthworm/xingrong-courses seed:content"
    Invoke-InRepo "node packages/db/scripts/rc-db.mjs verify $RcDbName"
  }
  "migrate" {
    $env:DATABASE_URL = $rcEnv["DATABASE_URL"]
    Invoke-InRepo "& '$pnpm' -F @earthworm/db migrate"
    Invoke-InRepo "node packages/db/scripts/rc-db.mjs verify $RcDbName"
  }
  "seed" {
    $env:DATABASE_URL = $rcEnv["DATABASE_URL"]
    Invoke-InRepo "& '$pnpm' -F @earthworm/xingrong-courses upload"
    Invoke-InRepo "& '$pnpm' -F @earthworm/xingrong-courses seed:content"
    Invoke-InRepo "node packages/db/scripts/rc-db.mjs verify $RcDbName"
  }
  "build" {
    Invoke-InRepo "& '$pnpm' build:server"
  }
  "start" {
    foreach ($key in $rcEnv.Keys) { Set-Item -Path "env:$key" -Value $rcEnv[$key] }
    $env:NODE_ENV = "prod"
    Write-Host "== 以生产模式启动 API (NODE_ENV=prod) ==" -ForegroundColor Cyan
    Invoke-InRepo 'node apps/api/dist/src/main.js'
  }
}
