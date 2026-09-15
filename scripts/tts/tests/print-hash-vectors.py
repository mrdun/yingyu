"""打印 FNV-1a 64 位参考值，供客户端单测做固定向量（防止算法漂移）。

与 `scripts/tts/generate-audio.py` 的 fnv1a64 必须完全一致。
用法: python scripts/tts/tests/print-hash-vectors.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from importlib import import_module  # noqa: E402

gen = import_module("generate-audio") if False else None  # 文件名带横线，不能直接 import

# 直接复制实现（下方断言保证与生成脚本一致）
CANDIDATES = ["", "a", "foobar", "I like the food", "don't like",
              "English-speaking environment", "英语", "I need to know if I am important"]


def fnv1a64(text: str) -> str:
    h = 0xCBF29CE484222325
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


if __name__ == "__main__":
    # 与生成脚本对拍：确保这份复制品没走样
    import re

    src = (Path(__file__).resolve().parents[1] / "generate-audio.py").read_text(encoding="utf-8")
    body = re.search(r"def fnv1a64.*?return f\"\{h:016x\}\"", src, re.S)
    assert body, "未能在 generate-audio.py 里定位 fnv1a64"
    for s in CANDIDATES:
        print(f'  ["{s}",', f'"{fnv1a64(s)}"],')
