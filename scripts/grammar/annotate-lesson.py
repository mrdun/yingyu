"""跑通完整一课: 取一课的句子 → 分批调 DeepSeek 做语法标注 → 程序算结构串 → 跑完整规则集校验。

关键设计 (三条都不能改坏):
1. **不让模型数字符位置** —— 模型只给短语/词原文, 偏移由程序按空白走位算 (E4 不可能失败)
2. **不让模型写 structure** —— 模型只给闭集 pattern, structure 由程序按映射表算出来 (E13 构造性成立)
3. **words / phrases 双数组** —— 逐词词性 + 短语成分分开 (碎片才不会丢词性)

用法:
    python scripts/grammar/annotate-lesson.py [课序号=1] [输出路径]

依赖: 本机 5480 端的 RC 库 (earthworm-testdb-1)、apps/api/.env[.rc] 里的 DEEPSEEK_API_KEY。
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TMP = Path(os.environ.get("LOCALAPPDATA", "C:/Users/mrdun/AppData/Local")) / "Temp"
PROMPT = Path(__file__).resolve().parent / "system-prompt.txt"
BATCH = 10
MAXTOK = 8000

LESSON = int(sys.argv[1]) if len(sys.argv) > 1 else 1
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else TMP / f"ew-lesson{LESSON}-annotated.json"
LOGF = TMP / f"ew-lesson{LESSON}-run.log"

PSQL = ["docker", "exec", "earthworm-testdb-1", "psql", "-U", "test", "-d", "earthworm_rc",
        "-t", "-A", "-F", "\x1f", "-c"]

# ---- pattern 闭集与中文映射 (与 COURSE_CREATION_FORMAT.md §5.4/§5.5 必须一致) ----
SYM = {"S": "主语", "V": "谓语", "O": "宾语", "P": "表语", "IO": "间接宾语",
       "DO": "直接宾语", "OC": "宾语补足语", "C": "补语", "Attrib": "定语",
       "Adv": "状语", "conj": "连接词", "Clause": "从句", "There be": "There be"}
POS = {"名词","代词","动词","助动词","情态动词","形容词","副词","介词","连词","冠词","数词","动名词","不定式","分词","感叹词"}
ROLE = {"主语","谓语","宾语","表语","定语","状语","补语","宾语补足语","同位语","连接词","插入语","引导词"}
RT = {"名词短语","动词短语","形容词短语","副词短语","介词短语","动名词短语","不定式短语","分词短语","从句","单词"}
ST = {"陈述句","疑问句","祈使句","感叹句","there be 句型"}
CT = {"简单句","并列句","复合句"}


def log(*a):
    line = " ".join(str(x) for x in a)
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


def call(system, user, retries=3):
    import time
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
            with urllib.request.urlopen(req, timeout=240) as r:
                d = json.load(r)
            return d["choices"][0]["message"]["content"], d.get("usage", {}), d["choices"][0].get("finish_reason")
        except Exception as e:  # noqa: BLE001
            last = e
            log(f"      重试 {attempt+1}/{retries}: {type(e).__name__} {e}")
            time.sleep(3 * (attempt + 1))
    raise last


def parse_items(content):
    try:
        return json.loads(content).get("items", [])
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", content, re.S)
        try:
            return json.loads(m.group(0)).get("items", []) if m else []
        except json.JSONDecodeError:
            return []


def valid_pattern(pat):
    """pattern 是否只含闭集符号。"""
    if not pat:
        return []
    syms = [s.strip() for s in pat.split("+")]
    return [s for s in syms if s not in SYM]


def structure_of(pat):
    """pattern → structure (程序算, 不让模型写)。"""
    return " + ".join(SYM[s.strip()] for s in pat.split("+"))


def main():
    system = PROMPT.read_text(encoding="utf-8")

    rows = q(f"""select s."order", s.chinese, s.english from statements s
      where s.course_id = (select id from courses order by "order" asc limit 1 offset {LESSON - 1})
      order by s."order";""")
    items = [{"order": int(r[0]), "chinese": r[1], "english": r[2]} for r in rows]
    n_batch = (len(items) + BATCH - 1) // BATCH
    log(f"第 {LESSON} 课: {len(items)} 条, 分 {n_batch} 批 (每批 {BATCH})")

    done = {}
    if OUT.exists():
        try:
            for r in json.load(open(OUT, encoding="utf-8")):
                done[r["order"]] = r
            log(f"续跑: 已有 {len(done)} 条")
        except Exception:  # noqa: BLE001
            pass

    tin = tout = trunc = calls = 0
    todo = [i for i in items if i["order"] not in done]

    def ingest(got):
        for g in got:
            src = next((c for c in items if c["order"] == g.get("order")), None)
            if not src:
                continue
            # 程序补 structure (模型不该给)
            if g.get("isSentence") and g.get("pattern") and not valid_pattern(g["pattern"]):
                g["structure"] = structure_of(g["pattern"])
            g.pop("structure_guess", None)
            done[g["order"]] = {"order": g["order"], "chinese": src["chinese"],
                                "english": src["english"], "annotation": g}

    for bi in range(0, len(todo), BATCH):
        chunk = todo[bi:bi + BATCH]
        user = json.dumps([{"order": c["order"], "chinese": c["chinese"], "english": c["english"]}
                           for c in chunk], ensure_ascii=False, indent=1)
        content, usage, finish = call(system, user)
        calls += 1
        tin += usage.get("prompt_tokens", 0)
        tout += usage.get("completion_tokens", 0)
        if finish == "length":
            trunc += 1
        got = parse_items(content)
        ingest(got)
        log(f"  批 {bi//BATCH+1}/{n_batch}: 输入 {len(chunk)} → 返回 {len(got)} "
            f"(累计 {len(done)}/{len(items)})")
        json.dump(sorted(done.values(), key=lambda x: x["order"]),
                  open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---- 对 pattern 不合规的条做一次定向重试 (明确告知违规符号) ----
    bad = [r for r in done.values()
           if r["annotation"].get("isSentence") and valid_pattern(r["annotation"].get("pattern") or "")]
    if bad:
        log(f"\npattern 含自造符号 {len(bad)} 条 → 定向重试一次")
        for i in range(0, len(bad), BATCH):
            chunk = bad[i:i + BATCH]
            detail = [{"order": r["order"], "english": r["english"],
                       "your_pattern": r["annotation"].get("pattern")} for r in chunk]
            user = ("These patterns contain symbols NOT in the allowed set. "
                    "Rewrite ONLY the pattern for each item using the closed set "
                    "(S V O P IO DO OC C Attrib Adv conj Clause 'There be'), joined with ' + '.\n"
                    'Return {"items":[{"order":<int>,"pattern":"<fixed>"}]}\n'
                    + json.dumps(detail, ensure_ascii=False, indent=1))
            content, usage, finish = call(system, user)
            calls += 1
            tin += usage.get("prompt_tokens", 0)
            tout += usage.get("completion_tokens", 0)
            fixed = 0
            for g in parse_items(content):
                r = next((x for x in chunk if x["order"] == g.get("order")), None)
                if r and g.get("pattern") and not valid_pattern(g["pattern"]):
                    r["annotation"]["pattern"] = g["pattern"]
                    r["annotation"]["structure"] = structure_of(g["pattern"])
                    fixed += 1
            log(f"    重试批 {i//BATCH+1}: 修正 {fixed}/{len(chunk)}")
            json.dump(sorted(done.values(), key=lambda x: x["order"]),
                      open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    log(f"\n完成: {len(done)}/{len(items)} 条; 调用 {calls} 次; "
        f"输入 {tin} / 输出 {tout} tokens; 截断批次 {trunc}")

    # ---- 完整规则集校验 (E1-E13) ----
    # 校验时必须同时把偏移算好并**落盘** —— 偏移是规范要求的必填字段。
    # ⚠️ 踩过: 只在循环里 dump, 校验完不 dump -> 产物里没有 start/end,
    #    看着「校验通过」但文件其实不含偏移(预览是靠渲染时重算才显得正常)。
    def persist():
        json.dump(sorted(done.values(), key=lambda x: x["order"]),
                  open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

    err_counter, warn_counter = Counter(), Counter()
    err_ex = {}
    sent = frag = 0
    for r in sorted(done.values(), key=lambda x: x["order"]):
        eng, g = r["english"], r["annotation"]
        errs, warns = [], []
        words = g.get("words") or []
        phrases = g.get("phrases") or []

        # E7 words 必须恰等于切词
        if [w.get("text") for w in words] != eng.split(" "):
            errs.append("E7 words≠切词")
        # E8 phrases 拼接必须还原原句
        if " ".join(p.get("text", "") for p in phrases) != eng:
            errs.append("E8 phrases 拼接≠原文")
        # E4/E5 偏移 (程序算, 定位失败即原句有问题)
        for arr in (words, phrases):
            cur, good = 0, True
            for p in arr:
                t = p.get("text", "")
                i = eng.find(t, cur)
                if i < 0 or eng[cur:i].strip():
                    good = False
                    break
                p["start"], p["end"] = i, i + len(t)
                cur = i + len(t)
            if good and eng[cur:].strip():
                good = False
            if not good:
                errs.append("E4 无法定位")

        if g.get("isSentence"):
            sent += 1
            if not g.get("pattern"):
                errs.append("E10 缺 pattern")
            else:
                bad_syms = valid_pattern(g["pattern"])
                if bad_syms:
                    errs.append(f"E13 pattern 自造符号 {bad_syms}")
                elif g.get("structure") != structure_of(g["pattern"]):
                    errs.append("E13 structure≠映射")
            if g.get("clauseType") and g["clauseType"] not in CT:
                errs.append(f"E9 clauseType 非法 {g['clauseType']}")
            if not g.get("clauseType"):
                warns.append("W6 缺 clauseType")
            if len(phrases) == len(eng.split(" ")) and len(eng.split(" ")) > 1:
                warns.append("W1 疑似逐词标成分")
        else:
            frag += 1
            if any(p.get("role") for p in phrases):
                errs.append("E11 非完整句标了成分")

        if g.get("sentenceType") and g["sentenceType"] not in ST:
            errs.append(f"E9 sentenceType 非法 {g['sentenceType']}")
        for w in words:
            if w.get("pos") not in POS:
                errs.append(f"E9 pos 非法 {w.get('pos')}")
        for p in phrases:
            if p.get("role") and p["role"] not in ROLE:
                errs.append(f"E9 role 非法 {p['role']}")
            if p.get("roleType") and p["roleType"] not in RT:
                errs.append(f"E9 roleType 非法 {p['roleType']}")
        if not g.get("confidence"):
            warns.append("W3 缺 confidence")
        if g.get("confidence", 1) < 0.6:
            warns.append("W5 置信度低")

        for e in errs:
            err_counter[e.split()[0]] += 1
            err_ex.setdefault(e.split()[0], []).append((r["order"], eng, e))
        for w in warns:
            warn_counter[w.split()[0]] += 1

    n_err = sum(err_counter.values())
    log(f"\n{'=' * 66}")
    log(f"标注 {len(done)}/{len(items)} 条; 完整句 {sent} / 碎片 {frag}")
    log(f"完整规则集 (E1-E13): 不合格 {n_err} 条")
    for code, n in err_counter.most_common():
        log(f"  {code}: {n}")
        for o, e, msg in err_ex[code][:3]:
            log(f"      [{o}] {e[:60]}  {msg}")
    log(f"告警: {dict(warn_counter)}")
    ct = Counter(r['annotation'].get('clauseType') for r in done.values()
                 if r['annotation'].get('isSentence'))
    log(f"clauseType 分布: {dict(ct)}")
    pat = Counter(r['annotation'].get('pattern') for r in done.values()
                  if r['annotation'].get('isSentence'))
    log(f"pattern 取值种类: {len(pat)} (前 6: {list(pat.items())[:6]})")

    persist()
    n_off = sum(1 for r in done.values()
                for arr in (r['annotation'].get('words') or [], r['annotation'].get('phrases') or [])
                for p in arr if 'start' in p and 'end' in p)
    log(f"已落盘 (含 {n_off} 条偏移)")
    log(f"\n结果: {OUT}")


if __name__ == "__main__":
    main()
