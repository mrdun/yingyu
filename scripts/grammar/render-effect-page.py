"""生成「练习页语法标注」效果页 —— 自包含单文件 HTML, 可直接双击打开, 也可在 Hermes 里内联预览。

与 `render-preview.py` 的区别:
  * `render-preview.py` 出的是**静态截图用**的稿子（服务端渲染, 固定展示 5 条）
  * 本脚本出的是**能点、能切、能截图真值**的效果页（客户端渲染, 全部 218 条, 真实测量行数）

页面能力:
  * 上一句 / 下一句 / 跳到最长句 / 按类型筛选（全部·碎片·短句·长句）
  * 四个开关: **从句断行**（本轮的核心结论）/ 逐词词性 / 结构卡 / 中文
  * 键盘 ← → 切换
  * 每句**实时测量**: 面板可用宽 / 本句单行需多少 px / 实际占几行 / 是否被迫折行

数据 = 真实模型对「零基础学英语 · 第一课」218 条的标注（`.hermes/design/grammar-lesson1-annotated.json`）。
不内嵌任何 CDN —— 离线可用。
"""
import json
from pathlib import Path

REPO = Path("C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm")
OUT = REPO / ".hermes/design/grammar-effect-page.html"
SRC = REPO / ".hermes/design/grammar-lesson1-annotated.json"


def slim(x):
    """压掉前端用不到的字段（note/confidence/start/end）以缩小体积。"""
    g = x["annotation"]
    words = [{"t": w["text"], "p": w.get("pos") or ""} for w in g.get("words", [])]
    if not words:
        words = [{"t": t, "p": ""} for t in x["english"].split(" ")]
    phrases = []
    for p in g.get("phrases", []):
        if not p.get("role"):
            continue
        phrases.append({"t": p["text"], "r": p["role"], "k": p.get("roleType") or ""})
    return {
        "o": x.get("order"),
        "en": x["english"],
        "cn": x.get("chinese") or "",
        "s": 1 if g.get("isSentence") else 0,
        "w": words,
        "ph": phrases,
        "st": g.get("structure") or "",
        "pt": g.get("pattern") or "",
        "te": g.get("tense") or "",
        "ty": g.get("sentenceType") or "",
        "cl": g.get("clauseType") or "",
        "kp": g.get("keyPoints") or [],
    }


data = json.load(open(SRC, encoding="utf-8"))
slim_data = [slim(x) for x in data]
payload = json.dumps(slim_data, ensure_ascii=False, separators=(",", ":"))

