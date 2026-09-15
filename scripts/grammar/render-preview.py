"""句子语法标注 · 效果预览渲染器。

## 视觉语言 (逐条对齐用户提供的参照图, 改前先读)

参照图结构, 从上到下、按「句子成分」分组:

    ┌──────────┐
    │  主语    │   ← 实心饱和色胶囊 + 白字 (这是**成分**名)
    └──────────┘
        I                ← 单词 = 裸露大字, **不装进任何小卡片**
    ━━━━━━━━━━━━          ← 一条同色横条, **横跨该成分的全部词**
       代词              ← 逐词词性, 与所属词同列对齐

## 与上一版的差异 (上一版被用户否掉, 别改回去)

| | 上一版 (错) | 本版 |
|---|---|---|
| 单词 | 各自装进白色小卡片 | **裸露在背景上** |
| 胶囊 | 浅色底 + 深色字 + 描边 | **实心饱和色 + 白字** |
| 横条 | 每词一条短横条 | **一条, 横跨整个成分** |
| 连线 | 同色下垂线 + 圆点 | **没有连线** (靠纵向对齐表达归属) |

上一版看着像「一个单词一个气泡」——根因是单词各自有边框和浅色底。
用户原话:「不是一个单词一个气泡胶囊, 而是相同的句子成分合在一个胶囊气泡中,
然后给这个句子成分的胶囊加入背景色」。

## 长句
成分组之间允许换行 (`.sent { flex-wrap: wrap }`), 靠组内结构一致保证词行对齐。
长度分布与各方案的取舍见 `references/course-content-pipeline.md`。
"""
import json
import sys
from pathlib import Path

REPO = Path("C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm")
TMP = Path("C:/Users/mrdun/AppData/Local/Temp")
OUT = REPO / ".hermes/design/grammar-panel-preview.html"


def load_data():
    for p in (REPO / ".hermes/design/grammar-lesson1-annotated.json",
              TMP / "ew-lesson1-annotated.json"):
        if p.exists():
            return json.load(open(p, encoding="utf-8")), p
    raise SystemExit("找不到标注数据")


# 成分 → 实心色。**白字必须 >= 4.5:1** —— 用 scripts/ew-contrast.py 算过:
# 全部 AA 达标 (5.17 ~ 7.58:1)。换色前必须重算, 不要凭眼睛选。
ROLE_COLOR = {
    "主语": "#7C3AED",   # 紫 5.70:1
    "谓语": "#2563EB",   # 蓝 5.17:1
    "宾语": "#047857",   # 绿 5.48:1
    "表语": "#0E7490",   # 青 5.36:1
    "状语": "#C2410C",   # 橙 5.18:1
    "定语": "#BE185D",   # 玫红 6.04:1
    "连接词": "#475569",  # 灰 7.58:1
}
DEFAULT_COLOR = "#475569"


def group_of(d):
    """把一条标注切成「成分组」: [(短语, [词序号...]), ...]，按词序升序、互不重叠。

    ⚠️ 踩过: 早先按 `eng.find(p["text"])` 给短语排序 —— 那个顺序**不等于**短语在词序列里的
    位置顺序（重复出现的词会让它乱序），于是渲染时 `cursor` 往回/乱走、**重复输出已覆盖的词**
    （实测一条 14 词的句子被渲染出 21 个词 span），进而把宽度测量也带偏。
    正确做法: 先算出每个短语的 (起, 止) 区间, **按起点排序**, 再交给渲染。
    """
    eng = d["english"]
    g = d["annotation"]
    wlist = [w["text"] for w in g.get("words", [])]
    if not wlist:
        wlist = eng.split(" ")
    phrases = [p for p in g.get("phrases", []) if p.get("role")]
    spans = []
    for p in phrases:
        pt = p["text"].split(" ")
        for s in range(len(wlist) - len(pt) + 1):
            if wlist[s:s + len(pt)] != pt:
                continue
            if any(s < e and s + len(pt) > b for b, e, _ in spans):
                continue                      # 与该短语重叠, 换下一个位置
            spans.append((s, s + len(pt), p))
            break
    spans.sort(key=lambda x: x[0])
    return wlist, [(p, list(range(s, e))) for s, e, p in spans]


