"""按参照图的视觉语言重做效果预览 (v2)。

参照图规格 (精读自用户提供的截图):
  * 词上方 = **实心浅色胶囊** (浅色填充 + 同色深字 + 同色描边), 两行: 成分 + 短语类型
  * 胶囊 -> 词: **同色细实线 + 端点小圆点** (不是虚线)
  * 词本身 = 浅色圆角小卡片
  * 词下方 = **同色短横条 + 同色词性文字** (无下划线)
  * **词性颜色跟随所属成分的颜色** (参照图里 I/代词 同为粉, like/动词 同为蓝)

v1 的问题是只做了「彩色小字 + 虚线下划线」, 看着根本不是气泡 —— 这是用户直接指出的。
"""
import json
from pathlib import Path

TMP = Path("C:/Users/mrdun/AppData/Local/Temp")
OUT = Path("C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm/.hermes/design/grammar-panel-preview.html")

data = json.load(open(TMP / "ew-lesson1-annotated.json", encoding="utf-8"))
print(f"数据源: 第一课 {len(data)} 条")

# 成分 → (深字色, 浅底, 描边) —— 参照图是「浅底深字 + 同色描边」
ROLE_THEME = {
    "主语": ("#BE185D", "#FCE7F3", "#F9A8D4"),   # 玫红
    "谓语": ("#1D4ED8", "#DBEAFE", "#93C5FD"),   # 蓝
    "宾语": ("#047857", "#D1FAE5", "#6EE7B7"),   # 绿
    "状语": ("#6D28D9", "#EDE9FE", "#C4B5FD"),   # 紫
    "表语": ("#0E7490", "#CFFAFE", "#67E8F9"),   # 青
    "定语": ("#C2410C", "#FFEDD5", "#FDBA74"),   # 橙
    "连接词": ("#475569", "#F1F5F9", "#CBD5E1"),
}
DEFAULT_THEME = ("#475569", "#F1F5F9", "#CBD5E1")

full = [d for d in data if d["annotation"].get("isSentence") and d["annotation"].get("phrases")]
frag = [d for d in data if not d["annotation"].get("isSentence")]


def wc(d):
    return len(d["english"].split(" "))


full_sorted = sorted(full, key=lambda d: (-len(d["annotation"].get("phrases", [])), wc(d)))
short_svo = [d for d in full if 4 <= wc(d) <= 5]
with_adv = [d for d in full if "状语" in (d["annotation"].get("pattern") or "") and wc(d) <= 8]
longer = [d for d in full if wc(d) >= 9]
picked = (short_svo[:1] + with_adv[:1] + longer[:1])
for cand in full_sorted:
    if len(picked) >= 3:
        break
    if cand not in picked:
        picked.append(cand)
frag_picked = [f for f in frag if wc(f) >= 3][:1] + [f for f in frag if wc(f) == 1][:1]
show = picked + frag_picked


