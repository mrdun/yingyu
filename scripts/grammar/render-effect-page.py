"""生成「练习页语法标注」效果页 —— 自包含单文件 HTML, 可直接双击打开, 也可在 Hermes 里内联预览。

## 视觉结构（用户逐条拍板, 改前先读）

    ┌──────────┐
    │   主语    │  ← 成分名: 在胶囊**上方**、与胶囊居中、**颜色与胶囊一致**
    └──────────┘
                 ← 胶囊: **装着该成分的英文词**（同一成分的词合成【一个】胶囊）, 成分色 + 白字
       I
     ▁▁▁▁▁        ← 每个单词一条下划线（词性色）
      代词        ← 中文词性文字, 与单词/下划线**同一中心线**, 颜色与下划线一致

## 用户否掉过的两版（别改回去）
1. 单词各自装进小卡片 + 胶囊只写成分名 → 看着像「一个单词一个气泡胶囊」。
2. 胶囊写成分名、单词在胶囊外面、再用一条长横条跨过整段 → 仍不是「成分合在一个胶囊里」。
**正解: 胶囊里装的就是英文词本身。**

## 下划线配色两套（用户要求 A/B 对比）
- **A 按词性**: 代词一色 / 动词一色 / 名词一色…（词性色板, 与成分色是两套颜色）
- **B 跟随成分**: 下划线与词性文字用所属成分的颜色（与上方胶囊同色）

## 两种配色都实算过对比度（scripts/ew-contrast.py）
- 词性色板 11 色, 白字 ≥ 5.02:1
- 成分色板 7 色, 白字 ≥ 5.17:1; 同时作为文字压白底也 ≥ 5.17:1（成分名要用它当文字色）
"""
import json
from pathlib import Path

REPO = Path("C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm")
OUT = REPO / ".hermes/design/grammar-effect-page.html"
SRC = REPO / ".hermes/design/grammar-lesson1-annotated.json"


def slim(x):
    g = x["annotation"]
    words = [{"t": w["text"], "p": w.get("pos") or ""} for w in g.get("words", [])]
    if not words:
        words = [{"t": t, "p": ""} for t in x["english"].split(" ")]
    phrases = [{"t": p["text"], "r": p["role"], "k": p.get("roleType") or ""}
               for p in g.get("phrases", []) if p.get("role")]
    return {
        "o": x.get("order"), "en": x["english"], "cn": x.get("chinese") or "",
        "s": 1 if g.get("isSentence") else 0,
        "w": words, "ph": phrases,
        "st": g.get("structure") or "", "pt": g.get("pattern") or "",
        "te": g.get("tense") or "", "ty": g.get("sentenceType") or "",
        "cl": g.get("clauseType") or "", "kp": g.get("keyPoints") or [],
    }


data = json.load(open(SRC, encoding="utf-8"))
slim_data = [slim(x) for x in data]
payload = json.dumps(slim_data, ensure_ascii=False, separators=(",", ":"))