def units_of(wlist, groups):
    """把成分组 + 未被覆盖的散词拼成覆盖全部词的顺序单元: [(短语或None, [词序号])]。"""
    units, cursor = [], 0
    for p, idxs in groups:
        while cursor < idxs[0]:
            units.append((None, [cursor]))
            cursor += 1
        units.append((p, idxs))
        cursor = idxs[-1] + 1
    while cursor < len(wlist):
        units.append((None, [cursor]))
        cursor += 1
    return units


CONJ_ROLES = {"连接词"}


def rows_of(units):
    """按**从句边界**切行: 连接词（so/and/but…）另起一行。

    为什么这么做: 实测那些「长句」几乎全是「两个简单句用 so 连起来」的并列句
    （第一课 6 条 17–21 词的全是 `It is … for me so I have to …` 这一族），
    单行要 1200–1500px，但**在 so 处断开后每半句只要 ~530px**，任何面板宽都放得下。
    这比「加宽面板」或「限制句子长度」都更省，也不损失任何内容。
    """
    rows, cur = [], []
    for p, idxs in units:
        if cur and p is not None and p.get("role") in CONJ_ROLES:
            rows.append(cur)
            cur = []
        cur.append((p, idxs))
    if cur:
        rows.append(cur)
    return rows


def render_item(d, width=None):
    eng = d["english"]
    g = d["annotation"]
    is_sent = bool(g.get("isSentence"))
    wlist, groups = group_of(d)
    pos_of = {}
    for i, w in enumerate(g.get("words", [])):
        if i < len(wlist):
            pos_of[i] = w.get("pos") or ""

    style = f' style="width:{width}px"' if width else ""
    out = [f'<div class="item"{style}>']
    out.append(f'<div class="item-head"><span class="cn">{d.get("chinese", "")}</span>'
               f'<span class="badge {"b-sent" if is_sent else "b-frag"}">'
               f'{"完整句" if is_sent else "碎片 / 单词"}</span>'
               f'<span class="badge b-mono">{eng}</span></div>')

    out.append('<div class="rows">')
    if groups:
        units = units_of(wlist, groups)
    else:
        units = [(None, [i]) for i in range(len(wlist))]
    for row in rows_of(units):
        out.append('<div class="sent">')
        for p, idxs in row:
            if p is None:
                out.append(render_bare(idxs, wlist, pos_of))
                continue
            color = ROLE_COLOR.get(p["role"], DEFAULT_COLOR)
            k = len(idxs)
            out.append(f'<div class="grp" style="--c:{color};'
                       f'grid-template-columns:repeat({k},auto)">')
            sub = f'·{p["roleType"]}' if p.get("roleType") else ""
            out.append(f'<div class="cap">{p["role"]}<i>{sub}</i></div>')
            for i in idxs:
                out.append(f'<span class="w">{wlist[i]}</span>')
            out.append('<div class="bar"></div>')
            for i in idxs:
                out.append(f'<span class="p">{pos_of.get(i) or "&nbsp;"}</span>')
            out.append("</div>")
        out.append("</div>")
    out.append("</div>")

    if is_sent and (g.get("structure") or g.get("tense") or g.get("keyPoints")):
        cards = []
        if g.get("structure"):
            pat = f'<span class="tag">{g["pattern"]}</span>' if g.get("pattern") else ""
            cards.append(f'<div class="card c-blue"><div class="card-t">句子结构</div>'
                         f'<div class="card-v">{g["structure"]}</div>{pat}</div>')
        if g.get("tense"):
            cards.append(f'<div class="card c-amber"><div class="card-t">时态</div>'
                         f'<div class="card-v">{g["tense"]}</div></div>')
        if g.get("sentenceType"):
            ct = f'<span class="tag">{g["clauseType"]}</span>' if g.get("clauseType") else ""
            cards.append(f'<div class="card c-violet"><div class="card-t">句型</div>'
                         f'<div class="card-v">{g["sentenceType"]}</div>{ct}</div>')
        if g.get("keyPoints"):
            lis = "".join(f"<li>{k}</li>" for k in g["keyPoints"])
            cards.append(f'<div class="card c-rose card--wide"><div class="card-t">语法要点</div>'
                         f'<ul>{lis}</ul></div>')
        out.append(f'<div class="cards">{"".join(cards)}</div>')
    else:
        out.append('<div class="cards"><div class="card card--wide muted">'
                   '碎片只显示逐词词性 —— 不显示成分胶囊 / 结构 / 时态</div></div>')

    out.append("</div>")
    return "\n".join(out)


