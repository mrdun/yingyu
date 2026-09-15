"""为课程句子批量生成发音音频（Kokoro，本地 CPU，免 ffmpeg）。

为什么这么设计
--------------
1. **按句子文本去重**：全库 8,865 行句子里有 4,753 条是唯一的（重复率 46%），
   同一句英文的音频完全一样 → 只生成一份，省一半时间和体积。文件名 = 文本哈希。
2. **文件名用 FNV-1a 64 位哈希，前后端必须一致**：客户端要能自己算出地址（见
   `apps/client/utils/pronunciationAudio.ts`），所以哈希算法两端都实现一遍，
   并有跨语言一致性测试（`scripts/tts/tests/`）。选 FNV-1a 是因为它**同步、无依赖**
   —— Web Crypto 的 SHA-256 是异步的，而现有播放代码是同步取 URL。
3. **可续跑**：已存在的文件跳过；中断后重跑只补缺的。manifest 定期落盘。
4. **mp3 由 libsndfile 直接写**（本机 1.2.2 支持），不依赖 ffmpeg —— 服务器上少一个依赖。
5. **不写数据库**：音频是纯静态文件，按哈希寻址，不需要 schema 改动。

用法（必须用装了 kokoro-onnx 的 python 跑）::

    # 试跑 5 句看看效果
    python scripts/tts/generate-audio.py --limit 5 --speed 0.85

    # 全量（约 1 小时，可中断续跑）
    python scripts/tts/generate-audio.py --speed 0.85

    # 改语速需重跑（音频内容变了）；文件名不变，直接覆盖即可
    python scripts/tts/generate-audio.py --speed 0.9 --force

产物：
    var/audio/<hash>.mp3     音频（gitignored，上传到对象存储用）
    var/audio/manifest.json  哈希 → 原文（排查/上传核对用）
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO_ROOT / "var/audio"
PSQL = ["docker", "exec", "earthworm-testdb-1", "psql", "-U", "test", "-d", "earthworm_rc",
        "-t", "-A", "-c"]


def fnv1a64(text: str) -> str:
    """与客户端 `pronunciationAudio.ts` 逐位一致的哈希（UTF-8 字节上运算）。

    改这里必须同步改客户端，否则播放端算出的地址对不上 → 全部回退到有道。
    一致性由 `scripts/tts/tests/hash-parity.mjs` 守住。
    """
    h = 0xCBF29CE484222325
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def load_sentences() -> list[str]:
    """取全库唯一句子。优先 DATABASE_URL；否则走 RC 容器（本机开发用）。"""
    db_url = os.environ.get("DATABASE_URL")
    if db_url:
        try:
            import psycopg2  # type: ignore

            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
            cur.execute("SELECT english FROM statements GROUP BY english ORDER BY english;")
            rows = [r[0] for r in cur.fetchall()]
            cur.close()
            conn.close()
            return rows
        except Exception as e:  # noqa: BLE001
            print(f"⚠ DATABASE_URL 连接失败（{type(e).__name__}），改用本机 RC 容器")
    out = subprocess.run(PSQL + ["SELECT english FROM statements GROUP BY english "
                                 "ORDER BY english;"],
                         capture_output=True, text=True, encoding="utf-8").stdout
    return [l.strip() for l in out.splitlines() if l.strip()]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="音频输出目录")
    ap.add_argument("--model", default=str(Path("C:/Users/mrdun/github/kokoro-tts/models/"
                                               "kokoro-v1.0.onnx")))
    ap.add_argument("--voices", default=str(Path("C:/Users/mrdun/github/kokoro-tts/models/"
                                                "voices-v1.0.bin")))
    ap.add_argument("--voice", default="af_heart", help="音色（af_*=美音女声, bf_*=英音女声）")
    ap.add_argument("--speed", type=float, default=0.85,
                    help="语速；1.0 为原速。默认 0.85（学习场景略慢）")
    ap.add_argument("--lang", default="en-us")
    ap.add_argument("--limit", type=int, default=0, help="只处理前 N 句（试跑用）")
    ap.add_argument("--force", action="store_true", help="已存在的也重新生成（改语速时用）")
    ap.add_argument("--every", type=int, default=50, help="每 N 句打一次进度")
    args = ap.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"
    manifest: dict[str, str] = {}
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = {}

    texts = load_sentences()
    if args.limit:
        texts = texts[: args.limit]
    # 按哈希去重（不同文本理论上可能撞哈希；撞了就报警，绝不静默共用音频）
    seen: dict[str, str] = {}
    dups: list[tuple[str, str, str]] = []
    for t in texts:
        h = fnv1a64(t)
        if h in seen and seen[h] != t:
            dups.append((h, seen[h], t))
        seen[h] = t
    if dups:
        print(f"✗ 哈希冲突 {len(dups)} 处（不同句子算出同一哈希，必须换算法）:")
        for h, a, b in dups[:5]:
            print(f"   {h}: {a!r} vs {b!r}")
        return 2
    print(f"唯一句子: {len(texts)} 条（哈希冲突 0）→ 输出目录 {out_dir}")

    todo = [t for t in texts if args.force or not (out_dir / f"{fnv1a64(t)}.mp3").exists()]
    print(f"待生成: {len(todo)} 条 · 已存在: {len(texts) - len(todo)} 条 "
          f"· 语速 {args.speed} · 音色 {args.voice}")
    if not todo:
        print("没有需要生成的句子。")
        return 0

    from kokoro_onnx import Kokoro  # 延迟导入：--limit 0 且无需生成时不必加载

    import numpy as np
    import soundfile as sf

    t0 = time.time()
    k = Kokoro(args.model, args.voices)
    print(f"模型加载 {time.time() - t0:.1f}s")

    t0 = time.time()
    done = failed = 0
    total_audio = 0.0
    for i, text in enumerate(todo, 1):
        h = fnv1a64(text)
        try:
            samples, sr = k.create(text, voice=args.voice, speed=args.speed, lang=args.lang)
            sf.write(str(out_dir / f"{h}.mp3"), samples, sr, format="MP3")
            manifest[h] = text
            total_audio += len(samples) / sr
            done += 1
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ✗ [{i}] {text[:50]!r} → {type(e).__name__}: {str(e)[:90]}")
        if i % args.every == 0 or i == len(todo):
            el = time.time() - t0
            rate = i / el if el else 0
            eta = (len(todo) - i) / rate / 60 if rate else 0
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                                     encoding="utf-8")
            print(f"  [{i}/{len(todo)}] {rate:.2f} 句/秒 · 音频 {total_audio:.0f}s "
                  f"· 失败 {failed} · 预计剩余 {eta:.0f} 分钟", flush=True)

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                             encoding="utf-8")
    el = time.time() - t0
    size_mb = sum(f.stat().st_size for f in out_dir.glob("*.mp3")) / 1024 / 1024
    print(f"\n完成: {done} 条 / 失败 {failed} 条 · 耗时 {el / 60:.1f} 分钟 "
          f"· 音频总长 {total_audio / 60:.1f} 分钟 · 目录体积 {size_mb:.1f} MB")
    print(f"平均 {el / max(done, 1):.2f}s/句 · {size_mb * 1024 / max(done, 1):.1f} KB/句")
    print(f"产物: {out_dir}（上传服务器时整个目录一起传，manifest.json 用于核对）")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