def render_item(d):
    eng = d["english"]
    g = d["annotation"]
    words = sorted(g.get("words", []), key=lambda w: eng.find(w["text"]))
    phrases = sorted([p for p in g.get("phrases", []) if p.get("role")], key=lambda p: eng.find(p["text"]))
    wlist = [w["text"] for w in words]
    if not wlist:
        return ""
    n = len(wlist)

    # 短语 → 网格列跨度
    spans = []
    for p in phrases:
        pt = p["text"].split(" ")
        for start in range(len(wlist) - len(pt) + 1):
            if wlist[start:start + len(pt)] == pt:
                spans.append({**p, "col": start + 1, "span": len(pt)})
                break

    # 词 → 所属短语 (用来把词性染成该成分的颜色, 与参照图一致)
    word_theme = {}
    for i, w in enumerate(words):
        theme = DEFAULT_THEME
        for s in spans:
            if s["col"] <= i + 1 < s["col"] + s["span"]:
                theme = ROLE_THEME.get(s["role"], DEFAULT_THEME)
                break
        word_theme[i] = theme

    is_sent = g["isSentence"]
    out = ['<div class="item">']
    out.append(f'<div class="item-head"><span class="cn">{d.get("chinese", "")}</span>'
               f'<span class="badge {"b-sent" if is_sent else "b-frag"}">'
               f'{"完整句" if is_sent else "碎片 / 单词"}</span></div>')

    out.append(f'<div class="grid" style="grid-template-columns: repeat({n}, auto)">')

    # --- 第 1 行: 实心胶囊 (成分) + 连接线 ---
    grid = {s["col"]: s for s in spans}
    col = 1
    while col <= n:
        if col in grid:
            s = grid[col]
            fg, bg, bd = ROLE_THEME.get(s["role"], DEFAULT_THEME)
            sub = f'<small>{s["roleType"]}</small>' if s.get("roleType") else ""
            note = f'<i>{s["note"]}</i>' if s.get("note") else ""
            # 多词短语用「括号 + 两端下折」把整段词框住; 单词用单根下垂线
            conn_cls = "conn conn--wide" if s["span"] > 1 else "conn"
            out.append(
                f'<div class="cell" style="grid-column:{col} / span {s["span"]}">'
                f'<span class="pill" style="--fg:{fg};--bg:{bg};--bd:{bd}">'
                f'<b>{s["role"]}</b>{sub}{note}</span>'
                f'<span class="{conn_cls}" style="--bd:{bd}"></span></div>'
            )
            col += s["span"]
        else:
            out.append(f'<div class="cell" style="grid-column:{col}"></div>')
            col += 1

    # --- 第 2 行: 词 (浅色圆角小卡) ---
    for i, w in enumerate(words):
        out.append(f'<div class="word">{w["text"]}</div>')

    # --- 第 3 行: 词性 (短彩条 + 同色文字, 颜色跟随所属成分) ---
    for i, w in enumerate(words):
        fg, _, bd = word_theme[i]
        out.append(f'<div class="pos" style="--c:{fg};--bar:{bd}">{w.get("pos") or "—"}</div>')

    out.append("</div>")

    # --- 信息卡 ---
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
                   '碎片只显示逐词词性 —— 不显示成分胶囊 / 结构 / 时态（按规范 §8 降级）</div></div>')

    out.append("</div>")
    return "\n".join(out)


body = "\n".join(render_item(d) for d in show)

