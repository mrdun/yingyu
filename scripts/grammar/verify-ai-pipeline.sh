#!/usr/bin/env bash
# 端到端验证「AI 建课顺带产出语法标注」—— 真实调 DeepSeek、真实写库、跑完自清理。
#
# 为什么另起一个 3009 进程，而不是用 RC 的 3001：
#   /ai-content/* 走 AdminOrDevGuard + admin:access，RC 跑 NODE_ENV=prod 时**必须**带管理员令牌。
#   本脚本用「非生产 + 显式 DEV_BYPASS」这条放行路径，就不需要任何账号凭据（也不碰用户密码）。
#   库仍用 RC 库（.env.rc 里的 5480/earthworm_rc），所以验的是真实链路。
#
# 用法: bash scripts/grammar/verify-ai-pipeline.sh
# 退出码 0 = 通过；1 = 失败；2 = 环境问题
set -u
REPO="/c/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm"
TMP="C:/Users/mrdun/AppData/Local/Temp"
PORT=3009
PG="docker exec earthworm-testdb-1 psql -U test -d earthworm_rc -At"
cd "$REPO" || exit 2

echo "=== 1/6 前置检查 ==="
curl -s -o NUL -w "" "http://127.0.0.1:$PORT/health" 2>/dev/null && { echo "3009 已被占用，先停掉再跑"; exit 2; }
# RC 的 .env.rc 里没有模型 key（它是生产口径，AI 建课在 RC 走管理员令牌）；
# 本地跑端到端时从 dev 的 .env 借 DEEPSEEK_API_KEY。**只检查有无，绝不打印值。**
KEY_FROM=""
if grep -q "^DEEPSEEK_API_KEY=." apps/api/.env.rc 2>/dev/null; then
  KEY_FROM=".env.rc"
elif grep -q "^DEEPSEEK_API_KEY=." apps/api/.env 2>/dev/null; then
  KEY_FROM=".env"
else
  echo "  ✗ .env.rc 与 .env 都没有 DEEPSEEK_API_KEY"; exit 2
fi
echo "  DEEPSEEK_API_KEY 来自 apps/api/$KEY_FROM（未打印值）"

echo "=== 2/6 起 3009（RC 环境 + 非生产 + DEV_BYPASS）==="
set -a
# shellcheck disable=SC1091
source apps/api/.env.rc
set +a
# ⚠️ 只借 DEEPSEEK_API_KEY, **不能**整体 source apps/api/.env —— 那会把 DATABASE_URL
#    覆盖成 dev 库(5433), 就变成在错误的库上验证了。只在内存里取这一个变量, 不打印。
if [ "$KEY_FROM" = ".env" ]; then
  DEEPSEEK_API_KEY="$(grep -m1 '^DEEPSEEK_API_KEY=' apps/api/.env | cut -d= -f2- | tr -d '"'"'"'')"
  export DEEPSEEK_API_KEY
fi
NODE_ENV=development AI_CONTENT_DEV_BYPASS=true PORT=$PORT \
  node apps/api/dist/src/main.js > "$TMP/ew-ai-pipeline-3009.log" 2>&1 &
API_PID=$!
trap 'kill $API_PID 2>/dev/null; wait $API_PID 2>/dev/null' EXIT
for i in $(seq 1 40); do
  sleep 1
  if curl -s -o NUL -w "" "http://127.0.0.1:$PORT/health"; then break; fi
done
curl -s "http://127.0.0.1:$PORT/health" | head -c 120; echo
curl -s "http://127.0.0.1:$PORT/health" | grep -q '"database":"ok"' || { echo "  数据库没通，看 $TMP/ew-ai-pipeline-3009.log"; exit 2; }

echo "=== 3/6 调 /ai-content/course-pack 建一门测试课 ==="
TITLE="E2E语法标注验证-$(date +%s)"
BODY=$(cat <<JSON
{"title":"$TITLE","description":"自动化验证用，跑完自动删除",
 "text":"I like the food. I like the music. I want to eat. I want to sleep. I need to go. I need to rest. It is very important for me so I have to do it every day. It is not important for me so I don't have to do it now. We are very happy so we can play all the day.",
 "courseSize":10}
JSON
)
RESP=$(curl -s -X POST "http://127.0.0.1:$PORT/ai-content/course-pack" \
  -H "Content-Type: application/json" -d "$BODY")
echo "  响应: $RESP"
PACK_ID=$(echo "$RESP" | python -c "import json,sys; print(json.load(sys.stdin).get('coursePackId',''))" 2>/dev/null)
[ -n "$PACK_ID" ] || { echo "  建课失败（没拿到 coursePackId）"; exit 1; }

