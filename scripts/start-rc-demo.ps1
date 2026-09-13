<#
.SYNOPSIS
  RC 本地演示环境一键启动 (TASK-002-M-01)

.DESCRIPTION
  1. 检查依赖服务: PostgreSQL(5480) / Redis(6379) / Logto(3010)
  2. 校验 RC 数据库就绪 (earthworm_rc: 表数 / 方案 / 课程)
  3. 启动后端 (生产方式: node apps/api/dist/src/main.js)
  4. 启动前端静态服务 (apps/client/.output/public, 默认端口 3000)
  5. 输出访问地址 + /health 检查结果

  前端端口固定 3000: 本地 Logto 应用只登记了 http://localhost:3000/callback。

  前置: 已执行过 scripts/rc-local-prod.ps1 -Action reset / build 与 pnpm build:client。

.EXAMPLE
  pwsh scripts/start-rc-demo.ps1                 # 启动
  pwsh scripts/start-rc-demo.ps1 -Stop           # 停止
  powershell -File scripts/start-rc-demo.ps1     # Windows PowerShell 5.1 亦可
#>
param(
  [switch]$Stop,
  [int]$ApiPort = 3001,
  [int]$WebPort = 3000
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot "apps/api/.env.rc"
$apiLog = Join-Path $repoRoot "rc-api.log"
$webLog = Join-Path $repoRoot "rc-web.log"
$pidFile = Join-Path $repoRoot "rc-demo.pids.json"

function Write-Step([string]$text) { Write-Host "== $text ==" -ForegroundColor Cyan }
function Test-Port([int]$port) {
  try { return (Test-NetConnection -ComputerName 127.0.0.1 -Port $port -WarningAction SilentlyContinue).TcpTestSucceeded }
  catch { return $false }
}

if ($Stop) {
  if (Test-Path $pidFile) {
    $pids = Get-Content $pidFile | ConvertFrom-Json
    foreach ($name in @("api", "web")) {
      $procId = $pids.$name
      if ($procId) {
        Stop-Process -Id $procId -ErrorAction SilentlyContinue
        Write-Host "已停止 $name (PID $procId)"
      }
    }
    Remove-Item $pidFile -Force
  } else {
    Write-Host "未找到 $pidFile, 尝试按端口清理"
    foreach ($port in @($ApiPort, $WebPort)) {
      $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
      if ($conn) { Stop-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue; Write-Host "已停止端口 $port 上的进程" }
    }
  }
  return
}

Write-Step "1/6 检查依赖服务"
$deps = @(
  @{ name = "PostgreSQL"; port = 5480; hint = "docker compose up -d testdb" },
  @{ name = "Redis"; port = 6379; hint = "docker compose up -d redis" },
  @{ name = "Logto"; port = 3010; hint = "docker compose up -d logto logtoPostgres" }
)
foreach ($dep in $deps) {
  if (Test-Port $dep.port) {
    Write-Host ("  ✅ {0} 127.0.0.1:{1}" -f $dep.name, $dep.port)
  } else {
    Write-Host ("  ❌ {0} 未启动 (127.0.0.1:{1}) → 请执行: {2}" -f $dep.name, $dep.port, $dep.hint) -ForegroundColor Red
    throw "$($dep.name) 未启动"
  }
}

Write-Step "2/6 校验 RC 环境与构建产物"
if (-not (Test-Path $envFile)) { throw "缺少 $envFile (参考 apps/api/.env.rc.example)" }
$apiEntry = Join-Path $repoRoot "apps/api/dist/src/main.js"
if (-not (Test-Path $apiEntry)) { throw "缺少后端构建产物 $apiEntry → 请执行 pwsh scripts/rc-local-prod.ps1 -Action build" }
$webRoot = Join-Path $repoRoot "apps/client/.output/public"
if (-not (Test-Path $webRoot)) { throw "缺少前端构建产物 $webRoot → 请执行 pnpm build:client" }
Write-Host "  ✅ 后端产物: apps/api/dist/src/main.js"
Write-Host "  ✅ 前端产物: apps/client/.output/public"

Push-Location $repoRoot
try {
  node packages/db/scripts/rc-db.mjs verify earthworm_rc | Out-Null
  Write-Host "  ✅ RC 数据库 earthworm_rc 就绪 (表/方案/课程检查通过)"
} catch {
  Pop-Location
  throw "RC 数据库校验失败 → 请执行 pwsh scripts/rc-local-prod.ps1 -Action reset"
}

Write-Step "3/6 启动后端 API (生产模式)"
if (Test-Port $ApiPort) {
  Write-Host "  ⚠️ 端口 $ApiPort 已被占用, 复用现有进程 (如需重启请先 -Stop)"
  $apiPid = (Get-NetTCPConnection -LocalPort $ApiPort -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
} else {
  # 读取 .env.rc 并注入进程环境 (生产模式由 NODE_ENV=prod 决定)
  foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 0) { continue }
    Set-Item -Path ("env:" + $trimmed.Substring(0, $idx).Trim()) -Value $trimmed.Substring($idx + 1).Trim().Trim('"')
  }
  $env:NODE_ENV = "prod"
  $env:PORT = "$ApiPort"
  $apiProc = Start-Process -FilePath "node" -ArgumentList "apps/api/dist/src/main.js" `
    -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $apiLog -RedirectStandardError "$apiLog.err"
  $apiPid = $apiProc.Id
  Write-Host "  启动中 (PID $apiPid, 日志 rc-api.log)…"
  $ready = $false
  foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    if (Test-Port $ApiPort) { $ready = $true; break }
  }
  if (-not $ready) {
    Write-Host "  ❌ 后端启动失败, 日志尾部:" -ForegroundColor Red
    Get-Content $apiLog -ErrorAction SilentlyContinue | Select-Object -Last 15
    throw "后端启动超时"
  }
}
Write-Host "  ✅ 后端已监听 http://localhost:$ApiPort"

Write-Step "4/6 启动前端静态服务 (端口 $WebPort)"
if (Test-Port $WebPort) {
  Write-Host "  ⚠️ 端口 $WebPort 已被占用, 复用现有进程"
  $webPid = (Get-NetTCPConnection -LocalPort $WebPort -State Listen -ErrorAction SilentlyContinue).OwningProcess | Select-Object -First 1
} else {
  $env:RC_STATIC_PORT = "$WebPort"
  $webProc = Start-Process -FilePath "node" -ArgumentList "scripts/rc-static-server.mjs" `
    -WorkingDirectory $repoRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $webLog -RedirectStandardError "$webLog.err"
  $webPid = $webProc.Id
  foreach ($i in 1..15) {
    Start-Sleep -Seconds 1
    if (Test-Port $WebPort) { break }
  }
  if (-not (Test-Port $WebPort)) { throw "前端静态服务启动失败 (见 rc-web.log)" }
}
Write-Host "  ✅ 前端已监听 http://localhost:$WebPort"

