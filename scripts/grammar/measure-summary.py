"""自然宽度 → 换算成「在任意面板宽下要占几行」, 并用实测行数交叉验证。

模型: 单行自然宽 = Σ(成分组宽) + (组数-1) × 组间间隔(16px)
      面板可用宽 = 面板宽 - 40px (卡片左右内边距各 20px)
      占几行     ≈ ceil(自然宽 / 可用宽 的「按组装箱」) —— 这里用更保守的下界: 自然宽 > 可用宽 就要 >1 行

交叉验证: 与 measure-rows.js 在 560/680/…/1440 实测的「单行率」比对,
         两者必须接近; 差太多说明模型错了, 不要拿去下结论。
"""
import json
import math
from pathlib import Path

TMP = Path("C:/Users/mrdun/AppData/Local/Temp")
GAP = 16          # .sent { column-gap: 16px }
PAD = 40          # .item 左右 padding 各 20px
WIDTHS = [560, 680, 820, 1000, 1200, 1440]

nat = json.load(open(TMP / "ew-natural.json", encoding="utf-8"))
for r in nat:
    r["natural"] = r["naturalW"]          # 已由 measure-natural.js 按行取最大算好
    r["group"] = "L1" if r["key"].startswith("L1-") else "C"

print("=" * 92)
print("自然单行宽统计（'L1' = 第一课真实成分分组；'C' = 全库每词自成一组 = 上界）")
print("=" * 92)
for g, label in (("L1", "第一课真实分组"), ("C", "全库最坏分组")):
    s = sorted(r["natural"] for r in nat if r["group"] == g)
    n = len(s)
    print(f"\n{label}（{n} 条）")
    print(f"  中位 {s[n//2]}px · 90分位 {s[int(n*0.9)]}px · 95分位 {s[int(n*0.95)]}px · 最大 {s[-1]}px")

print()
print("=" * 92)
print("在给定面板宽下的单行率（模型换算）")
print("=" * 92)
print(f"{'面板宽':>7} {'可用宽':>7} | {'真实分组不换行%':>15} {'最坏分组不换行%':>15}")
model = {}
for w in WIDTHS:
    av = w - PAD
    m = {}
    for g in ("L1", "C"):
        s = [r for r in nat if r["group"] == g]
        one = sum(1 for r in s if r["natural"] <= av)
        m[g] = round(100 * one / len(s), 1)
    model[w] = m
    print(f"{w:>7} {av:>7} | {m['L1']:>14.1f}% {m['C']:>14.1f}%")

print()
print("=" * 92)
print("交叉验证: 模型换算 vs 实测（『不换行』= 没有因宽度不够而折行；从句断行不算折行）")
print("=" * 92)
print(f"{'面板宽':>7} {'实测 真实分组':>13} {'模型 真实分组':>13} {'差':>6} | "
      f"{'实测 最坏':>11} {'模型 最坏':>11} {'差':>6}")
ok = True
for w in WIDTHS:
    f = TMP / f"ew-measure-{w}.json"
    if not f.exists():
        print(f"{w:>7}  （缺实测文件）")
        continue
    rows = json.load(open(f, encoding="utf-8"))["rows"]
    meas = {}
    for g, pre in (("L1", "L1-"), ("C", "C-")):
        s = [r for r in rows if r["key"].startswith(pre)]
        meas[g] = round(100 * sum(1 for r in s if r.get("wrapRows") == 0) / len(s), 1)
    d1, d2 = model[w]["L1"] - meas["L1"], model[w]["C"] - meas["C"]
    flag = "" if abs(d1) <= 3 and abs(d2) <= 3 else "  ← 差异大"
    if flag:
        ok = False
    print(f"{w:>7} {meas['L1']:>12.1f}% {model[w]['L1']:>12.1f}% {d1:>+6.1f} | "
          f"{meas['C']:>10.1f}% {model[w]['C']:>10.1f}% {d2:>+6.1f}{flag}")
print()
print("模型可用 ✓" if ok else "⚠️ 模型与实测有出入, 下结论前先查清原因")

print()
print("=" * 92)
print("按词数看单行率（『最坏分组』上界；用来定 AI 生成时的句子长度上限）")
print("=" * 92)
print(f"{'词数':>4} " + " ".join(f"{w:>7}px" for w in WIDTHS) + "   句数")
buckets = {}
for r in nat:
    if r["group"] == "C":
        buckets.setdefault(r["words"], []).append(r)
for k in sorted(buckets):
    if k > 16:
        continue
    cells = []
    for w in WIDTHS:
        s = buckets[k]
        pct = 100 * sum(1 for r in s if r["natural"] <= w - PAD) / len(s)
        cells.append(f"{pct:>7.0f}%")
    print(f"{k:>4} " + " ".join(cells) + f"   {len(buckets[k]):>4}")

json.dump(model, open(TMP / "ew-natural-model.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n模型已存: {TMP/'ew-natural-model.json'}")