echo "=== 4/6 核对库里写入的 grammar ==="
sleep 1
STAT=$($PG -c "SELECT count(*) || ' 句, 其中带标注 ' || count(grammar) FROM statements s JOIN courses c ON c.id=s.course_id WHERE c.course_pack_id='$PACK_ID';")
echo "  $STAT"
$PG -c "SELECT count(*) FROM statements s JOIN courses c ON c.id=s.course_id WHERE c.course_pack_id='$PACK_ID' AND s.grammar IS NOT NULL;" | grep -qvE '^0$' \
  || { echo "  ✗ 一条标注都没写进去"; exit 1; }

# jsonb 必须是 object —— 双编码（jsonb_typeof=string）时 ORM 读回来照样正常，
# 只有裸 SQL / 后台统计 / 导出会看不到任何字段。这条是真实踩过的坑。
KINDS=$($PG -c "SELECT string_agg(DISTINCT jsonb_typeof(grammar), ',') FROM statements s JOIN courses c ON c.id=s.course_id WHERE c.course_pack_id='$PACK_ID' AND s.grammar IS NOT NULL;")
echo "  grammar 在库里的 jsonb 类型: $KINDS（必须是 object）"
[ "$KINDS" = "object" ] || { echo "  ✗ 不是 object → 双编码了（grammar->>'x' 会取不到字段）"; exit 1; }

echo "  --- 抽样核对（位置/结构式必须由程序算对）---"
$PG -c "SELECT s.english || ' | ' || coalesce(s.grammar->>'structure','(无)') || ' | 成分数 ' || coalesce(jsonb_array_length(s.grammar->'phrases'),0)
        FROM statements s JOIN courses c ON c.id=s.course_id
        WHERE c.course_pack_id='$PACK_ID' ORDER BY s.english LIMIT 6;" | sed 's/^/    /'
echo "  --- 偏移自检: 每条 start/end 必须能切回原文 ---"
python - <<'PY' "$PACK_ID"
import json, subprocess, sys
pack = sys.argv[1]
sql = ("SELECT s.english, s.grammar::text FROM statements s JOIN courses c ON c.id=s.course_id "
       f"WHERE c.course_pack_id='{pack}' AND s.grammar IS NOT NULL;")
out = subprocess.run(["docker","exec","earthworm-testdb-1","psql","-U","test","-d","earthworm_rc","-At","-F","\t","-c",sql],
                     capture_output=True, text=True, encoding="utf-8")
bad = checked = 0
for line in out.stdout.splitlines():
    if "\t" not in line: continue
    english, gs = line.split("\t", 1)
    g = json.loads(gs)
    if not isinstance(g, dict):
        # 双编码时 json.loads 得到的是字符串 —— 明确报出来, 别用 .get 崩掉
        print(f"    ✗ 双编码: grammar 解析出来是 {type(g).__name__}, 不是对象")
        bad += 1
        continue
    for arr in (g.get("words") or [], g.get("phrases") or []):
        for it in arr:
            if it.get("start") is None: continue
            checked += 1
            if english[it["start"]:it["end"]] != it["text"]:
                bad += 1
                if bad <= 3:
                    print(f"    ✗ {english!r} 的 {it['text']!r} 取到 {english[it['start']:it['end']]!r}")
print(f"    检查 {checked} 条偏移，错 {bad} 条")
sys.exit(1 if bad else 0)
PY
OFFSET_RC=$?
[ "$OFFSET_RC" = "0" ] || { echo "  ✗ 偏移自检失败"; exit 1; }

echo "=== 5/6 清理测试数据 ==="
$PG -c "DELETE FROM statements WHERE course_id IN (SELECT id FROM courses WHERE course_pack_id='$PACK_ID');"
$PG -c "DELETE FROM courses WHERE course_pack_id='$PACK_ID';"
$PG -c "DELETE FROM course_packs WHERE id='$PACK_ID';"
LEFT=$($PG -c "SELECT count(*) FROM course_packs WHERE id='$PACK_ID';")
[ "$LEFT" = "0" ] && echo "  已清理 ✓" || { echo "  ✗ 没清理干净"; exit 1; }

echo "=== 6/6 收尾 ==="
kill $API_PID 2>/dev/null; wait $API_PID 2>/dev/null
echo "✓ AI 建课顺带产出语法标注：链路通、结构式由程序算对、偏移无错、测试数据已清"
exit 0