TEMPLATE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>练习页 · 句子语法标注（效果页）</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --cream: #FBF7E8;
    --ink: #0F172A;
    --muted: #5B6B80;
    --line: #E5E7EB;
    --blue: #2C5AF4;
    --panel: #FFFDF7;
  }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif;
    background: var(--cream); color: var(--ink);
    font-size: 14px; line-height: 1.5;
    padding: 14px;
  }
  /* 内容靠左铺开、不套居中壳 —— 内联预览靠第一个元素的宽度测尺寸 */
  .app { width: 100%; max-width: 1040px; }

  /* ── 顶栏（模拟练习页骨架）────────────────────────── */
  .bar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 0 0 10px;
  }
  .btn {
    display: inline-flex; align-items: center; gap: 5px;
    border: 1px solid var(--line); background: #fff; color: #3F4B5B;
    border-radius: 999px; padding: 6px 13px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: .15s; white-space: nowrap;
    font-family: inherit;
  }
  .btn:hover { border-color: #C7D2FE; color: var(--blue); }
  .btn:active { transform: translateY(1px); }
  .btn[aria-pressed="true"] { background: var(--blue); border-color: var(--blue); color: #fff; }
  .btn[disabled] { opacity: .45; cursor: not-allowed; }
  .title { font-size: 15px; font-weight: 800; }
  .sub { font-size: 12.5px; color: var(--muted); }
  .spacer { flex: 1 1 auto; }

  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; background: #fff; overflow: hidden; }
  .seg button {
    border: 0; background: transparent; color: #3F4B5B; font-family: inherit;
    padding: 6px 12px; font-size: 12.5px; font-weight: 700; cursor: pointer;
  }
  .seg button[aria-pressed="true"] { background: #EFF6FF; color: var(--blue); }

  /* ── 句子卡 ─────────────────────────────────────── */
  .card {
    background: #fff; border: 1px solid var(--line); border-radius: 14px;
    padding: 16px 18px 14px; margin-bottom: 12px;
  }
  .head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
  .cn { font-size: 15.5px; font-weight: 800; }
  .badge { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
  .b-sent { background: #EFF6FF; color: var(--blue); }
  .b-frag { background: #F1F5F9; color: #64748B; }
  .b-en { background: #F8FAFC; color: #7B8794; font-family: ui-monospace, SFMono-Regular, monospace; font-weight: 600; }
  .b-ok { background: #ECFDF5; color: #047857; }
  .b-warn { background: #FFF4E0; color: #8A4B00; }

  .measure { font-size: 12px; color: var(--muted); margin: 2px 0 12px; }
  .measure b { color: var(--ink); font-variant-numeric: tabular-nums; }

  .rows { display: flex; flex-direction: column; align-items: center; row-gap: 16px; margin: 4px 0 6px; }
  .sent { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; column-gap: 16px; row-gap: 12px; }

  .grp { display: grid; justify-content: center; column-gap: 4px; }
  .cap {
    grid-column: 1 / -1; height: 24px;
    display: flex; align-items: center; justify-content: center; margin-bottom: 5px;
  }
  .cap:not(:empty) {
    justify-self: center; padding: 3px 11px 4px;
    background: var(--c); color: #fff;      /* 实心饱和色 + 白字, 对比度已实算 >= 4.5:1 */
    border-radius: 999px; font-size: 12px; font-weight: 800; line-height: 1.15; white-space: nowrap;
  }
  .cap i { font-style: normal; font-size: 9.5px; font-weight: 700; opacity: .78; }
  .w {
    grid-row: 2; justify-self: center; align-self: end;
    font-size: 25px; font-weight: 700; line-height: 1.15; letter-spacing: .2px; white-space: nowrap;
  }
  .bar2 { grid-column: 1 / -1; grid-row: 3; height: 3px; border-radius: 2px; background: var(--c); margin-top: 4px; }
  .p { grid-row: 4; justify-self: center; margin-top: 5px; font-size: 11px; font-weight: 700; color: var(--c); white-space: nowrap; }
  .bar2.bare { background: #CBD5E1; }
  .p.bare { color: #94A3B8; }

  /* ── 信息卡 ─────────────────────────────────────── */
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 9px; margin-top: 14px; }
  .info { border-radius: 10px; padding: 9px 11px; border: 1px solid; }
  .c-blue { background: #EFF6FF; border-color: #BFDBFE; }
  .c-amber { background: #FFFBEB; border-color: #FDE68A; }
  .c-violet { background: #F5F3FF; border-color: #DDD6FE; }
  .c-rose { background: #FFF1F2; border-color: #FECDD3; }
  .wide { grid-column: 1 / -1; }
  .info-t { font-size: 10.5px; font-weight: 700; opacity: .62; margin-bottom: 3px; }
  .info-v { font-size: 13.5px; font-weight: 800; }
  .info ul { margin: 0; padding-left: 15px; font-size: 12.5px; line-height: 1.75; color: #334155; }
  .tag {
    display: inline-block; margin-top: 5px; font-size: 10.5px; font-weight: 700;
    background: rgba(255,255,255,.75); border: 1px solid rgba(15,23,42,.10);
    border-radius: 999px; padding: 2px 8px; color: #334155;
  }

  /* ── 图例 + 说明 ────────────────────────────────── */
  .legend { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .lg { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 700; color: #475569; }
  .dot { width: 22px; height: 12px; border-radius: 999px; background: var(--c); }
  .note {
    background: #fff; border: 1px solid var(--line); border-radius: 12px;
    padding: 11px 13px; font-size: 12.5px; line-height: 1.85; color: var(--muted);
  }
  .note b { color: var(--ink); }
  .note code { background: #F1F5F9; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
  .hint { font-size: 12px; color: var(--muted); }
  kbd {
    background: #F1F5F9; border: 1px solid var(--line); border-bottom-width: 2px;
    border-radius: 5px; padding: 1px 5px; font-size: 11px; font-family: inherit; font-weight: 700;
  }
</style>
</head>
<body>
<div class="app">

  <!-- 顶栏 -->
  <div class="bar">
    <button class="btn" id="prev">← 上一句</button>
    <button class="btn" id="next">下一句 →</button>
    <span class="title">零基础学英语 · 第一课</span>
    <span class="sub" id="pos">— / —</span>
    <span class="spacer"></span>
    <button class="btn" id="jumpLong">跳到最长句</button>
  </div>

  <!-- 筛选 + 开关 -->
  <div class="bar">
    <span class="seg" id="filter">
      <button data-f="all">全部</button>
      <button data-f="frag">碎片</button>
      <button data-f="short">短句</button>
      <button data-f="long">长句</button>
    </span>
    <span class="seg" id="toggles">
      <button data-t="clause" aria-pressed="true">从句断行</button>
      <button data-t="pos" aria-pressed="true">逐词词性</button>
      <button data-t="cards" aria-pressed="true">结构卡</button>
      <button data-t="cn" aria-pressed="true">中文</button>
    </span>
    <span class="hint">用 <kbd>←</kbd> <kbd>→</kbd> 切换句子</span>
  </div>

  <!-- 句子 -->
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

  <!-- 图例 -->
  <div class="card">
    <div class="legend" id="legend"></div>
  </div>

  <!-- 说明 -->
  <div class="note">
    <b>这一页是什么</b>：练习页里「句子语法标注」面板的效果页。数据是真实模型对
    <b>「零基础学英语 · 第一课」218 条</b>的标注，不是示例。
    <b>一个句子成分 = 一个实心彩色胶囊</b>；单词裸露不装框；胶囊下方<b>一条横条横跨该成分的全部词</b>；
    横条下方是逐词词性。<br />
    <b>要你重点看的两处</b>：① 打开/关闭上面的「<b>从句断行</b>」，看那几句 17–21 词的并列句
    （点「跳到最长句」）有什么差别 —— 这是我们选的方案，靠它在 <code>so</code> 处断开，
    现有面板宽度就装得下，不必把练习区改成全宽，也不必限制句子长度。
    ② 每句下面那行<b>实时测量值</b>：面板可用宽 / 本句单行需要多少 px / 实际占几行。
    切换宽度看它怎么变（拖动窗口），这是浏览器真实量的，不是我估的。<br />
    <b>碎片</b>（如 <code>to do it</code>）按规范只给逐词词性，不给成分胶囊与结构。
  </div>
</div>

<script>
const DATA = __DATA__;

/* 成分 → 实心色。白字对比度已用 scripts/ew-contrast.py 实算, 全部 >= 4.5:1 */
const ROLE_COLOR = {
  "主语": "#7C3AED", "谓语": "#2563EB", "宾语": "#047857",
  "表语": "#0E7490", "状语": "#C2410C", "定语": "#BE185D",
  "连接词": "#475569"
};
const DEFAULT_COLOR = "#475569";
const CONJ_ROLE = "连接词";

const opts = { clause: true, pos: true, cards: true, cn: true };
let filter = "all";
let list = DATA.slice();
let cur = 0;
/* ── 把短语匹配到词序号（与 python 端 group_of 同一算法）────────────
   必须按**起点排序**后再用：早先按「文本首次出现位置」排序会让 cursor 乱走、
   重复输出已覆盖的词，一条 14 词的句子被渲染出 21 个词。*/
function toGroups(item) {
  const words = item.w.map(x => x.t);
  const spans = [];
  for (const p of item.ph) {
    const pt = p.t.split(" ");
    for (let s = 0; s + pt.length <= words.length; s++) {
      let ok = true;
      for (let k = 0; k < pt.length; k++) if (words[s + k] !== pt[k]) { ok = false; break; }
      if (!ok) continue;
      if (spans.some(sp => s < sp.e && s + pt.length > sp.b)) continue;  // 与已有短语重叠
      spans.push({ b: s, e: s + pt.length, p });
      break;
    }
  }
  spans.sort((a, b) => a.b - b.b);
  return spans.map(sp => ({ p: sp.p, idx: Array.from({ length: sp.e - sp.b }, (_, i) => sp.b + i) }));
}

/* 覆盖全部词的顺序单元（成分组 + 未被成分覆盖的散词） */
function toUnits(item, groups) {
  const n = item.w.length, units = [];
  let c = 0;
  for (const g of groups) {
    while (c < g.idx[0]) { units.push({ p: null, idx: [c] }); c++; }
    units.push(g); c = g.idx[g.idx.length - 1] + 1;
  }
  while (c < n) { units.push({ p: null, idx: [c] }); c++; }
  return units;
}

/* 按从句边界切行：连接词另起一行 → 长并列句不再被挤成多行 */
function toRows(units, clauseBreak) {
  const rows = []; let cur = [];
  for (const u of units) {
    if (clauseBreak && cur.length && u.p && u.p.r === CONJ_ROLE) { rows.push(cur); cur = []; }
    cur.push(u);
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

function render() {
  const it = list[cur];
  const isSent = !!it.s;
  const groups = isSent ? toGroups(it) : [];
  const units = isSent ? toUnits(it, groups) : it.w.map((_, i) => ({ p: null, idx: [i] }));
  const rows = isSent ? toRows(units, opts.clause) : units.map(u => [u]);

  document.getElementById("cn").textContent = opts.cn ? it.cn : "";
  document.getElementById("cn").style.display = (opts.cn && it.cn) ? "" : "none";
  document.getElementById("en").textContent = it.en;
  const kind = document.getElementById("kind");
  kind.className = "badge " + (isSent ? "b-sent" : "b-frag");
  kind.textContent = isSent ? "完整句" : "碎片 / 单词";

  const out = [];
  for (const row of rows) {
    out.push('<div class="sent">');
    for (const u of row) {
      const color = u.p ? (ROLE_COLOR[u.p.r] || DEFAULT_COLOR) : "#475569";
      const bare = u.p ? "" : " bare";
      const cols = `repeat(${u.idx.length},auto)`;
      const sub = (u.p && u.p.k) ? `<i>·${esc(u.p.k)}</i>` : "";
      out.push(`<div class="grp" data-c${u.p ? "" : "b"}="1" style="--c:${color};grid-template-columns:${cols}">`);
      out.push(`<div class="cap">${u.p ? esc(u.p.r) + sub : ""}</div>`);
      for (const i of u.idx) out.push(`<span class="w">${esc(it.w[i].t)}</span>`);
      out.push(`<div class="bar2${bare}"></div>`);
      if (opts.pos) {
        for (const i of u.idx) {
          const p = it.w[i].p;
          out.push(`<span class="p${bare}">${p ? esc(p) : "&nbsp;"}</span>`);
        }
      }
      out.push("</div>");
    }
    out.push("</div>");
  }
  const rowsEl = document.getElementById("rows");
  rowsEl.innerHTML = out.join("");

  /* 信息卡 */
  const cards = [];
  const card = opts.cards;
  if (card && isSent) {
    if (it.st) cards.push(`<div class="info c-blue"><div class="info-t">句子结构</div><div class="info-v">${esc(it.st)}</div>${it.pt ? `<span class="tag">${esc(it.pt)}</span>` : ""}</div>`);
    if (it.te) cards.push(`<div class="info c-amber"><div class="info-t">时态</div><div class="info-v">${esc(it.te)}</div></div>`);
    if (it.ty) cards.push(`<div class="info c-violet"><div class="info-t">句型</div><div class="info-v">${esc(it.ty)}</div>${it.cl ? `<span class="tag">${esc(it.cl)}</span>` : ""}</div>`);
    if (it.kp && it.kp.length) cards.push(`<div class="info c-rose wide"><div class="info-t">语法要点</div><ul>${it.kp.map(k => `<li>${esc(k)}</li>`).join("")}</ul></div>`);
  } else if (card) {
    cards.push(`<div class="info wide" style="background:#F8FAFC;border-color:#E5E7EB;color:#94A3B8;font-size:12px;font-weight:600">碎片只显示逐词词性 —— 不显示成分胶囊 / 结构 / 时态</div>`);
  }
  document.getElementById("cards").innerHTML = cards.join("");

  document.getElementById("pos").textContent = `${cur + 1} / ${list.length}　（第 ${it.o} 句）`;
  measure();
}

/* 实时测量: 面板可用宽 / 本句单行需要多少 px / 实际占几行。浏览器真实量的。*/
function measure() {
  const rowsEl = document.getElementById("rows");
  const avail = Math.round(rowsEl.getBoundingClientRect().width);
  const sentRows = Array.from(rowsEl.querySelectorAll(":scope > .sent"));
  let natural = 0, wrap = 0;
  for (const r of sentRows) {
    const grps = Array.from(r.querySelectorAll(":scope > .grp"));
    const sum = grps.reduce((a, g) => a + g.getBoundingClientRect().width, 0);
    natural = Math.max(natural, Math.round(sum + Math.max(0, grps.length - 1) * 16));
    const tops = new Set(grps.map(g => Math.round(g.getBoundingClientRect().top)));
    wrap += Math.max(0, tops.size - 1);
  }
  const totalLines = sentRows.length + wrap;
  const m = document.getElementById("measure");
  const fit = wrap === 0;
  m.innerHTML = `面板可用宽 <b>${avail}px</b> · 本句单行需 <b>${natural}px</b> · `
    + `实际 <b>${totalLines} 行</b>${sentRows.length > 1 ? `（从句断行 ${sentRows.length} 段）` : ""} `
    + `　<span class="badge ${fit ? "b-ok" : "b-warn"}">${fit ? "不折行 ✓" : `被迫折行 ${wrap} 次`}</span>`;
}

function applyFilter() {
  const N = it => it.w.length;
  if (filter === "frag") list = DATA.filter(x => !x.s);
  else if (filter === "short") list = DATA.filter(x => x.s && N(x) <= 6);
  else if (filter === "long") list = DATA.filter(x => x.s && N(x) >= 10);
  else list = DATA.slice();
  cur = 0;
  render();
}

/* 打开页面时落在一条**有代表性的完整句**上 —— 第 1 条是单词碎片 `I`, 上方没有任何胶囊,
   用户打开会以为「怎么没有气泡」。挑第一条 4~6 词的完整句作默认。*/
function initialIndex() {
  const i = DATA.findIndex(x => x.s && x.w.length >= 4 && x.w.length <= 6);
  return i >= 0 ? i : 0;
}

/* ── 事件 ─────────────────────────────────────────── */
document.getElementById("prev").onclick = () => { cur = (cur - 1 + list.length) % list.length; render(); };
document.getElementById("next").onclick = () => { cur = (cur + 1) % list.length; render(); };
document.getElementById("jumpLong").onclick = () => {
  let best = 0;
  list.forEach((x, i) => { if (x.w.length > list[best].w.length) best = i; });
  cur = best; render();
};
document.querySelectorAll("#filter button").forEach(b => {
  b.onclick = () => {
    filter = b.dataset.f;
    document.querySelectorAll("#filter button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    applyFilter();
  };
});
document.querySelectorAll("#toggles button").forEach(b => {
  b.onclick = () => {
    const k = b.dataset.t;
    opts[k] = !opts[k];
    b.setAttribute("aria-pressed", opts[k] ? "true" : "false");
    render();
  };
});
document.addEventListener("keydown", e => {
  if (e.key === "ArrowLeft") { cur = (cur - 1 + list.length) % list.length; render(); }
  if (e.key === "ArrowRight") { cur = (cur + 1) % list.length; render(); }
});
window.addEventListener("resize", () => measure());

/* 图例 */
document.getElementById("legend").innerHTML =
  '<span class="lg" style="margin-right:6px">成分配色</span>' +
  Object.entries(ROLE_COLOR).map(([r, c]) => `<span class="lg"><span class="dot" style="--c:${c}"></span>${r}</span>`).join("");

document.querySelector('#filter button[data-f="all"]').setAttribute("aria-pressed", "true");
cur = initialIndex();
render();

/* 供外部自动化断言用（verify-effect-page.js）—— 只读暴露, 不改页面行为 */
window.__grammarPage = {
  count: () => DATA.length,
  raw: i => DATA[i],
  goto: i => { cur = i; render(); },
  setFilter: applyFilter,
  text: () => ({
    words: Array.from(document.querySelectorAll("#rows .w")).map(e => e.textContent),
    caps: Array.from(document.querySelectorAll("#rows .cap")).filter(e => e.textContent.trim()).map(e => e.textContent),
    rows: document.querySelectorAll("#rows > .sent").length,
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
size = OUT.stat().st_size
print(f"句数 {len(slim_data)}（完整句 {sum(1 for x in slim_data if x['s'])} / 碎片 {sum(1 for x in slim_data if not x['s'])}）")
print(f"已生成: {OUT}")
print(f"体积: {size/1024:.0f} KB（内嵌 {len(payload)/1024:.0f} KB 数据，无 CDN）")