def render_bare(idxs, wlist, pos_of):
    inner = "".join(f'<span class="w w-bare">{wlist[i]}</span>' for i in idxs)
    inner += '<div class="bar bar-bare"></div>'
    inner += "".join(f'<span class="p p-bare">{pos_of.get(i) or "&nbsp;"}</span>' for i in idxs)
    return (f'<div class="grp grp-bare" style="grid-template-columns:repeat({len(idxs)},auto)">'
            f'<div class="cap"></div>{inner}</div>')


CSS = """
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    background: #FBF7E8; color: #0F172A; padding: 22px; font-size: 14px;
  }
  .note-top {
    max-width: 960px; margin: 0 auto 18px; padding: 12px 14px;
    background: #fff; border: 1px solid #E5E7EB; border-radius: 10px;
    font-size: 12.5px; line-height: 1.8; color: #5B6B80;
  }
  .note-top b { color: #0F172A; }
  .item {
    margin: 0 auto 18px; padding: 16px 20px 14px;
    background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
  }
  .item-head { display: flex; align-items: center; gap: 9px; margin-bottom: 20px; flex-wrap: wrap; }
  .cn { font-size: 15px; font-weight: 800; }
  .badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
  .b-sent { background: #EFF6FF; color: #2C5AF4; }
  .b-frag { background: #F1F5F9; color: #64748B; }
  .b-mono { background: #F8FAFC; color: #94A3B8; font-family: ui-monospace, monospace; font-weight: 600; }

  /* 句子 = 一串「成分组」。组间留大空隙, 组内词紧挨 —— 这样读起来是一句话。 */
  .rows { display: flex; flex-direction: column; align-items: center; row-gap: 14px; }
  .sent {
    display: flex; flex-wrap: wrap; align-items: flex-start;
    justify-content: center; column-gap: 16px; row-gap: 12px;
  }
  /* 每个成分组 = 4 行网格: [胶囊][词...][横条][词性...] */
  .grp {
    display: grid; justify-content: center; column-gap: 4px;
  }
  /* 胶囊行: 高度固定, 保证所有组的「词行」在同一条基线上 */
  .cap {
    grid-column: 1 / -1;
    height: 24px; display: flex; align-items: center; justify-content: center;
    margin-bottom: 5px;
  }
  .cap:not(:empty) {
    justify-self: center;
    padding: 3px 11px 4px;
    background: var(--c);          /* 实心饱和色 */
    color: #fff;                   /* 白字, 对比度已算过 >= 4.5:1 */
    border-radius: 999px;
    font-size: 12px; font-weight: 800; line-height: 1.15;
    white-space: nowrap;
  }
  .cap i { font-style: normal; font-size: 9.5px; font-weight: 700; opacity: .78; }

  /* 单词: 裸露大字, **没有边框/底色/圆角** —— 就是这一点决定了「是不是一个词一个气泡」 */
  .w {
    grid-row: 2;
    justify-self: center; align-self: end;
    font-size: 25px; font-weight: 700; line-height: 1.15;
    letter-spacing: .2px;
    white-space: nowrap;
  }
  .w-bare { font-size: 25px; }

  /* 一条横条横跨该成分的**全部词** (不是每词一条) */
  .bar {
    grid-column: 1 / -1; grid-row: 3;
    height: 3px; border-radius: 2px; background: var(--c);
    margin-top: 4px;
  }
  .bar-bare { background: #CBD5E1; }

  /* 逐词词性: 与所属词同列对齐 */
  .p {
    grid-row: 4;
    justify-self: center;
    margin-top: 5px;
    font-size: 11px; font-weight: 700; color: var(--c);
    white-space: nowrap;
  }
  .p-bare { color: #94A3B8; }

  .cards {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
    gap: 9px; margin-top: 16px;
  }
  .card { border-radius: 10px; padding: 10px 12px; border: 1px solid; }
  .c-blue   { background: #EFF6FF; border-color: #BFDBFE; }
  .c-amber  { background: #FFFBEB; border-color: #FDE68A; }
  .c-violet { background: #F5F3FF; border-color: #DDD6FE; }
  .c-rose   { background: #FFF1F2; border-color: #FECDD3; }
  .card--wide { grid-column: 1 / -1; }
  .card-t { font-size: 10.5px; font-weight: 700; opacity: .62; margin-bottom: 3px; }
  .card-v { font-size: 13.5px; font-weight: 800; }
  .card ul { margin: 0; padding-left: 15px; font-size: 12.5px; line-height: 1.75; color: #334155; }
  .tag {
    display: inline-block; margin-top: 6px; font-size: 10.5px; font-weight: 700;
    background: rgba(255,255,255,.75); border: 1px solid rgba(15,23,42,.10);
    border-radius: 999px; padding: 2px 8px; color: #334155;
  }
  .muted { color: #94A3B8; font-size: 12px; font-weight: 600; background: #F8FAFC; border-color: #E5E7EB; }
"""

