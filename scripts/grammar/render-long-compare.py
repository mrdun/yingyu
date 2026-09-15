"""把**最长的并列句**在几个面板宽下并排渲染 —— 评估长句方案要看同一句在不同宽度下的样子。

用法: python scripts/grammar/render-long-compare.py [句序号, 默认 190]
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

WIDTHS = [560, 780, 960, 1160, 1400]
want = int(sys.argv[1]) if len(sys.argv) > 1 else 190

data, _ = rp.load_data()
d = next((x for x in data if x["order"] == want), None)
if d is None:
    raise SystemExit(f"没有 order={want} 的句子")

blocks = []
for w in WIDTHS:
    rows = "·".join(str(x) for x in WIDTHS)
    blocks.append(
        f'<div class="probe" data-key="W{w}" data-w="{w}" style="width:{w}px">'
        f'<div class="wtag">面板可用宽 {w}px</div>{rp.render_item(d, width=None)}</div>'
    )

EXTRA = """
  body { background: #F1F4FD; }
  .probe { margin: 0 auto 14px; }
  .probe .item { margin: 0; }
  .wtag { font-size: 12px; font-weight: 800; color: #2C5AF4; margin-bottom: 6px; }
  .probe { padding: 0; }
"""
html = (rp.HEAD % (rp.CSS + EXTRA)
        + f'<div class="note-top"><b>长句压力测试</b> —— 「{d["english"]}」'
          f'（{len(d["english"].split(" "))} 词 / {len(d["annotation"].get("phrases", []))} 个成分）'
          f'<br />同一句话在 5 个面板可用宽下的实际渲染。面板可用宽 = 面板宽 − 卡片左右内边距。'
          f'</div>'
        + "\n".join(blocks) + "\n</body>\n</html>\n")
OUT = TMP / "ew-long-compare.html"
OUT.write_text(html, encoding="utf-8")
print(f"句子: {d['english']}")
print(f"已生成: {OUT}")
