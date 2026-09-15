"""量出每条句子的**自然单行宽度** —— 一次量完, 再换算成任意面板宽。

为什么不用「按面板宽逐个数行数」: 那样每个宽度都要跑一次浏览器, 而且 flex 换行后
`scrollWidth` 只等于容器宽, 拿不到自然宽。这里把 `.sent` 设成 `flex-wrap: nowrap`
并把容器放到 4000px, 于是 `scrollWidth` 就是这条句子排成一行真正需要的像素。

产物: $LOCALAPPDATA/Temp/ew-natural.html  (交给 measure-natural.js 量)

两组数据分开量, 不要混:
  L1-* = 第一课 100 条完整句, **真实成分分组**      → 真实使用情况
  C-*  = 全库 4,753 条唯一句, **每词自成一组**      → 成分间隔最多的**上界**
"""
import importlib.util
import json
import sys
from pathlib import Path

REPO = Path("C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm")
TMP = Path("C:/Users/mrdun/AppData/Local/Temp")

spec = importlib.util.spec_from_file_location("rp", REPO / "scripts/grammar/render-preview.py")
rp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rp)

data, _ = rp.load_data()
full = [d for d in data if d["annotation"].get("isSentence") and d["annotation"].get("phrases")]

corpus = []
cp = TMP / "ew-corpus-sentences.json"
if cp.exists():
    corpus = json.load(open(cp, encoding="utf-8"))
else:
    print(f"⚠️ 缺 {cp.name} —— 只用第一课 {len(full)} 条完标注句")

def item_by_key(key, d):
    """`L1-*`/`C-*` 用真实标注; `F-*` 用假数据（语料）。"""
    return d


def build_natural(full, corpus):
    probes = []
    for d in full:
        probes.append((f"L1-{d['order']}", rp.render_item(d)))
    for i, eng in enumerate(corpus):
        ws = eng.split(" ")
        fake = {"english": eng, "chinese": "", "order": 9000 + i,
                "annotation": {"isSentence": True,
                               "words": [{"text": x, "pos": ""} for x in ws],
                               "phrases": [{"text": x, "role": "主语", "roleType": "单词"} for x in ws]}}
        probes.append((f"C-{i}", rp.render_item(fake)))
    EXTRA = """
      .probe { width: 4000px; }
      .probe .item { width: 4000px !important; margin: 0; }
      .probe .sent { flex-wrap: nowrap; justify-content: flex-start; }
      .probe .item-head, .probe .cards { display: none; }
    """
    body = "\n".join(f'<div class="probe" data-key="{k}">{h}</div>' for k, h in probes)
    html = rp.HEAD % (rp.CSS + EXTRA) + body + "\n</body>\n</html>\n"
    tgt = TMP / "ew-natural.html"
    tgt.write_text(html, encoding="utf-8")
    print(f"真实分组 {len(full)} + 最坏分组 {len(corpus)} = {len(probes)} 探针 → {tgt}")


def build_width(w, full, corpus):
    probes = []
    for d in full:
        probes.append((f"L1-{d['order']}", rp.render_item(d, width=w)))
    for i, eng in enumerate(corpus):
        ws = eng.split(" ")
        fake = {"english": eng, "chinese": "", "order": 9000 + i,
                "annotation": {"isSentence": True,
                               "words": [{"text": x, "pos": ""} for x in ws],
                               "phrases": [{"text": x, "role": "主语", "roleType": "单词"} for x in ws]}}
        probes.append((f"C-{i}", rp.render_item(fake, width=w)))
    body = "\n".join(f'<div class="probe" data-w="{w}" data-key="{k}">{h}</div>' for k, h in probes)
    html = rp.HEAD % rp.CSS + body + "\n</body>\n</html>\n"
    tgt = TMP / f"ew-measure-{w}.html"
    tgt.write_text(html, encoding="utf-8")
    print(f"面板宽 {w}px: {len(probes)} 探针 → {tgt}")


mode = sys.argv[1] if len(sys.argv) > 1 else "natural"
if mode == "natural":
    build_natural(full, corpus)
else:
    build_width(int(mode), full, corpus)
