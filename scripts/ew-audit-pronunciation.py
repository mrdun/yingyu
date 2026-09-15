"""审计语音发音覆盖率：库里哪些句子点「播放发音」是没声音的。

为什么需要这个脚本（背景）：
    练习页的发音取 `https://dict.youdao.com/dictvoice?type=2&audio=<原文>`。
    该接口是**词典发音**（返回词典里现成的读音），**不是 TTS**：
    文本不在词典里时返回 HTTP 500 `{"msg":"returned null audio"}`，
    浏览器再以 `net::ERR_BLOCKED_BY_ORB` 拦掉（JSON 内容塞进 <audio>），
    最终表现是「有的句子有读音、有的完全没声音」，且页面上没有任何错误提示。
    → 所以「有没有声音」只取决于该文本是否被有道词典收录，与网络/代码配置无关。
    实测规律：1 词 100% / 2 词 68% / 3 词 45% / 4-5 词 20% / 6-8 词 5% / 9+ 词 2%。

用法:
    python scripts/ew-audit-pronunciation.py --buckets        # 按词数分层的命中率
    python scripts/ew-audit-pronunciation.py --sample 200     # 全库随机抽样
    python scripts/ew-audit-pronunciation.py --courses 1,2,3  # 指定课的逐句精确结果
    python scripts/ew-audit-pronunciation.py --all            # 全库逐句（约 25 分钟）

依赖本机 RC 库容器 earthworm-testdb-1；只读查询 + 公开接口，不写入任何数据。
"""
import argparse
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict

PSQL = ["docker", "exec", "earthworm-testdb-1", "psql", "-U", "test", "-d", "earthworm_rc",
        "-t", "-A", "-F", "\x1f", "-c"]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/131.0.0.0 Safari/537.36")

BUCKETS = {
    "1 词": "english !~ ' '",
    "2 词": "array_length(string_to_array(english,' '),1) = 2",
    "3 词": "array_length(string_to_array(english,' '),1) = 3",
    "4-5 词": "array_length(string_to_array(english,' '),1) BETWEEN 4 AND 5",
    "6-8 词": "array_length(string_to_array(english,' '),1) BETWEEN 6 AND 8",
    "9+ 词": "array_length(string_to_array(english,' '),1) >= 9",
}


def pull(sql):
    out = subprocess.run(PSQL + [sql], capture_output=True, text=True, encoding="utf-8").stdout
    return [l.split("\x1f") for l in out.splitlines() if l.strip()]


def has_audio(text):
    """与前端同一条 URL（type=2 美音）；200 且有内容 = 有声音。"""
    url = "https://dict.youdao.com/dictvoice?type=2&audio=" + urllib.parse.quote(text)
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                              "Referer": "https://dict.youdao.com/"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            return r.status == 200 and bool(r.read(8))
    except Exception:  # noqa: BLE001   —— 500/超时都算「没声音」
        return False


def cached_probe(cache, text, pause=0.1):
    if text not in cache:
        cache[text] = has_audio(text)
        time.sleep(pause)
    return cache[text]


def run_buckets(cache):
    print(f"{'词数分层':<10}{'有声音':>8}{'抽样':>6}{'命中率':>9}")
    print("-" * 36)
    for name, cond in BUCKETS.items():
        rows = [r[0] for r in pull(
            f"SELECT english FROM statements WHERE {cond} "
            f"GROUP BY english ORDER BY md5(english) LIMIT 40;")]
        hit = sum(1 for t in rows if cached_probe(cache, t))
        print(f"{name:<10}{hit:>8}{len(rows):>6}{hit / max(len(rows), 1) * 100:>8.0f}%")


def run_sample(cache, n):
    rows = [r[0] for r in pull(
        f"SELECT english FROM statements GROUP BY english "
        f"ORDER BY md5(english || 'salt') LIMIT {int(n)};")]
    print(f"\n=== 全库随机抽样 {len(rows)} 条（去重后）===")
    hit = sum(1 for t in rows if cached_probe(cache, t))
    print(f"  有声音 {hit}/{len(rows)} = {hit / len(rows) * 100:.1f}%")
    print(f"  没声音 {len(rows) - hit}/{len(rows)} = {(len(rows) - hit) / len(rows) * 100:.1f}%")


def run_courses(cache, orders):
    targets = pull("SELECT c.\"order\", s.english FROM statements s "
                   "JOIN courses c ON c.id = s.course_id WHERE c.\"order\" IN "
                   f"({','.join(str(int(o)) for o in orders)}) ORDER BY c.\"order\", s.\"order\";")
    by_course = defaultdict(list)
    for order, english in targets:
        by_course[int(order)].append(english)

    print(f"\n{'课':<8}{'有声音':>8}{'没声音':>8}{'总计':>8}{'有声音占比':>12}")
    print("-" * 44)
    for order in sorted(by_course):
        rows = by_course[order]
        hit = sum(1 for t in rows if cached_probe(cache, t))
        print(f"第 {order} 课{hit:>8}{len(rows) - hit:>8}{len(rows):>8}"
              f"{hit / len(rows) * 100:>11.0f}%")
    for order in sorted(by_course):
        dead = [t for t in dict.fromkeys(by_course[order]) if not cache.get(t)]
        print(f"\n第 {order} 课没声音的样例（前 8 条）：")
        for t in dead[:8]:
            print(f"   ✗ {t}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--buckets", action="store_true", help="按词数分层的命中率")
    ap.add_argument("--sample", type=int, metavar="N", help="全库随机抽 N 条")
    ap.add_argument("--courses", metavar="1,2,3", help="指定课序，逐句精确统计")
    ap.add_argument("--all", action="store_true", help="全库每课逐句统计（慢，约 25 分钟）")
    args = ap.parse_args()

    if not any([args.buckets, args.sample, args.courses, args.all]):
        args.buckets = True
        args.sample = 200

    cache = {}
    if args.all:
        orders = [r[0] for r in pull('SELECT "order" FROM courses ORDER BY "order";')]
        run_courses(cache, orders)
        return
    if args.buckets:
        run_buckets(cache)
    if args.sample:
        run_sample(cache, args.sample)
    if args.courses:
        run_courses(cache, args.courses.split(","))


if __name__ == "__main__":
    sys.exit(main())