@{ api = $apiPid; web = $webPid } | ConvertTo-Json | Set-Content $pidFile

Write-Step "5/6 健康检查"
try {
  $health = Invoke-RestMethod -Uri "http://localhost:$ApiPort/health" -TimeoutSec 20
  Write-Host ("  status={0} database={1} redis={2} logto={3}" -f `
      $health.status, $health.checks.database, $health.checks.redis, $health.checks.logto)
  if ($health.checks.database -ne "ok") { Write-Host "  ⚠️ 数据库不健康, 请检查 DATABASE_URL" -ForegroundColor Yellow }
} catch {
  Write-Host "  ❌ /health 调用失败: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Step "6/6 访问地址"
Write-Host ""
Write-Host "  前端 (人工测试入口): http://localhost:$WebPort" -ForegroundColor Green
Write-Host "  后端 API           : http://localhost:$ApiPort" -ForegroundColor Green
Write-Host "  API 健康检查        : http://localhost:$ApiPort/health"
Write-Host "  API 文档 (Swagger)  : http://localhost:$ApiPort/swagger"
Write-Host "  Logto 管理台        : http://localhost:3011"
Write-Host ""
Write-Host "  人工测试: 按 RC_MANUAL_TEST_CHECKLIST.md 执行 (测试账号见 LOCAL_TEST_ACCESS.md)"
Write-Host "  停止服务: pwsh scripts/start-rc-demo.ps1 -Stop"
Pop-Location
