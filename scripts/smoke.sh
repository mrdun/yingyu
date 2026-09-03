#!/usr/bin/env bash
# Earthworm E2E 冒烟脚本（商业化每阶段回归基线）
# 用法: bash scripts/smoke.sh [API_BASE] [CLIENT_BASE]
#   默认: API  http://127.0.0.1:3001   Client http://localhost:3000
# 说明: Windows git-bash 下 curl 丢弃输出须用 -o NUL（/dev/null 不可用）。
set -u

API_BASE="${1:-http://127.0.0.1:3001}"
CLIENT_BASE="${2:-http://localhost:3000}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local code
  code="$(curl -s -o NUL -w '%{http_code}' --max-time 10 "$url")" || code="000"
  if [ "$code" = "200" ]; then
    echo "[PASS] $name -> 200 ($url)"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $name -> $code ($url)"
    FAIL=$((FAIL + 1))
  fi
}

echo "== Earthworm E2E 冒烟基线 =="
check "API 就绪: GET /course-pack" "$API_BASE/course-pack"
check "Client 首页: GET /" "$CLIENT_BASE/"

echo "== 结果: PASS=$PASS FAIL=$FAIL =="
[ "$FAIL" -eq 0 ]
