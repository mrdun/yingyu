"""校验修订后规范里的示例 (双数组结构): words[] 逐词词性 + phrases[] 短语成分。
跑 E1-E12 + W1-W5 —— 文档里的示例必须自己完全合规。
"""
import json
import re
from pathlib import Path

DOC = Path("C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm/COURSE_CREATION_FORMAT.md")
text = DOC.read_text(encoding="utf-8")
blocks = re.findall(r"```json\n(.*?)```", text, re.S)
print(f"文档里 json 示例块: {len(blocks)}")

POS = {"名词","代词","动词","助动词","情态动词","形容词","副词","介词","连词","冠词","数词","动名词","不定式","分词","感叹词"}
ROLE = {"主语","谓语","宾语","表语","定语","状语","补语","宾语补足语","同位语","连接词","插入语","引导词"}
RT = {"名词短语","动词短语","形容词短语","副词短语","介词短语","动名词短语","不定式短语","分词短语","从句","单词"}
ST = {"陈述句","疑问句","祈使句","感叹句","there be 句型"}
TENSE = {"一般现在时","一般过去时","一般将来时","现在进行时","过去进行时","将来进行时",
         "现在完成时","过去完成时","将来完成时","现在完成进行时","过去将来时"}

errors, warns, n = [], [], 0

for bi, block in enumerate(blocks):
    try:
        doc = json.loads(block)
    except json.JSONDecodeError as e:
        print(f"  示例[{bi}] JSON 非法: {e}"); continue
    if doc.get("formatVersion") != 1:
        print(f"  示例[{bi}] 无 formatVersion=1 → 结构示意, 跳过"); continue

    for course in doc["courses"]:
        orders = [s["order"] for s in course["statements"]]
        if len(orders) != len(set(orders)):
            errors.append(f"E12 {course['title']}: order 重复")
        for st in course["statements"]:
            eng = st["english"]
            g = st.get("grammar")
            if not g:
                continue
            n += 1
            print(f"\n  校验 «{eng}»  (isSentence={g['isSentence']})")

            # E3
            if not st.get("chinese") or not eng:
                errors.append(f"E3 {eng}: chinese/english 为空")
            # E10 / E11
            if g["isSentence"] and not g.get("pattern"):
                errors.append(f"E10 {eng}: isSentence 但缺 pattern")
            if not g["isSentence"] and any(p.get("role") for p in g.get("phrases", [])):
                errors.append(f"E11 {eng}: 非完整句却标了成分")
            # E13: structure 必须由 pattern 按 §5.5 映射而来
            SYM = {"S": "主语", "V": "谓语", "O": "宾语", "P": "表语", "IO": "间接宾语",
                   "DO": "直接宾语", "OC": "宾语补足语", "C": "补语", "Attrib": "定语",
                   "Adv": "状语", "There be": "There be"}
            if g.get("pattern"):
                syms = [s.strip() for s in g["pattern"].split("+")]
                bad = [s for s in syms if s not in SYM]
                if bad:
                    errors.append(f"E13 {eng}: pattern 含自造符号 {bad}")
                else:
                    expect = " + ".join(SYM[s] for s in syms)
                    if g.get("structure") != expect:
                        errors.append(f"E13 {eng}: structure 与 pattern 不匹配\n"
                                      f"       structure={g.get('structure')!r}\n"
                                      f"       应为      ={expect!r}")
                    else:
                        print(f"      E13 structure = pattern 映射 ✓ ({g['structure']})")
            # 枚举
            for k, table in (("sentenceType", ST), ("tense", TENSE)):
                if g.get(k) and g[k] not in table:
                    errors.append(f"E9 {eng}: {k} 非法 {g[k]}")

            # ---- E7: words 必须恰好等于按空格切词 (确定性) ----
            words = g.get("words", [])
            got_words = [w.get("text") for w in words]
            expect_words = eng.split(" ")
            if got_words != expect_words:
                errors.append(f"E7 {eng}: words 与切词不一致\n       模型={got_words}\n       期望={expect_words}")
            else:
                print(f"      E7 words 逐词校验 ✓ ({len(words)} 词)")

            # ---- E8: phrases 拼接必须还原原句 ----
            phrases = g.get("phrases", [])
            joined = " ".join(p.get("text", "") for p in phrases)
            if joined != eng:
                errors.append(f"E8 {eng}: phrases 拼接不一致\n       模型={joined!r}\n       期望={eng!r}")
            else:
                print(f"      E8 phrases 拼接校验 ✓ ({len(phrases)} 段)")

            # ---- E4/E5/E6: 字符位置 ----
            for arr, label in ((words, "words"), (phrases, "phrases")):
                for p in arr:
                    a, b = p.get("start"), p.get("end")
                    actual = eng[a:b]
                    ok = actual == p.get("text")
                    print(f"         {label:8} [{a:>2},{b:>2}) {p.get('text')!r:<22} "
                          f"取到 {actual!r:<22} {'✓' if ok else '✗'}"
                          + (f" pos={p.get('pos')}" if "pos" in p else
                             f" role={p.get('role')}/{p.get('roleType')}" if p.get("role") else ""))
                    if not ok:
                        errors.append(f"E4 {eng}({label}): {p.get('text')!r} 取到 {actual!r}")
                    if a is None or b is None or a < 0 or b > len(eng) or a >= b:
                        errors.append(f"E5 {eng}({label}): 越界 [{a},{b})")
                # E6 重叠
                segs = sorted((p["start"], p["end"]) for p in arr if "start" in p)
                for i in range(1, len(segs)):
                    if segs[i][0] < segs[i - 1][1]:
                        errors.append(f"E6 {eng}({label}): 重叠 {segs[i-1]}/{segs[i]}")

            # 枚举 (words/phrases)
            for w in words:
                if w.get("pos") not in POS:
                    errors.append(f"E9 {eng}: pos 非法 {w.get('pos')}")
            for p in phrases:
                if p.get("role") and p["role"] not in ROLE:
                    errors.append(f"E9 {eng}: role 非法 {p['role']}")
                if p.get("roleType") and p["roleType"] not in RT:
                    errors.append(f"E9 {eng}: roleType 非法 {p['roleType']}")

            # W1 逐词标成分
            nw = len(eng.split(" "))
            if g["isSentence"] and len(phrases) == nw and nw > 1:
                warns.append(f"W1 {eng}: phrases 条数==词数({nw}) 疑似逐词标成分")
            # W2 keyPoints
            kp = g.get("keyPoints", [])
            if len(kp) > 3 or any(len(k) > 40 for k in kp):
                warns.append(f"W2 {eng}: keyPoints 超限")
            # W3
            if "confidence" not in g:
                warns.append(f"W3 {eng}: 缺 confidence")
            # W5
            if g.get("confidence", 1) < 0.6:
                warns.append(f"W5 {eng}: 置信度过低 {g['confidence']}")

print(f"\n{'='*66}")
print(f"校验示例 {n} 条")
print(f"Error {len(errors)}:")
for e in errors: print("   ✗", e)
print(f"Warning {len(warns)}:")
for w in warns: print("   ⚠", w)
print("\n结论:", "示例完全合规 ✓" if not errors and not warns else "示例不合规，需修文档 ✗")