TEMPLATE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>练习页 · 句子成分胶囊（效果页）</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --cream: #FBF7E8; --ink: #0F172A; --muted: #5B6B80;
    --line: #E5E7EB; --blue: #2C5AF4;
  }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
    background: var(--cream); color: var(--ink); font-size: 14px; line-height: 1.5; padding: 14px;
  }
  .app { width: 100%; max-width: 1060px; }

  /* ── 控制条 ─────────────────────────────────── */
  .bar { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; padding-bottom: 9px; }
  .btn {
    border: 1px solid var(--line); background: #fff; color: #3F4B5B;
    border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600;
    cursor: pointer; font-family: inherit; white-space: nowrap; transition: .15s;
  }
  .btn:hover { border-color: #C7D2FE; color: var(--blue); }
  .btn[aria-pressed="true"] { background: var(--blue); border-color: var(--blue); color: #fff; }
  .title { font-size: 15px; font-weight: 800; }
  .sub { font-size: 12.5px; color: var(--muted); }
  .spacer { flex: 1 1 auto; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; background: #fff; overflow: hidden; }
  .seg button {
    border: 0; background: transparent; color: #3F4B5B; font-family: inherit;
    padding: 6px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  }
  .seg button[aria-pressed="true"] { background: #EFF6FF; color: var(--blue); }
  .hint { font-size: 12px; color: var(--muted); }
  kbd { background: #F1F5F9; border: 1px solid var(--line); border-bottom-width: 2px;
        border-radius: 5px; padding: 1px 5px; font-size: 11px; font-family: inherit; font-weight: 700; }

  /* ── 句子卡 ─────────────────────────────────── */
  .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px 15px; margin-bottom: 12px; }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
  .cn { font-size: 15.5px; font-weight: 800; }
  .badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .b-sent { background: #EFF6FF; color: var(--blue); }
  .b-frag { background: #F1F5F9; color: #64748B; }
  .b-en { background: #F8FAFC; color: #7B8794; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 600; }
  .b-ok { background: #ECFDF5; color: #047857; }
  .b-warn { background: #FFF4E0; color: #8A4B00; }
  .measure { font-size: 12px; color: var(--muted); margin: 2px 0 16px; }
  .measure b { color: var(--ink); font-variant-numeric: tabular-nums; }

  /* ── 句子本体 ─────────────────────────────────
     每个成分一个 grid: 4 行 —— [成分名][胶囊+词][下划线][词性]。
     用**同一个 grid** 是为了让「胶囊里的词」与「下面的下划线、词性」共用列宽,
     三者天然同一条中心线（用户明确要求三者居中对齐）。 */
  .rows { display: flex; flex-direction: column; align-items: center; row-gap: 20px; }
  .sent { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center;
          column-gap: 46px; row-gap: 16px; }

  .grp { display: grid; grid-template-columns: repeat(var(--n), max-content); column-gap: 24px; position: relative; }
  /* 成分名: 在胶囊上方, 与胶囊居中, 颜色与胶囊边框同色（亮色点缀） */
  .grp .name { grid-row: 1; grid-column: 1 / -1; justify-self: center;
               color: var(--acc); font-size: 12.5px; font-weight: 800;
               margin-bottom: 6px; white-space: nowrap; letter-spacing: .3px; }
  /* 胶囊: **浅彩底 + 亮色描边**（参考图的“亮色”做法；不是深色饱和底）
     底色跨列铺满、左右各外扩 13px 当内边距 —— 这样词与下划线仍共用列宽 */
  .grp .pill { grid-row: 2; grid-column: 1 / -1; margin: 0 -13px;
               background: var(--bg); border: 1.5px solid var(--acc); border-radius: 999px; }
  /* 词: 各自占一列, 压在浅彩底上, **深色字**（压浅底实算 6.3~13.0:1） */
  .grp .w { grid-row: 2; justify-self: center; align-self: center; position: relative; z-index: 1;
            color: var(--ink); font-size: 22px; font-weight: 700; line-height: 1.2;
            padding: 9px 0; white-space: nowrap; }
  /* 下划线: 每个单词一条, 颜色 = var(--u)（亮色） */
  .grp .ul { grid-row: 3; justify-self: center; width: 100%; min-width: 26px; height: 3px;
             border-radius: 2px; background: var(--u); margin-top: 8px; }
  /* 词性文字: 与词、下划线同一中心线, 颜色与下划线一致（亮色） */
  .grp .pp { grid-row: 4; justify-self: center; color: var(--u);
             font-size: 11.5px; font-weight: 700; margin-top: 5px; white-space: nowrap; }

  /* 碎片: 无成分 → 中性浅灰胶囊(不声称任何成分), 无成分名 */
  .grp.frag .pill { background: #F1F5F9; border-color: #CBD5E1; }
  .grp.frag .w { color: #1E293B; }

  /* ── 四个卡片: 等宽等高一排 ─────────────────────── */
  .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
           gap: 10px; margin-top: 18px; align-items: stretch; }
  .info { border-radius: 10px; padding: 10px 12px; border: 1px solid; display: flex; flex-direction: column; }
  .c-blue { background: #EFF6FF; border-color: #BFDBFE; }
  .c-amber { background: #FFFBEB; border-color: #FDE68A; }
  .c-violet { background: #F5F3FF; border-color: #DDD6FE; }
  .c-rose { background: #FFF1F2; border-color: #FECDD3; }
  .info-t { font-size: 10.5px; font-weight: 700; opacity: .62; margin-bottom: 4px; }
  .info-v { font-size: 13.5px; font-weight: 800; }
  .info ul { margin: 0; padding-left: 15px; font-size: 12.5px; line-height: 1.7; color: #334155; }
  .tag { display: inline-block; margin-top: 5px; font-size: 10.5px; font-weight: 700;
         background: rgba(255,255,255,.75); border: 1px solid rgba(15,23,42,.10);
         border-radius: 999px; padding: 2px 8px; color: #334155; align-self: flex-start; }
  .footnote { background: #F8FAFC; border: 1px solid var(--line); border-radius: 10px;
              padding: 10px 12px; font-size: 12px; font-weight: 600; color: #94A3B8; }
  @media (max-width: 900px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 560px) { .cards { grid-template-columns: 1fr; } }

  /* ── 图例 / 说明 ─────────────────────────────── */
  .legend { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; }
  .lg { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: #475569; }
  .dot { width: 24px; height: 12px; border-radius: 999px; background: var(--bg);
         border: 1.5px solid var(--acc); display: inline-block; }
  .lgtitle { font-size: 12px; font-weight: 800; color: var(--ink); margin-right: 2px; }
  .note { background: #fff; border: 1px solid var(--line); border-radius: 12px;
          padding: 11px 13px; font-size: 12.5px; line-height: 1.85; color: var(--muted); }
  .note b { color: var(--ink); }
  .note code { background: #F1F5F9; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
</style>
</head>
<body>
<div class="app">

  <div class="bar">
    <button class="btn" id="prev">← 上一句</button>
    <button class="btn" id="next">下一句 →</button>
    <span class="title">零基础学英语 · 第一课</span>
    <span class="sub" id="pos">— / —</span>
    <span class="spacer"></span>
    <button class="btn" id="jumpLong">跳到最长句</button>
  </div>

  <div class="bar">
    <span class="seg" id="filter">
      <button data-f="all">全部</button>
      <button data-f="sent">完整句</button>
      <button data-f="long">长句</button>
      <button data-f="frag">碎片</button>
    </span>
    <span class="seg" id="palette">
      <button data-p="B">B · 下划线跟随成分</button>
      <button data-p="A">A · 下划线按词性</button>
    </span>
    <button class="btn" id="clause" aria-pressed="true">从句断行</button>
    <span class="hint"><kbd>←</kbd> <kbd>→</kbd> 切换</span>
  </div>

  <div class="card">
    <div class="head">
      <span class="cn" id="cn"></span>
      <span class="badge" id="kind"></span>
      <span class="badge b-en" id="en"></span>
    </div>
    <div class="measure" id="measure"></div>
    <div class="rows" id="rows"></div>
    <div class="cards" id="cards"></div>
  </div>

  <div class="card"><div class="legend" id="legend"></div></div>

  <div class="note">
    <b>这一页是什么</b>：练习页里「句子成分胶囊」的效果页，数据是真实模型对
    <b>「零基础学英语 · 第一课」218 条</b>的标注，不是示例。<br />
    <b>怎么看</b>：① 上面那两个按钮切换 <b>下划线配色 A / B</b> —— A 是下划线按<b>词性</b>上色，
    B 是下划线<b>跟随所属成分</b>的颜色，你挑一套。② 胶囊里装的是<b>该成分的英文词</b>
    （同一成分合成一个胶囊）；胶囊上方小字是成分名，颜色与胶囊描边一致；每个单词下面一条下划线 +
    中文词性，三者同一条中心线。③ <b>碎片</b>（如 <code>to do it</code>）按规范不给成分，
    胶囊为中性浅灰、没有成分名。<br />
    <b>配色</b>：按你给的参考图改成<b>亮色系</b> —— 胶囊是<b>浅彩底 + 亮色描边</b>，
    英文词用<b>深色字</b>压在浅底上；成分名 / 下划线 / 词性用<b>亮色</b>。
    每一对配色都实算过对比度（词压浅底 6.3–13.0:1，亮色压白底 4.6–7.6:1）。
  </div>
</div>

<script>
const DATA = __DATA__;

/* ── 色板（亮色系，取自用户给的参考图并补足到全部成分/词性）──────────────
   参考图的规律: **浅彩底 + 深色字 + 亮色点缀**（不是深色饱和底 + 白字）。
   每个色族给三个值:
     bg  浅彩底   —— 胶囊底色 + 边框内
     ink 深色字   —— 胶囊里的英文词（压浅底, 实算 6.3~13.0:1）
     acc 亮色点缀 —— 成分名 / 下划线 / 词性文字（压白底, 实算 4.6~7.6:1）
   全部 24 个值都过了 scripts/ew-contrast.py, 最低 4.60:1。改色前必须重算。 */
const ROLE_THEME = {
  "主语":  { bg: "#FEE6EF", ink: "#9F1239", acc: "#DB2777" },  // 玫红
  "谓语":  { bg: "#E1F1FE", ink: "#1E3A8A", acc: "#2563EB" },  // 蓝
  "宾语":  { bg: "#D8FAED", ink: "#065F46", acc: "#047857" },  // 绿
  "表语":  { bg: "#D9F3F8", ink: "#155E75", acc: "#0E7490" },  // 青
  "状语":  { bg: "#FEF3D7", ink: "#78350F", acc: "#B45309" },  // 琥珀
  "定语":  { bg: "#E9E4FE", ink: "#5B21B6", acc: "#7C3AED" },  // 紫
  "连接词": { bg: "#EEF2F7", ink: "#1E293B", acc: "#475569" }   // 灰
};
const POS_THEME = {
  "代词":    { bg: "#FEE6EF", ink: "#9F1239", acc: "#DB2777" },
  "动词":    { bg: "#E1F1FE", ink: "#1E3A8A", acc: "#2563EB" },
  "助动词":  { bg: "#E4E9FF", ink: "#312E81", acc: "#4338CA" },
  "情态动词": { bg: "#E0F0FB", ink: "#0C4A6E", acc: "#0369A1" },
  "不定式":  { bg: "#D5F5EE", ink: "#115E59", acc: "#0F766E" },
  "名词":    { bg: "#D8FAED", ink: "#065F46", acc: "#047857" },
  "形容词":  { bg: "#FEF3D7", ink: "#78350F", acc: "#B45309" },
  "副词":    { bg: "#FFE8D6", ink: "#7C2D12", acc: "#C2410C" },
  "介词":    { bg: "#FCE7F3", ink: "#831843", acc: "#BE185D" },
  "冠词":    { bg: "#F7E3FA", ink: "#701A75", acc: "#A21CAF" },
  "连词":    { bg: "#EEF2F7", ink: "#1E293B", acc: "#475569" }
};
const FRAG_THEME = { bg: "#EEF2F7", ink: "#1E293B", acc: "#475569" };
const roleTheme = r => ROLE_THEME[r] || FRAG_THEME;
const posTheme = p => POS_THEME[p] || FRAG_THEME;

let scheme = "B";          /* 用户已拍板: B = 下划线跟随成分（A 保留供对比） */
let clauseBreak = true;
let filter = "all";
let list = DATA.slice();
let cur = 0;

/* 短语 → 词序号。**必须按起点排序**：早先按「文本首次出现位置」排序会让 cursor 乱走、
   重复输出已覆盖的词（一条 14 词的句子被渲染出 21 个词）。 */
function toGroups(item) {
  const ws = item.w.map(x => x.t), spans = [];
  for (const p of item.ph) {
    const pt = p.t.split(" ");
    for (let s = 0; s + pt.length <= ws.length; s++) {
      let ok = true;
      for (let k = 0; k < pt.length; k++) if (ws[s + k] !== pt[k]) { ok = false; break; }
      if (!ok) continue;
      if (spans.some(sp => s < sp.e && s + pt.length > sp.b)) continue;
      spans.push({ b: s, e: s + pt.length, p }); break;
    }
  }
  spans.sort((a, b) => a.b - b.b);
  return spans.map(sp => ({ p: sp.p, idx: Array.from({ length: sp.e - sp.b }, (_, i) => sp.b + i) }));
}
function toUnits(item, groups) {
  const n = item.w.length, units = []; let c = 0;
  for (const g of groups) {
    while (c < g.idx[0]) { units.push({ p: null, idx: [c] }); c++; }
    units.push(g); c = g.idx[g.idx.length - 1] + 1;
  }
  while (c < n) { units.push({ p: null, idx: [c] }); c++; }
  return units;
}
function toRows(units, brk) {
  const rows = []; let cur = [];
  for (const u of units) {
    if (brk && cur.length && u.p && u.p.r === "连接词") { rows.push(cur); cur = []; }
    cur.push(u);
  }
  if (cur.length) rows.push(cur);
  return rows;
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const posColorOf = p => POS_COLOR[p] || GREY;

function render() {
  const it = list[cur];
  const isSent = !!it.s;
  const groups = isSent ? toGroups(it) : [];
  const units = isSent ? toUnits(it, groups) : it.w.map((_, i) => ({ p: null, idx: [i] }));
  const rows = isSent ? toRows(units, clauseBreak) : [units];

  document.getElementById("cn").textContent = it.cn || "";
  document.getElementById("en").textContent = it.en;
  const kind = document.getElementById("kind");
  kind.className = "badge " + (isSent ? "b-sent" : "b-frag");
  kind.textContent = isSent ? "完整句" : "碎片 / 单词";

  const out = [];
  for (const row of rows) {
    out.push('<div class="sent">');
    for (const u of row) {
      const comp = u.p;
      /* 胶囊底色/描边恒按**成分**（它表示句子成分）；A/B 只改下划线与词性文字的颜色 */
      const rt = comp ? roleTheme(comp.r) : FRAG_THEME;
      const frag = comp ? "" : " frag";
      out.push(`<div class="grp${frag}" data-comp="${comp ? esc(comp.r) : ""}" `
        + `data-bg="${rt.bg}" data-acc="${rt.acc}" data-ink="${rt.ink}" `
        + `style="--n:${u.idx.length};--bg:${rt.bg};--acc:${rt.acc};--ink:${rt.ink}">`);
      out.push(`<div class="name">${comp ? esc(comp.r) : ""}</div>`);
      out.push('<div class="pill"></div>');
      /* ⚠️ 必须**显式**给每列指定 grid-column：胶囊用 `1/-1` 占满了第 2 行，
         grid 自动排布会「避开已占用格子」把单词挤到第 3 行 → 单词与它的下划线错位。
         实测踩过：不写列号时「单词/下划线/词性」中心线不齐 871 处。 */
      u.idx.forEach((i, k) => out.push(`<span class="w" style="grid-column:${k + 1}">${esc(it.w[i].t)}</span>`));
      /* A 方案: 下划线/词性文字按**词性**取亮色（同一成分内不同词可能不同色）
         B 方案: 跟随**所属成分**的亮色（与胶囊描边同色） */
      const colorOf = i => {
        const pos = it.w[i].p;
        if (scheme === "A") return posTheme(pos).acc;
        return comp ? rt.acc : FRAG_THEME.acc;
      };
      u.idx.forEach((i, k) => out.push(`<span class="ul" style="grid-column:${k + 1};--u:${colorOf(i)}"></span>`));
      u.idx.forEach((i, k) => {
        const pos = it.w[i].p;
        out.push(`<span class="pp" style="grid-column:${k + 1};--u:${colorOf(i)}">${pos ? esc(pos) : ""}</span>`);
      });
      out.push("</div>");
    }
    out.push("</div>");
  }
  const rowsEl = document.getElementById("rows");
  rowsEl.innerHTML = out.join("");

  /* 四个卡片等宽等高一排: 句子结构 / 时态 / 句型 / 语法要点 */
  const cards = [];
  if (isSent) {
    cards.push(`<div class="info c-blue"><div class="info-t">句子结构</div><div class="info-v">${esc(it.st || "—")}</div>${it.pt ? `<span class="tag">${esc(it.pt)}</span>` : ""}</div>`);
    cards.push(`<div class="info c-amber"><div class="info-t">时态</div><div class="info-v">${esc(it.te || "—")}</div></div>`);
    cards.push(`<div class="info c-violet"><div class="info-t">句型</div><div class="info-v">${esc(it.ty || "—")}</div>${it.cl ? `<span class="tag">${esc(it.cl)}</span>` : ""}</div>`);
    const kp = (it.kp && it.kp.length) ? `<ul>${it.kp.map(k => `<li>${esc(k)}</li>`).join("")}</ul>` : `<div class="info-v">—</div>`;
    cards.push(`<div class="info c-rose"><div class="info-t">语法要点</div>${kp}</div>`);
  } else {
    cards.push(`<div class="footnote" style="grid-column:1/-1">碎片只显示逐词词性 —— 不显示成分胶囊 / 结构 / 时态（按规范 §8 降级）。上面的灰胶囊只表示「这些词是一块」，不声称任何成分。</div>`);
  }
  document.getElementById("cards").innerHTML = cards.join("");

  document.getElementById("pos").textContent = `${cur + 1} / ${list.length}　（第 ${it.o} 句）`;
  measure();
  drawLegend();
}

/* 实时测量: 面板可用宽 / 本句单行需要多少 px / 实际占几行 */
function measure() {
  const rowsEl = document.getElementById("rows");
  const avail = Math.round(rowsEl.getBoundingClientRect().width);
  const sentRows = Array.from(rowsEl.querySelectorAll(":scope > .sent"));
  let natural = 0, wrap = 0;
  for (const r of sentRows) {
    const grps = Array.from(r.querySelectorAll(":scope > .grp"));
    const sum = grps.reduce((a, g) => a + g.getBoundingClientRect().width, 0);
    natural = Math.max(natural, Math.round(sum + Math.max(0, grps.length - 1) * 46));
    const tops = new Set(grps.map(g => Math.round(g.getBoundingClientRect().top)));
    wrap += Math.max(0, tops.size - 1);
  }
  const total = sentRows.length + wrap;
  const fit = wrap === 0;
  document.getElementById("measure").innerHTML =
    `面板可用宽 <b>${avail}px</b> · 本句单行需 <b>${natural}px</b> · 实际 <b>${total} 行</b>`
    + (sentRows.length > 1 ? `（从句断行 ${sentRows.length} 段）` : "")
    + `　<span class="badge ${fit ? "b-ok" : "b-warn"}">${fit ? "不折行 ✓" : `被迫折行 ${wrap} 次`}</span>`;
}

/* 图例跟随当前配色方案 */
function drawLegend() {
  const map = scheme === "A" ? POS_THEME : ROLE_THEME;
  const title = scheme === "A" ? "下划线 / 词性文字（按词性）" : "下划线 / 词性文字（跟随成分）";
  const sw = t => `<span class="lg"><span class="dot" style="--bg:${t.bg};--acc:${t.acc}"></span></span>`;
  document.getElementById("legend").innerHTML =
    `<span class="lgtitle">胶囊底色 / 描边（按成分）</span>`
    + Object.entries(ROLE_THEME).map(([r, t]) => `<span class="lg">${sw(t)}${r}</span>`).join("")
    + `<span class="lgtitle" style="margin-left:14px">${title}</span>`
    + Object.entries(map).map(([k, t]) => `<span class="lg">${sw(t)}${k}</span>`).join("");
}

function applyFilter() {
  const N = it => it.w.length;
  if (filter === "sent") list = DATA.filter(x => x.s);
  else if (filter === "long") list = DATA.filter(x => x.s && N(x) >= 10);
  else if (filter === "frag") list = DATA.filter(x => !x.s);
  else list = DATA.slice();
  cur = 0; render();
}
/* 默认落在一条有代表性的完整句上 —— 第 1 条是单词碎片 `I`, 打开会看不到胶囊 */
function initialIndex() {
  const i = DATA.findIndex(x => x.s && x.w.length >= 4 && x.w.length <= 6);
  return i >= 0 ? i : 0;
}

document.getElementById("prev").onclick = () => { cur = (cur - 1 + list.length) % list.length; render(); };
document.getElementById("next").onclick = () => { cur = (cur + 1) % list.length; render(); };
document.getElementById("jumpLong").onclick = () => {
  let b = 0; list.forEach((x, i) => { if (x.w.length > list[b].w.length) b = i; });
  cur = b; render();
};
document.querySelectorAll("#filter button").forEach(b => {
  b.onclick = () => { filter = b.dataset.f;
    document.querySelectorAll("#filter button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    applyFilter(); };
});
document.querySelectorAll("#palette button").forEach(b => {
  b.onclick = () => { scheme = b.dataset.p;
    document.querySelectorAll("#palette button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    render(); };
});
document.getElementById("clause").onclick = (e) => {
  clauseBreak = !clauseBreak;
  e.currentTarget.setAttribute("aria-pressed", clauseBreak ? "true" : "false");
  render();
};
document.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") { cur = (cur - 1 + list.length) % list.length; render(); }
  if (e.key === "ArrowRight") { cur = (cur + 1) % list.length; render(); }
});
window.addEventListener("resize", () => measure());

document.querySelector('#filter button[data-f="all"]').setAttribute("aria-pressed", "true");
document.querySelector('#palette button[data-p="B"]').setAttribute("aria-pressed", "true");
cur = initialIndex();
render();

/* 供外部自动化断言（verify-effect-page.js）—— 只读暴露 */
window.__grammarPage = {
  count: () => DATA.length,
  raw: i => DATA[i],
  goto: i => { cur = i; render(); },
  setScheme: s => { scheme = s; render(); },
  state: () => ({ scheme, clauseBreak, filter }),
  text: () => ({
    words: Array.from(document.querySelectorAll("#rows .w")).map(e => e.textContent),
    groups: Array.from(document.querySelectorAll("#rows .grp")).map(g => {
      const nameEl = g.querySelector(".name"), pillEl = g.querySelector(".pill"), wEl = g.querySelector(".w");
      const cs = el => el ? getComputedStyle(el) : null;
      return {
        comp: g.dataset.comp,
        words: Array.from(g.querySelectorAll(".w")).map(e => e.textContent),
        name: nameEl ? nameEl.textContent : "",
        nameColor: nameEl ? cs(nameEl).color : "",
        bg: g.dataset.bg, acc: g.dataset.acc, ink: g.dataset.ink,
        pill: pillEl ? cs(pillEl).backgroundColor : "",
        pillBorder: pillEl ? cs(pillEl).borderTopColor : "",
        wordColor: wEl ? cs(wEl).color : "",
        uls: Array.from(g.querySelectorAll(".ul")).map(e => cs(e).backgroundColor),
        pps: Array.from(g.querySelectorAll(".pp")).map(e => e.textContent),
        ppColors: Array.from(g.querySelectorAll(".pp")).map(e => cs(e).color)
      };
    }),
    rows: document.querySelectorAll("#rows > .sent").length,
    cards: Array.from(document.querySelectorAll("#cards .info")).map(e => e.textContent.slice(0, 8)),
    measure: document.getElementById("measure").textContent
  })
};
</script>
</body>
</html>
"""

doc = TEMPLATE.replace("__DATA__", payload)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(doc, encoding="utf-8")
print(f"句数 {len(slim_data)}（完整句 {sum(1 for x in slim_data if x['s'])} / 碎片 {sum(1 for x in slim_data if not x['s'])}）")
print(f"已生成: {OUT}")
print(f"体积: {OUT.stat().st_size/1024:.0f} KB（内嵌 {len(payload)/1024:.0f} KB 数据，无 CDN）")
