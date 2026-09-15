"""跑通完整一课: 第一课 218 条全部做语法标注。
增量落盘 (防超时丢进度) + 失败重试 + 逐条跑规范校验。
"""
import json
import os
import re
import subprocess
import time
import urllib.request

ROOT = "C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm"
TMP = "C:/Users/mrdun/AppData/Local/Temp"
OUT = f"{TMP}/ew-lesson1-annotated.json"
LOGF = f"{TMP}/ew-lesson1-run.log"
PSQL = ["docker", "exec", "earthworm-testdb-1", "psql", "-U", "test", "-d", "earthworm_rc",
        "-t", "-A", "-F", "\x1f", "-c"]
BATCH = 10
MAXTOK = 8000


def log(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    with open(LOGF, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def api_key():
    for f in (f"{ROOT}/apps/api/.env.rc", f"{ROOT}/apps/api/.env"):
        try:
            for line in open(f, encoding="utf-8"):
                if line.startswith("DEEPSEEK_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
        except FileNotFoundError:
            pass
    raise SystemExit("no key")


def q(sql):
    out = subprocess.run(PSQL + [sql], capture_output=True, text=True, encoding="utf-8").stdout
    return [l.split("\x1f") for l in out.splitlines() if l.strip()]


def call(system, user, retries=3):
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
        except Exception as e:
            last = e
            log(f"      重试 {attempt+1}/{retries}: {type(e).__name__} {e}")
            time.sleep(3 * (attempt + 1))
    raise last


SYSTEM = open(f"{TMP}/ew-grammar-system-prompt.txt", encoding="utf-8").read()

rows = q("""select s."order", s.chinese, s.english from statements s
  where s.course_id = (select id from courses order by "order" asc limit 1) order by s."order";""")
items = [{"order": int(r[0]), "chinese": r[1], "english": r[2]} for r in rows]
log(f"第一课: {len(items)} 条, 分 {(len(items)+BATCH-1)//BATCH} 批 (每批 {BATCH})")

# 断点续传
done = {}
if os.path.exists(OUT):
    try:
        for r in json.load(open(OUT, encoding="utf-8")):
            done[r["order"]] = r
        log(f"续跑: 已有 {len(done)} 条结果")
    except Exception:
        pass

tin = tout = trunc = calls = 0
todo = [i for i in items if i["order"] not in done]

for bi in range(0, len(todo), BATCH):
    chunk = todo[bi:bi + BATCH]
    user = json.dumps([{"order": c["order"], "chinese": c["chinese"], "english": c["english"]}
                       for c in chunk], ensure_ascii=False, indent=1)
    content, usage, finish = call(SYSTEM, user)
    calls += 1
    tin += usage.get("prompt_tokens", 0)
    tout += usage.get("completion_tokens", 0)
    if finish == "length":
        trunc += 1
    try:
        got = json.loads(content).get("items", [])
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", content, re.S)
        try:
            got = json.loads(m.group(0)).get("items", []) if m else []
        except json.JSONDecodeError:
            got = []
    for g in got:
        src = next((c for c in items if c["order"] == g.get("order")), None)
        if src:
            done[g["order"]] = {"order": g["order"], "chinese": src["chinese"],
                                "english": src["english"], "annotation": g}
    log(f"  批 {bi//BATCH+1}/{(len(todo)+BATCH-1)//BATCH}: 输入 {len(chunk)} → 返回 {len(got)} "
        f"(累计 {len(done)}/{len(items)}, finish={finish})")
    json.dump(sorted(done.values(), key=lambda x: x["order"]),
              open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)

log(f"\n完成: {len(done)}/{len(items)} 条; 调用 {calls} 次; "
    f"输入 {tin} / 输出 {tout} tokens; 截断批次 {trunc}")

# ---- 全量校验 ----
POS = {"名词","代词","动词","助动词","情态动词","形容词","副词","介词","连词","冠词","数词","动名词","不定式","分词","感叹词"}
ROLE = {"主语","谓语","宾语","表语","定语","状语","补语","宾语补足语","同位语","连接词","插入语","引导词"}
RT = {"名词短语","动词短语","形容词短语","副词短语","介词短语","动名词短语","不定式短语","分词短语","从句","单词"}
ST = {"陈述句","疑问句","祈使句","感叹句","there be 句型"}

ok = err = warns = missing = 0
bad = []
sent = frag = 0
for o in sorted(done):
    r = done[o]
    eng = r["english"]
    g = r["annotation"]
    errs, wl = [], []
    words = g.get("words") or []
    phrases = g.get("phrases") or []
    if [w.get("text") for w in words] != eng.split(" "):
        errs.append("E7 words≠切词")
    if " ".join(p.get("text", "") for p in phrases) != eng:
        errs.append("E8 phrases 拼接≠原文")
    for arr in (words, phrases):
        cur, good = 0, True
        for p in arr:
            t = p.get("text", "")
            i = eng.find(t, cur)
            if i < 0 or eng[cur:i].strip():
                good = False; break
            p["start"], p["end"] = i, i + len(t)
            cur = i + len(t)
        if good and eng[cur:].strip():
            good = False
        if not good:
            errs.append("E4 无法定位短语")
    if g.get("isSentence"):
        sent += 1
        if not g.get("structure"):
            errs.append("E10 缺 structure")
        if len(phrases) == len(eng.split(" ")) and len(eng.split(" ")) > 1:
            wl.append("W1 疑似逐词标成分")
    else:
        frag += 1
        if any(p.get("role") for p in phrases):
            errs.append("E11 非完整句标了成分")
    for k, tbl in (("sentenceType", ST),):
        if g.get(k) and g[k] not in tbl:
            errs.append(f"E9 {k} 非法")
    for w in words:
        if w.get("pos") not in POS:
            errs.append(f"E9 pos 非法 {w.get('pos')}")
    for p in phrases:
        if p.get("role") and p["role"] not in ROLE:
            errs.append(f"E9 role 非法 {p['role']}")
        if p.get("roleType") and p["roleType"] not in RT:
            errs.append(f"E9 roleType 非法 {p['roleType']}")
    if not g.get("confidence"):
        wl.append("W3 缺 confidence")
    if errs:
        err += 1; bad.append((o, eng, errs))
    else:
        ok += 1
    warns += len(wl)

missing = len(items) - len(done)
log(f"\n{'='*66}")
log(f"标注完成 {len(done)}/{len(items)} 条 (未返回 {missing})")
log(f"合规 {ok} / 不合格 {err} / 告警 {warns}")
log(f"判定: 完整句 {sent} 条, 碎片/词 {frag} 条")
if bad:
    log("\n不合格明细:")
    for o, e, es in bad[:15]:
        log(f"  [{o}] {e}  -> {es}")
json.dump(sorted(done.values(), key=lambda x: x["order"]),
          open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
log(f"\n结果: {OUT}")
