"""批量产物质量抽查：随机抽取已生成的 mp3，用语音识别转回文字与原文比对。

为什么要单独一步：前面只验证过少量手工样本（8 句 / 40 句）。
批量跑完之后，产物是 4,700+ 个文件，**必须抽查确认「批量输出 == 手工样本的质量」**，
而不是假设「脚本跑完就等于都对」。

用法（用带 faster-whisper 的 python 跑）:
    python scripts/tts/tests/verify-batch-quality.py --sample 20
"""
from __future__ import annotations

import argparse
import json
import random
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AUDIO_DIR = REPO / "var/audio"
MANIFEST = AUDIO_DIR / "manifest.json"
ASR_MODEL_DIR = "C:/Users/mrdun/AppData/Local/Temp/fw-small"


def normalize(s: str) -> str:
    s = s.lower().replace("’", "'")
    return re.sub(r"[^a-z' ]+", " ", s).strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=20)
    ap.add_argument("--seed", type=int, default=20260915, help="固定种子，结果可复现")
    args = ap.parse_args()

    if not MANIFEST.exists():
        print(f"✗ 没有 manifest：{MANIFEST}（先跑 generate-audio.py）")
        return 1
    manifest: dict[str, str] = json.loads(MANIFEST.read_text(encoding="utf-8"))

    files = {p.stem: p for p in AUDIO_DIR.glob("*.mp3")}
    missing = [h for h in manifest if h not in files]
    print(f"manifest {len(manifest)} 条 · 目录内 {len(files)} 个 mp3 · 缺文件 {len(missing)} 个")
    if missing:
        print(f"  ⚠ 缺失示例: {[m + '.mp3' for m in missing[:5]]}")
    orphan = [h for h in files if h not in manifest]
    if orphan:
        print(f"  ⚠ 游离文件 {len(orphan)} 个（不在 manifest 里）")

    from faster_whisper import WhisperModel

    print(f"加载识别模型 {ASR_MODEL_DIR} …")
    model = WhisperModel(ASR_MODEL_DIR, device="cpu", compute_type="int8")

    rng = random.Random(args.seed)
    picked = rng.sample(sorted(manifest), min(args.sample, len(manifest)))
    print(f"\n随机抽查 {len(picked)} 条（seed={args.seed}）\n")
    print(f"{'原文':<44}{'识别结果':<44}{'判定':>6}")
    print("-" * 96)

    ok = 0
    rows = []
    for h in picked:
        text = manifest[h]
        segs, _ = model.transcribe(str(files[h]), language="en", beam_size=5)
        got = " ".join(s.text.strip() for s in segs).strip()
        a, b = normalize(text), normalize(got)
        # 短碎片容忍度高：词集合重合 ≥60% 视为「读对了」
        hit = b in a or a in b or len(set(a.split()) & set(b.split())) / max(len(a.split()), 1) >= 0.6
        ok += hit
        rows.append({"hash": h, "text": text, "asr": got, "ok": hit})
        print(f"{text[:42]:<44}{got[:42]:<44}{'✓' if hit else '✗':>6}")

    print(f"\n抽查通过 {ok}/{len(rows)} = {ok / len(rows) * 100:.0f}%")
    out = REPO / "var" / "audio-batch-quality.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"明细: {out}")
    # 抽查不过半 = 批量产物有问题，必须停手上报而不是继续上传
    return 0 if ok >= len(rows) * 0.6 else 1


if __name__ == "__main__":
    sys.exit(main())