HEAD = """<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" />
<title>练习页语法标注 · 效果预览</title>
<style>%s</style>
</head>
<body>
"""


def wc(d):
    return len(d["english"].split(" "))


def self_check(data):
    """渲染自检: 每个词必须**恰好渲染一次、按原顺序**，成分胶囊数必须等于匹配到的短语数。

    这条自检是为了钉住「短语按 find() 排序导致重复输出词」那类缺陷 —— 它很隐蔽:
    页面看着是好的（词都在），只是某些词出现了两次，只有数一遍才发现。
    """
    import re
    bad = []
    for d in data:
        wlist, groups = group_of(d)
        html = render_item(d)
        spans = re.findall(r'<span class="w[^"]*">([^<]*)</span>', html)
        if spans != wlist:
            bad.append((d.get("order"), d["english"], len(wlist), len(spans), spans[:14]))
            continue
        caps = len(re.findall(r'<div class="cap">[^<]', html))
        if caps != len(groups):
            bad.append((d.get("order"), d["english"], len(groups), caps, "胶囊数不符"))
    if bad:
        print(f"\n✗ 渲染自检失败 {len(bad)} 条:")
        for o, e, a, b, extra in bad[:6]:
            print(f"   [{o}] {e}\n       期望 {a} / 实得 {b}   {extra}")
        return False
    print(f"✓ 渲染自检: {len(data)} 条 —— 词序与词数一致、胶囊数 == 匹配短语数")
    return True


def main():
    data, src = load_data()
    if not self_check(data):
        raise SystemExit(1)
    full = [d for d in data if d["annotation"].get("isSentence") and d["annotation"].get("phrases")]
    frag = [d for d in data if not d["annotation"].get("isSentence")]

    # 挑样本: 一短句 + 一带多词状语 + **最长的那句** (最长的正好是长句问题的证据)
    short = sorted([d for d in full if 4 <= wc(d) <= 5], key=wc)[:1]
    adv = sorted([d for d in full if "状语" in (d["annotation"].get("pattern") or "")
                  and 6 <= wc(d) <= 9], key=wc)[:1]
    longest = sorted(full, key=lambda d: -wc(d))[:1]
    mid = sorted([d for d in full if 5 <= wc(d) <= 8 and len(d["annotation"].get("phrases", [])) >= 3],
                 key=lambda d: -wc(d))[:1]
    picked = []
    for c in short + adv + longest + mid:
        if c not in picked:
            picked.append(c)
    picked = picked[:3]
    frag_picked = [f for f in frag if wc(f) >= 3][:1] + [f for f in frag if wc(f) == 1][:1]
    show = picked + frag_picked

    body = "\n".join(render_item(d) for d in show)
    note = (f'<div class="note-top"><b>练习页语法标注 · 效果预览</b>'
            f'（真实模型对「零基础学英语 · 第一课」的标注, 共 {len(show)} 条, 数据源 '
            f'{len(data)} 条）<br />'
            f'词上方 <b>实心彩胶囊 = 句子成分</b>（<b>同一成分合成一个胶囊</b>, 不是逐词一个）；'
            f'词 <b>裸露</b>不装框；成分下方 <b>一条同色横条</b> 横跨该成分的全部词；'
            f'横条下逐词词性。<b>碎片不给成分</b>, 只给词性。</div>')
    html = HEAD % CSS + note + "\n" + body + "\n</body>\n</html>\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"数据源: {src.name} ({len(data)} 条)")
    print(f"已生成: {OUT}")
    print("展示: " + " | ".join(f'{d["english"][:40]} ({wc(d)}词)' for d in show))


if __name__ == "__main__":
    main()
