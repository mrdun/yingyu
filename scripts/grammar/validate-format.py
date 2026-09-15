"""按 COURSE_CREATION_FORMAT.md 校验语法标注 —— **唯一的校验器**（不要另写临时脚本）。

用法:
    python scripts/grammar/validate-format.py                    # 校验规范文档里的示例
    python scripts/grammar/validate-format.py <data.json>        # 校验一份标注产物

为什么强调「唯一」: 本轮踩过两次——规范改到 v1.2/v1.3（新增 E13、新增 conj/Clause 符号），
但跑课脚本/临时复核脚本用的还是旧规则集, 于是报出「0 不合格」或把合法值误报成自造符号。
**改规范后必须只改这一个文件, 并在产物上重跑。**
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT / "COURSE_CREATION_FORMAT.md"

# ---- 闭集（与规范 §5 必须逐字一致） ----
SYM = {"S": "主语", "V": "谓语", "O": "宾语", "P": "表语", "IO": "间接宾语",
       "DO": "直接宾语", "OC": "宾语补足语", "C": "补语", "Attrib": "定语",
       "Adv": "状语", "conj": "连接词", "Clause": "从句", "There be": "There be"}
POS = {"名词","代词","动词","助动词","情态动词","形容词","副词","介词","连词","冠词","数词","动名词","不定式","分词","感叹词"}
ROLE = {"主语","谓语","宾语","表语","定语","状语","补语","宾语补足语","同位语","连接词","插入语","引导词"}
RT = {"名词短语","动词短语","形容词短语","副词短语","介词短语","动名词短语","不定式短语","分词短语","从句","单词"}
ST = {"陈述句","疑问句","祈使句","感叹句","there be 句型"}
TENSE = {"一般现在时","一般过去时","一般将来时","现在进行时","过去进行时","将来进行时",
         "现在完成时","过去完成时","将来完成时","现在完成进行时","过去将来时"}
CT = {"简单句","并列句","复合句"}


def structure_of(pattern):
    return " + ".join(SYM[s.strip()] for s in pattern.split("+"))


def check_statement(eng, chinese, g, errors, warns, tag=""):
    """校验单条 grammar。核心是 E7/E8 (文本可还原) + E4/E6 (偏移) + E13 (结构映射)。"""
    words = g.get("words") or []
    phrases = g.get("phrases") or []

    if not chinese or not eng:
        errors.append(f"E3 {tag} chinese/english 为空")

    # E7: words 必须恰等于按空格切词（确定性校验）
    if [w.get("text") for w in words] != eng.split(" "):
        errors.append(f"E7 {tag} words≠切词\n       模型={[w.get('text') for w in words]}\n"
                      f"       期望={eng.split(' ')}")
    # E8: phrases 拼接必须还原原句
    if " ".join(p.get("text", "") for p in phrases) != eng:
        errors.append(f"E8 {tag} phrases 拼接≠原文\n       模型={' '.join(p.get('text','') for p in phrases)!r}")

    # E4/E5/E6: 偏移 + 重叠
    for arr, label in ((words, "words"), (phrases, "phrases")):
        cur, good = 0, True
        for p in arr:
            a, b, t = p.get("start"), p.get("end"), p.get("text", "")
            if a is None or b is None:
                # 偏移是规范要求的**必填**字段（前台靠它连线）。缺失必须报错。
                errors.append(f"E5 {tag}({label}) 缺 start/end: {t!r}")
            else:
                if a < 0 or b > len(eng) or a >= b:
                    errors.append(f"E5 {tag}({label}) 越界 [{a},{b})")
                if eng[a:b] != t:
                    errors.append(f"E4 {tag}({label}) {t!r} 取到 {eng[a:b]!r}")
            # ⚠️ 偏移缺失时**不能 continue** —— 必须继续走位, 否则 cur 不前进,
            #    下一个词会被判成「中间有实词未覆盖」, 导致整份文件全条误报 E4。
            i = eng.find(t, cur)
            if i < 0 or eng[cur:i].strip():
                good = False
            else:
                cur = i + len(t)
        if good and eng[cur:].strip():
            good = False
        if not good:
            errors.append(f"E4 {tag}({label}) 无法从原文顺序定位（有实词未被覆盖）")
        segs = sorted((p["start"], p["end"]) for p in arr if "start" in p and "end" in p)
        for i in range(1, len(segs)):
            if segs[i][0] < segs[i - 1][1]:
                errors.append(f"E6 {tag}({label}) 重叠 {segs[i-1]}/{segs[i]}")

    # E10/E11/E13（完整句）
    if g.get("isSentence"):
        if not g.get("pattern"):
            errors.append(f"E10 {tag} isSentence 但缺 pattern")
        else:
            bad = [s for s in g["pattern"].split("+") if s.strip() not in SYM]
            if bad:
                errors.append(f"E13 {tag} pattern 自造符号 {[b.strip() for b in bad]}")
            elif g.get("structure") != structure_of(g["pattern"]):
                errors.append(f"E13 {tag} structure≠映射\n       应为 {structure_of(g['pattern'])!r}\n"
                              f"       实为 {g.get('structure')!r}")
        if g.get("clauseType") and g["clauseType"] not in CT:
            errors.append(f"E9 {tag} clauseType 非法 {g['clauseType']}")
        if not g.get("clauseType"):
            warns.append(f"W6 {tag} 缺 clauseType")
        nw = len(eng.split(" "))
        if len(phrases) == nw and nw > 1:
            warns.append(f"W1 {tag} phrases 条数==词数({nw}) 疑似逐词标成分（短句会误报）")
    else:
        if any(p.get("role") for p in phrases):
            errors.append(f"E11 {tag} 非完整句却标了成分")

    # 枚举
    if g.get("sentenceType") and g["sentenceType"] not in ST:
        errors.append(f"E9 {tag} sentenceType 非法 {g['sentenceType']}")
    if g.get("tense") and g["tense"] not in TENSE:
        errors.append(f"E9 {tag} tense 非法 {g['tense']}")
    for w in words:
        if w.get("pos") not in POS:
            errors.append(f"E9 {tag} pos 非法 {w.get('pos')}")
    for p in phrases:
        if p.get("role") and p["role"] not in ROLE:
            errors.append(f"E9 {tag} role 非法 {p['role']}")
        if p.get("roleType") and p["roleType"] not in RT:
            errors.append(f"E9 {tag} roleType 非法 {p['roleType']}")

    # 告警
    kp = g.get("keyPoints", [])
    if len(kp) > 3 or any(len(k) > 40 for k in kp):
        warns.append(f"W2 {tag} keyPoints 超限")
    if not g.get("confidence"):
        warns.append(f"W3 {tag} 缺 confidence")
    if g.get("confidence", 1) < 0.6:
        warns.append(f"W5 {tag} 置信度过低 {g['confidence']}")


def validate_file(path):
    data = json.load(open(path, encoding="utf-8"))
    errors, warns = [], []
    n = sent = frag = 0
    for r in data:
        g = r.get("annotation") or {}
        if not g:
            continue
        n += 1
        if g.get("isSentence"):
            sent += 1
        else:
            frag += 1
        check_statement(r["english"], r.get("chinese", ""), g, errors, warns, tag=f"[{r.get('order')}]")
    print(f"文件: {path}")
    print(f"校验 {n} 条（完整句 {sent} / 碎片 {frag}）")
    print(f"Error {len(errors)}:")
    for e in errors[:20]:
        print("   ✗", e)
    print(f"Warning {len(warns)}:")
    for w in warns[:10]:
        print("   ⚠", w)
    ok = not errors
    print("\n结论:", "全部合规 ✓" if ok else f"有 {len(errors)} 条不合格 ✗")
    return 0 if ok else 1


def validate_doc():
    text = DOC.read_text(encoding="utf-8")
    blocks = re.findall(r"```json\n(.*?)```", text, re.S)
    errors, warns = [], []
    n = 0
    for block in blocks:
        try:
            doc = json.loads(block)
        except json.JSONDecodeError:
            continue
        if doc.get("formatVersion") != 1:
            continue
        for course in doc["courses"]:
            orders = [s["order"] for s in course["statements"]]
            if len(orders) != len(set(orders)):
                errors.append("E12 order 重复")
            for st in course["statements"]:
                g = st.get("grammar")
                if not g:
                    continue
                n += 1
                check_statement(st["english"], st.get("chinese", ""), g, errors, warns, tag=st["english"][:28])
    print(f"规范文档示例: 校验 {n} 条")
    print(f"Error {len(errors)}:")
    for e in errors:
        print("   ✗", e)
    print(f"Warning {len(warns)}:")
    for w in warns:
        print("   ⚠", w)
    ok = not errors and not warns
    print("\n结论:", "示例完全合规 ✓" if ok else "示例有问题 ✗")
    return 0 if ok else 1


if __name__ == "__main__":
    if len(sys.argv) > 1:
        sys.exit(validate_file(sys.argv[1]))
    sys.exit(validate_doc())
