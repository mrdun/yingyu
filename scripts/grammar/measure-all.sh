#!/usr/bin/env bash
# 全量重测: 自然宽度（一次量完）+ 六个面板宽的实测行数（用于交叉验证模型）。
set -u
REPO="/c/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm"
TMP="C:/Users/mrdun/AppData/Local/Temp"
cd "$REPO" || exit 1

echo "──── 1/2 自然单行宽 ────"
python scripts/grammar/measure-probe.py natural 2>&1 | tail -2
node scripts/grammar/measure-natural.js "$TMP/ew-natural.html" --json "$TMP/ew-natural.json" 2>&1 | tail -2

echo "──── 2/2 按面板宽实测行数 ────"
for W in 560 680 820 1000 1200 1440; do
  python scripts/grammar/measure-probe.py "$W" >/dev/null 2>&1 || { echo "生成失败 $W"; continue; }
  echo "-- ${W}px --"
  node scripts/grammar/measure-rows.js "$TMP/ew-measure-$W.html" --json "$TMP/ew-measure-$W.json" 2>&1 | grep -E "无横向溢出|横向溢出" | head -1
done
echo "──── 汇总 ────"
python scripts/grammar/measure-summary.py
