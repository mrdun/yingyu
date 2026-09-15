"""给**全库**做语法标注：全局去重 + 有限并发 + 可续跑 + 按课落盘。

与 `annotate-lesson.py` 的区别（那个是单课探针、串行）：
1. **全局去重**：同一句英文在全库出现多次只标一次（实测可省 46% 调用）；
   已有单课产物会先灌进缓存，不重复付费。
2. **有限并发**（默认 6）：串行跑 54 课要几小时，并发后 ~20 分钟。
3. **按课落盘**：每课产出 `course-<order>-<courseId>.json`（项目格式），
   随后交给 **`ingest-lesson.py`** 写库 —— 那条路径已端到端验证过（含 jsonb/偏移校验），
   这里不另造一条写库逻辑。

三条铁律与单课脚本一致（改前先读那个文件的注释）：
  位置由程序算 / structure 由程序映射 / 每批 10 条。

用法:
    python scripts/grammar/annotate-all.py                # 标注全部（可反复执行，会续跑）
    python scripts/grammar/annotate-all.py --concurrency 8
    python scripts/grammar/annotate-all.py --only-unannotated   # 只补库里还没有标注的课

依赖: 本机 5480 端 RC 库、apps/api/.env[.rc] 里的 DEEPSEEK_API_KEY。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TMP = Path(os.environ.get("LOCALAPPDATA", "C:/Users/mrdun/AppData/Local")) / "Temp"
PROMPT = Path(__file__).resolve().parent / "system-prompt.txt"
OUTDIR = ROOT / ".hermes/design/grammar-lessons"
CACHE = TMP / "ew-annotation-cache.json"
LOGF = TMP / "ew-annotate-all.log"

BATCH = 10
MAXTOK = 8000
PSQL = ["docker", "exec", "earthworm-testdb-1", "psql", "-U", "test", "-d", "earthworm_rc",
        "-t", "-A", "-F", "\x1f", "-c"]

SYM = {"S": "主语", "V": "谓语", "O": "宾语", "P": "表语", "IO": "间接宾语",
       "DO": "直接宾语", "OC": "宾语补足语", "C": "补语", "Attrib": "定语",
       "Adv": "状语", "conj": "连接词", "Clause": "从句", "There be": "There be"}
POS = {"名词", "代词", "动词", "助动词", "情态动词", "形容词", "副词", "介词", "连词",
       "冠词", "数词", "动名词", "不定式", "分词", "感叹词"}
ROLE = {"主语", "谓语", "宾语", "表语", "定语", "状语", "补语", "宾语补足语",
        "同位语", "连接词", "插入语", "引导词"}
RT = {"名词短语", "动词短语", "形容词短语", "副词短语", "介词短语", "动名词短语",
      "不定式短语", "分词短语", "从句", "单词"}
ST = {"陈述句", "疑问句", "祈使句", "感叹句", "there be 句型"}
CT = {"简单句", "并列句", "复合句"}

_lock = threading.Lock()


def log(*a):
    line = " ".join(str(x) for x in a)
    with _lock:
        print(line, flush=True)
        with open(LOGF, "a", encoding="utf-8") as f:
            f.write(line + "\n")


def api_key():
    for f in (ROOT / "apps/api/.env.rc", ROOT / "apps/api/.env"):
        try:
            for line in open(f, encoding="utf-8"):
                if line.startswith("DEEPSEEK_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
        except FileNotFoundError:
            pass
    raise SystemExit("未找到 DEEPSEEK_API_KEY")


def q(sql):
    out = subprocess.run(PSQL + [sql], capture_output=True, text=True, encoding="utf-8").stdout
    return [l.split("\x1f") for l in out.splitlines() if l.strip()]


def call(system, user, retries=4):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                "https://api.deepseek.com/v1/chat/completions",
                data=json.dumps({"model": "deepseek-v4-flash",
                                 "messages": [{"role": "system", "content": system},
                                              {"role": "user", "content": user}],
                                 "temperature": 0.1, "max_tokens": MAXTOK,
                                 "response_format": {"type": "json_object"}}).encode(),
                headers={"Content-Type": "application/json",
                         "Authorization": f"Bearer {api_key()}"})
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.load(r)
            return (d["choices"][0]["message"]["content"], d.get("usage", {}),
                    d["choices"][0].get("finish_reason"))
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(3 * (attempt + 1))
    raise last


def parse_items(content):
    """容错解析：允许 {items:[...]} / {statements:[...]} / 裸数组 / 代码围栏包裹。"""
    def pick(o):
        if isinstance(o, list):
            return o
        if isinstance(o, dict):
            for k in ("items", "statements", "sentences", "data"):
                if isinstance(o.get(k), list):
                    return o[k]
        return []
    try:
        return pick(json.loads(content))
    except json.JSONDecodeError:
        m = re.search(r"[\[{].*[\]}]", content, re.S)
        if not m:
            return []
        try:
            return pick(json.loads(m.group(0)))
        except json.JSONDecodeError:
            return []


def bad_symbols(pat):
    if not pat:
        return []
    return [s for s in (x.strip() for x in pat.split("+")) if s not in SYM]


def structure_of(pat):
    return " + ".join(SYM[s.strip()] for s in pat.split("+"))


def compute_offsets(english, g):
    """程序按空白**递增游标**算 start/end（不用「首次出现位置」：重复词会算错）。"""
    for key in ("words", "phrases"):
        arr, cur = g.get(key) or [], 0
        for item in arr:
            t = item.get("text", "")
            i = english.find(t, cur)
            if i < 0 or english[cur:i].strip():
                item.pop("start", None)
                item.pop("end", None)
                continue          # ⚠️ 找不到也要继续走位，不能让 cur 停住
            item["start"], item["end"] = i, i + len(t)
            cur = i + len(t)
    return g


def validate(english, g):
    """与单课脚本同一套错项（E4/E5/E7/E8/E9/E10/E11/E13）。返回错误列表。"""
    errs = []
    words, phrases = g.get("words") or [], g.get("phrases") or []
    if [w.get("text") for w in words] != english.split(" "):
        errs.append("E7 words≠切词")
    if " ".join(p.get("text", "") for p in phrases) != english:
        errs.append("E8 phrases 拼接≠原文")
    for arr in (words, phrases):
        cur, good = 0, True
        for it in arr:
            t = it.get("text", "")
            i = english.find(t, cur)
            if i < 0 or english[cur:i].strip():
                good = False
                break
            cur = i + len(t)
        if good and english[cur:].strip():
            good = False
        if not good:
            errs.append("E4 无法定位")
    if g.get("isSentence"):
        if not g.get("pattern"):
            errs.append("E10 缺 pattern")
        else:
            bs = bad_symbols(g["pattern"])
            if bs:
                errs.append(f"E13 自造符号 {bs}")
            elif g.get("structure") != structure_of(g["pattern"]):
                errs.append("E13 structure≠映射")
        if g.get("clauseType") and g["clauseType"] not in CT:
            errs.append("E9 clauseType 非法")
    elif any(p.get("role") for p in phrases):
        errs.append("E11 碎片标了成分")
    if g.get("sentenceType") and g["sentenceType"] not in ST:
        errs.append("E9 sentenceType 非法")
    for w in words:
        if w.get("pos") not in POS:
            errs.append(f"E9 pos 非法 {w.get('pos')}")
    for p in phrases:
        if p.get("role") and p["role"] not in ROLE:
            errs.append("E9 role 非法")
        if p.get("roleType") and p["roleType"] not in RT:
            errs.append("E9 roleType 非法")
    return errs


def finalize(english, g):
    """程序补 structure + 偏移，再校验。返回 (annotation|None, 错误列表)。"""
    if g.get("isSentence") and g.get("pattern") and not bad_symbols(g["pattern"]):
        g["structure"] = structure_of(g["pattern"])
    g.pop("structure_guess", None)
    compute_offsets(english, g)
    errs = validate(english, g)
    return (g if not errs else None), errs


def seed_cache(cache):
    """把已有单课产物灌进缓存（不重复付费）。"""
    seeded = 0
    for p in [ROOT / ".hermes/design/grammar-lesson1-annotated.json"] + sorted(OUTDIR.glob("*.json")):
        if not p.exists():
            continue
        try:
            for r in json.load(open(p, encoding="utf-8")):
                eng, g = r["english"], r["annotation"]
                if eng in cache:
                    continue
                good, _ = finalize(eng, dict(g))
                if good:
                    cache[eng] = good
                    seeded += 1
        except Exception as e:  # noqa: BLE001
            log(f"  跳过 {p.name}: {e}")
    return seeded


def main():
    global BATCH, MAXTOK
    ap = argparse.ArgumentParser()
    ap.add_argument("--concurrency", type=int, default=6)
    ap.add_argument("--batch", type=int, default=BATCH,
                    help="每批句数。长句输出会顶到 max_tokens 被截断 → 整批丢失，"
                         "补尾时用 3~5 更稳（默认 10）")
    ap.add_argument("--maxtok", type=int, default=MAXTOK,
                    help="单次响应的 max_tokens（默认 8000）")
    ap.add_argument("--only-unannotated", action="store_true",
                    help="只处理库里 grammar 全为 NULL 的课（默认处理所有课）")
    args = ap.parse_args()
    BATCH, MAXTOK = args.batch, args.maxtok

    system = PROMPT.read_text(encoding="utf-8")
    OUTDIR.mkdir(parents=True, exist_ok=True)

    # ---- 1. 取全部课与句子 ----
    courses = q('select id, "order", title, '
                '(select count(*) from statements s where s.course_id = c.id) '
                'from courses c order by "order";')
    courses = [(c[0], int(c[1]), c[2], int(c[3])) for c in courses if len(c) >= 4]
    log(f"课数: {len(courses)}")

    if args.only_unannotated:
        done_ids = {r[0] for r in q(
            "select course_id from statements where grammar is not null group by course_id;")}
        courses = [c for c in courses if c[0] not in done_ids]
        log(f"只处理未标注的课: {len(courses)} 门")

    plain = q('select course_id, "order", chinese, english from statements '
              'order by course_id, "order";')
    by_course = {}
    for r in plain:
        if len(r) < 4:
            continue
        cid, order, chinese, english = r[0], r[1], r[2], r[3]
        by_course.setdefault(cid, []).append({"order": int(order), "chinese": chinese,
                                              "english": english})
    log(f"句子总数: {sum(len(v) for v in by_course.values())}（覆盖 {len(by_course)} 门课）")

    # 自检：课表里的课必须能在句子表里找到对应行，否则说明两次查询的键没对上（踩过：少选 course_id）
    known = {c[0] for c in courses}
    orphan = {k for k in by_course if k not in known}
    if orphan:
        raise SystemExit(f"✗ 有 {len(orphan)} 个 course_id 不在课表里 —— 两次查询的键没对上，先查 SQL")
    empty_courses = [c for c in courses if not by_course.get(c[0])]
    if empty_courses and len(empty_courses) < len(courses):
        log(f"  注意: {len(empty_courses)} 门课在库里没有任何句子，将跳过")

    # ---- 2. 缓存（按 english 全局去重）----
    cache = {}
    if CACHE.exists():
        try:
            cache = json.load(open(CACHE, encoding="utf-8"))
            log(f"缓存已有 {len(cache)} 条")
        except Exception:  # noqa: BLE001
            cache = {}
    seeded = seed_cache(cache)
    log(f"从已有产物灌入 {seeded} 条")

    uniq = []
    for cid in {c[0] for c in courses}:
        for st in by_course.get(cid, []):
            if st["english"] not in cache:
                uniq.append(st["english"])
    uniq = sorted(set(uniq))
    log(f"需要新标注的唯一句: {len(uniq)} → {(len(uniq) + BATCH - 1) // BATCH} 批, "
        f"并发 {args.concurrency}")

    # ---- 3. 并发标注 ----
    batches = [uniq[i:i + BATCH] for i in range(0, len(uniq), BATCH)]
    state = {"i": 0, "ok": 0, "fail": 0, "tin": 0, "tout": 0, "trunc": 0}
    bad_later = []

    def save_cache():
        with _lock:
            json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    def worker(wid):
        while True:
            with _lock:
                idx = state["i"]
                state["i"] += 1
            if idx >= len(batches):
                return
            chunk = batches[idx]
            user = json.dumps([{"order": i, "english": e} for i, e in enumerate(chunk)],
                              ensure_ascii=False, indent=1)
            try:
                content, usage, finish = call(system, user)
            except Exception as e:  # noqa: BLE001
                with _lock:
                    state["fail"] += len(chunk)
                log(f"  [w{wid}] 批 {idx + 1} 失败: {type(e).__name__}")
                continue
            with _lock:
                state["tin"] += usage.get("prompt_tokens", 0)
                state["tout"] += usage.get("completion_tokens", 0)
                if finish == "length":
                    state["trunc"] += 1
            got = parse_items(content)
            for g in got:
                o = g.get("order")
                if not isinstance(o, int) or not (0 <= o < len(chunk)):
                    continue
                eng = chunk[o]
                good, errs = finalize(eng, g)
                with _lock:
                    if good:
                        cache[eng] = good
                        state["ok"] += 1
                    else:
                        state["fail"] += 1
                        bad_later.append((eng, errs))
            save_cache()
            if (idx + 1) % 10 == 0 or idx + 1 == len(batches):
                log(f"  进度 {idx + 1}/{len(batches)} 批 · 成功 {state['ok']} "
                    f"· 失败 {state['fail']} · 缓存 {len(cache)}")

    if batches:
        threads = [threading.Thread(target=worker, args=(i,), daemon=True)
                   for i in range(min(args.concurrency, len(batches)))]
        [t.start() for t in threads]
        [t.join() for t in threads]

    save_cache()
    log(f"\n标注完成: 成功 {state['ok']} / 失败 {state['fail']}; "
        f"输入 {state['tin']} / 输出 {state['tout']} tokens; 截断 {state['trunc']} 批")

    # 把校验失败的原因落盘（供人工/下一轮定向修复；不落盘就只能看到「缺 N 条」）
    if bad_later:
        from collections import Counter as _C
        json.dump([{"english": e, "errors": errs} for e, errs in bad_later],
                  open(TMP / "ew-annotate-failures.json", "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        log(f"失败原因已写 {TMP / 'ew-annotate-failures.json'}: "
            f"{dict(_C(x for _e, errs in bad_later for x in errs).most_common(6))}")

    # ---- 4. 对自造符号做一次定向重试 ----
    badsyms = [(e, g) for e, g in cache.items()
               if g.get("isSentence") and bad_symbols(g.get("pattern") or "")]
    if badsyms:
        log(f"pattern 含自造符号 {len(badsyms)} 条 → 定向重试")
        for i in range(0, len(badsyms), BATCH):
            chunk = badsyms[i:i + BATCH]
            user = ("These patterns contain symbols NOT in the allowed set. Rewrite ONLY the "
                    "pattern using the closed set (S V O P IO DO OC C Attrib Adv conj Clause "
                    "'There be') joined with ' + '.\n"
                    'Return {"items":[{"order":<int>,"pattern":"<fixed>"}]}\n'
                    + json.dumps([{"order": k, "english": e,
                                   "your_pattern": g.get("pattern")}
                                  for k, (e, g) in enumerate(chunk)], ensure_ascii=False))
            try:
                content, _, _ = call(system, user)
            except Exception:  # noqa: BLE001
                continue
            for item in parse_items(content):
                k = item.get("order")
                p = item.get("pattern")
                if isinstance(k, int) and 0 <= k < len(chunk) and p and not bad_symbols(p):
                    eng, g = chunk[k]
                    g["pattern"] = p
                    g["structure"] = structure_of(p)
                    cache[eng] = g
        save_cache()
        log("  重试完成")

    # ---- 5. 按课落盘（项目格式）----
    written = []
    for cid, order, title, _n in courses:
        rows = by_course.get(cid, [])
        recs, missing = [], 0
        for st in rows:
            g = cache.get(st["english"])
            if not g:
                missing += 1
                continue
            recs.append({"order": st["order"], "chinese": st["chinese"],
                         "english": st["english"], "annotation": g})
        p = OUTDIR / f"course-{order:02d}-{cid}.json"
        json.dump(sorted(recs, key=lambda x: x["order"]),
                  open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        written.append((p, cid, len(recs), len(rows), missing))
        log(f"  第 {order:>2} 课 {title}: {len(recs)}/{len(rows)} 条"
            + (f"（缺 {missing}）" if missing else ""))

    json.dump({"courses": [{"file": str(p), "courseId": cid, "n": n, "total": t, "missing": m}
                           for p, cid, n, t, m in written]},
              open(TMP / "ew-annotate-all-manifest.json", "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    total_missing = sum(m for *_x, m in written)
    log(f"\n落盘 {len(written)} 门课; 未标注 {total_missing} 条")
    log(f"缓存: {CACHE} ({len(cache)} 条)")
    log(f"课程文件: {OUTDIR}")
    if total_missing:
        log("⚠️ 有未标注句子 —— 重跑本脚本会续跑补齐（缓存已保存）")
        sys.exit(2)


if __name__ == "__main__":
    main()