DOC = f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>练习页语法标注 · 效果预览</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
    background: #FBF7E8; color: #0F172A; padding: 22px; font-size: 14px;
  }}
  .note-top {{
    max-width: 940px; margin: 0 auto 18px; padding: 12px 14px;
    background: #fff; border: 1px solid #E5E7EB; border-radius: 10px;
    font-size: 12.5px; line-height: 1.8; color: #5B6B80;
  }}
  .note-top b {{ color: #0F172A; }}
  .item {{
    max-width: 940px; margin: 0 auto 18px; padding: 18px 20px 16px;
    background: #fff; border: 1px solid #E5E7EB; border-radius: 14px;
  }}
  .item-head {{ display: flex; align-items: center; gap: 9px; margin-bottom: 26px; }}
  .cn {{ font-size: 15px; font-weight: 800; }}
  .badge {{ font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }}
  .b-sent {{ background: #EFF6FF; color: #2C5AF4; }}
  .b-frag {{ background: #F1F5F9; color: #64748B; }}

  /* 列宽按内容 (而不是等宽 1fr) —— 等宽会把每个词拉得很远, 句子读起来割裂 */
  .grid {{
    display: grid;
    justify-content: center;
    column-gap: 6px;
    margin-bottom: 4px;
  }}
  .cell {{
    grid-row: 1;
    display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    min-width: 0;
  }}
  /* 实心胶囊: 浅色填充 + 同色深字 + 同色描边 (照参照图, 不是描边文字) */
  .pill {{
    display: inline-flex; flex-direction: column; align-items: center;
    padding: 4px 11px 5px;
    border-radius: 999px;
    background: var(--bg);
    border: 1px solid var(--bd);
    color: var(--fg);
    font-size: 12px; font-weight: 800; line-height: 1.25;
    white-space: nowrap;
  }}
  .pill b {{ font-weight: 800; }}
  .pill small {{ font-size: 9.5px; font-weight: 700; opacity: 0.72; margin-top: 1px; }}
  .pill i {{ font-style: normal; font-size: 9.5px; font-weight: 600; opacity: 0.6; }}

  /*
   * 连接线: 单词 = 一根同色下垂线 + 端点小圆点;
   *         多词短语 = 横跨整段的括号线 + 两端下折 + 中点圆点
   * 目的: 一眼看出这个成分覆盖了哪几个词, 而不是让线落在词间空隙里。
   */
  .conn {{ position: relative; display: block; width: 100%; height: 18px; }}
  .conn::before, .conn::after {{ content: ""; position: absolute; background: var(--bd); }}
  .conn::before {{ left: 50%; top: 0; width: 1.5px; height: 15px; margin-left: -0.75px; }}
  .conn::after {{
    left: 50%; bottom: 0; width: 6px; height: 6px;
    margin-left: -3px; border-radius: 999px;
  }}
  /* 多词短语: 上横线 + 两端下折的括号 + 中点圆点 */
  .conn--wide {{ border-left: 1.5px solid var(--bd); border-right: 1.5px solid var(--bd); }}
  .conn--wide::before {{
    left: 0; right: 0; top: 0; width: auto; height: 1.5px; margin-left: 0;
  }}
  .conn--wide::after {{
    left: 50%; bottom: 0; width: 6px; height: 6px;
    margin-left: -3px; border-radius: 999px;
  }}

  .word {{
    grid-row: 2;
    justify-self: center;
    padding: 5px 9px;
    border: 1px solid #E9EDF3;
    border-radius: 9px;
    background: #FCFDFF;
    font-size: 17px; font-weight: 800; line-height: 1.2;
    white-space: nowrap;
  }}
  /* 词性: 同色短横条 + 同色文字 (颜色跟随所属成分) */
  .pos {{
    grid-row: 3;
    justify-self: center;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    margin-top: 7px; margin-bottom: 4px;
    font-size: 11px; font-weight: 700; color: var(--c);
    white-space: nowrap;
  }}
  .pos::before {{
    content: ""; width: 20px; height: 2.5px; border-radius: 2px; background: var(--bar);
  }}

  .cards {{
    display: grid; grid-template-columns: repeat(auto-fit, minmax(158px, 1fr));
    gap: 9px; margin-top: 16px;
  }}
  .card {{ border-radius: 10px; padding: 10px 12px; border: 1px solid; }}
  .c-blue   {{ background: #EFF6FF; border-color: #BFDBFE; }}
  .c-amber  {{ background: #FFFBEB; border-color: #FDE68A; }}
  .c-violet {{ background: #F5F3FF; border-color: #DDD6FE; }}
  .c-rose   {{ background: #FFF1F2; border-color: #FECDD3; }}
  .card--wide {{ grid-column: 1 / -1; }}
  .card-t {{ font-size: 10.5px; font-weight: 700; opacity: 0.62; margin-bottom: 3px; }}
  .card-v {{ font-size: 13.5px; font-weight: 800; }}
  .card ul {{ margin: 0; padding-left: 15px; font-size: 12.5px; line-height: 1.75; color: #334155; }}
  .tag {{
    display: inline-block; margin-top: 6px; font-size: 10.5px; font-weight: 700;
    background: rgba(255,255,255,0.75); border: 1px solid rgba(15,23,42,0.10);
    border-radius: 999px; padding: 2px 8px; color: #334155;
  }}
  .muted {{ color: #94A3B8; font-size: 12px; font-weight: 600; background: #F8FAFC; border-color: #E5E7EB; }}
</style>
</head>
<body>
  <div class="note-top">
    <b>练习页语法标注 · 效果预览</b>（真实模型对「零基础学英语 · 第一课」的标注，共 {len(show)} 条）<br />
    词上方 <b>实心彩胶囊</b> = 句子成分（按短语标，同色线连到词）；词下方 <b>同色短条 + 文字</b> = 逐词词性
    （颜色跟随所属成分）；底部卡片 = 结构 / 时态 / 句型 / 语法要点。<b>碎片只显示词性</b>，不给成分与结构。
  </div>
{body}
</body>
</html>
"""

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(DOC, encoding="utf-8")
print(f"已生成: {OUT}")
print("展示: " + " | ".join(d["english"][:34] for d in show))
