/**
 * 句子语法标注 —— scripts/grammar/{system-prompt.txt,validate-format.py} 的 TS 复刻。
 *
 * 口径的唯一真相在仓库里那两个脚本 + COURSE_CREATION_FORMAT.md, 本模块只做搬运,
 * 不另立规则 (改口径请先改脚本与规范, 再回来同步这里)。
 *
 * 三条铁律 (来源: scripts/grammar/annotate-lesson.py 的实测教训, 改坏任何一条都会炸):
 * 1. **绝不让模型数字符位置** —— 模型只输出 words[].text / phrases[].text,
 *    start/end 由 computeOffsets() 按空白顺序走位算出, 保证 english.slice(start,end) === text。
 * 2. **绝不让模型写 structure** —— 模型只给闭集 pattern, structure 由 structureFromPattern()
 *    按映射表算 (实测交给模型写时 100/100 条与 pattern 对不上)。
 * 3. **一次最多给模型 10 条** —— 见 ai-content.service.ts 的 ANNOTATE_BATCH_SIZE:
 *    给 20+ 条会超 max_tokens 导致 JSON 截断。
 */

export interface GrammarAnnotation {
  isSentence: boolean;
  unitType?: string;
  pattern?: string;
  clauseType?: string;
  sentenceType?: string;
  tense?: string;
  keyPoints?: string[];
  confidence?: number;
  words: { text: string; pos: string; start?: number; end?: number }[];
  phrases: {
    text: string;
    role: string | null;
    roleType: string | null;
    start?: number;
    end?: number;
  }[];
  structure?: string;
}

/** pattern 闭集符号 → 中文 (COURSE_CREATION_FORMAT.md §5.5, 与 validate-format.py 的 SYM 逐字一致)。 */
export const GRAMMAR_PATTERN_SYMBOLS: Record<string, string> = {
  S: "主语",
  V: "谓语",
  O: "宾语",
  P: "表语",
  IO: "间接宾语",
  DO: "直接宾语",
  OC: "宾语补足语",
  C: "补语",
  Attrib: "定语",
  Adv: "状语",
  conj: "连接词",
  Clause: "从句",
  "There be": "There be",
};

const PATTERN_SYMBOL_SET = new Set(Object.keys(GRAMMAR_PATTERN_SYMBOLS));

// ---- 闭集枚举 (与提示词 §8 / validate-format.py 的常量逐字一致) ----
const POS_SET = new Set([
  "名词",
  "代词",
  "动词",
  "助动词",
  "情态动词",
  "形容词",
  "副词",
  "介词",
  "连词",
  "冠词",
  "数词",
  "动名词",
  "不定式",
  "分词",
  "感叹词",
]);
const ROLE_SET = new Set([
  "主语",
  "谓语",
  "宾语",
  "表语",
  "定语",
  "状语",
  "补语",
  "宾语补足语",
  "同位语",
  "连接词",
  "插入语",
  "引导词",
]);
const ROLE_TYPE_SET = new Set([
  "名词短语",
  "动词短语",
  "形容词短语",
  "副词短语",
  "介词短语",
  "动名词短语",
  "不定式短语",
  "分词短语",
  "从句",
  "单词",
]);
const SENTENCE_TYPE_SET = new Set(["陈述句", "疑问句", "祈使句", "感叹句", "there be 句型"]);
/** 注意: validate-format.py 的 TENSE 比提示词多 4 个值, 这里照脚本取并集。 */
const TENSE_SET = new Set([
  "一般现在时",
  "一般过去时",
  "一般将来时",
  "现在进行时",
  "过去进行时",
  "将来进行时",
  "现在完成时",
  "过去完成时",
  "将来完成时",
  "现在完成进行时",
  "过去将来时",
]);
const CLAUSE_TYPE_SET = new Set(["简单句", "并列句", "复合句"]);

/**
 * 系统提示词 = scripts/grammar/system-prompt.txt 的逐字副本 (不要改写、不要精简)。
 * 该文件是标注口径的唯一真相, 改动必须先改文件再同步这里。
 */
export const GRAMMAR_SYSTEM_PROMPT = `You annotate English learning items for a Chinese-language product.
The corpus is built by 连词成句 (chunk-building): many items are FRAGMENTS like "to see" or "I want", not full sentences.

Return a JSON object {"items": [...]} — one entry per input item, SAME ORDER as given. Keep each entry compact.

Per item:
{"order":<int>,
 "isSentence":<bool>,
 "unitType":"sentence"|"phrase"|"word",
 "pattern":"<closed-set symbols, see RULE 2>",
 "clauseType":"简单句"|"并列句"|"复合句",
 "sentenceType":"<陈述句|疑问句|祈使句|感叹句|there be 句型>",
 "tense":"<一般现在时|一般过去时|一般将来时|现在进行时|过去进行时|现在完成时|过去完成时>",
 "keyPoints":["<=40 chars, at most 2"],
 "confidence":<0.0-1.0>,
 "words":[{"text":"<one word>","pos":"<词性>"}],
 "phrases":[{"text":"<one or more words>","role":"<成分>"|null,"roleType":"<短语类型>"|null}]}

HARD RULES:
1. "isSentence": true only if the item is a COMPLETE standalone sentence (subject + predicate, meaningful on its own).
   Fragments, single words, and phrases like "to see" / "I like" / "the food" are FALSE.
2. "pattern" — ONLY when isSentence=true. Build it by joining symbols from this CLOSED SET with " + ":
   S (主语) | V (谓语) | O (宾语) | P (表语) | IO (间接宾语) | DO (直接宾语) |
   OC (宾语补足语) | C (补语) | Attrib (定语) | Adv (状语) | conj (连接词) | Clause (从句) | There be
   Examples: "S + V + O" / "S + V + O + Adv" / "S + V + P" / "S + V + IO + DO" /
             "S + V + O + conj + S + V + O" (并列句) / "S + V + Clause" (复合句) / "There be + S + Adv"
   NEVER invent symbols. These are WRONG (they appear in bad data — do not copy them):
     "S + V + O + 时间状语"  → write "S + V + O + Adv"
     "It + is + adj + to do sth" → write "S + V + P + Adv" (It is the formal subject)
     "S + V + Predicative" → write "S + V + P"
     "S + have to + V + O" → write "S + V + O"
   Put the fine detail (时间/地点/原因状语, clause content) in phrases[].note instead.
   ⚠️ Do NOT output a "structure" field — the display string is derived from \`pattern\` by code.
3. "clauseType": 简单句 (one clause) / 并列句 (clauses joined by and/but/so/or) / 复合句 (contains a 从句).
   Omit when isSentence=false.
4. words: EXACTLY one entry per word, same order as the sentence.
   Words joined with single spaces MUST equal the sentence exactly (case-sensitive).
   KEEP the punctuation the input already has, attached to the word it belongs to:
   for "I like the food." the last word is "food." (NOT "food") — and NEVER add or drop punctuation.
5. phrases: the texts, joined with single spaces IN ORDER, MUST also equal the sentence exactly.
   i.e. phrases partition the SAME word sequence — you may merge adjacent words, but never skip,
   reorder, split, or duplicate a word, and never drop punctuation that exists in the input.
   Do NOT invent punctuation that is not in the original.
6. 成分(role) is PHRASE-level, not per word: "don't like" together = 谓语(动词短语);
   "learning English" together = 宾语(动名词短语); "to do it" together = 宾语(不定式短语).
   NEVER give the same role to each word separately.
7. If isSentence=false → every phrase's role and roleType MUST be null
   (fragments have no sentence roles), but words[] must still carry full per-word pos.
8. Enums —
   pos: 名词|代词|动词|助动词|情态动词|形容词|副词|介词|连词|冠词|数词|动名词|不定式|分词|感叹词
   role: 主语|谓语|宾语|表语|定语|状语|补语|宾语补足语|同位语|连接词|插入语|引导词
   roleType: 名词短语|动词短语|形容词短语|副词短语|介词短语|动名词短语|不定式短语|分词短语|从句|单词
9. If unsure, LOWER "confidence" — never invent. Omitting detail beats inventing it.
10. Output PURE JSON only.
`;

/**
 * pattern → structure (中文显示串)。未知符号返回空串, 由 validateGrammar 报错, 不抛异常。
 */
export function structureFromPattern(pattern: string): string {
  if (!pattern) return "";
  const symbols = pattern.split("+").map((symbol) => symbol.trim());
  if (symbols.some((symbol) => !PATTERN_SYMBOL_SET.has(symbol))) return "";
  return symbols.map((symbol) => GRAMMAR_PATTERN_SYMBOLS[symbol]).join(" + ");
}

/**
 * 按空白顺序走位算 start/end —— **位置永远由程序算, 不用模型给的** (铁律 1)。
 *
 * 游标从 0 起, 每条从 cursor 往后找自己的 text: 找到就写 start/end 并把 cursor 推到 end;
 * 找不到就跳过这一条的偏移 (不中断循环 —— 中断会让 cursor 不前进, 后面所有条目都被
 * 判成「中间有实词没覆盖」, 实测踩过 436 条假错)。不用「首次出现位置」是因为句子里的
 * 重复词 (I / it / to) 会被算错, 渲染时重复输出已标过的词 (实测 14 词的句子渲染出 21 个词)。
 */
export function computeOffsets(english: string, grammar: GrammarAnnotation): GrammarAnnotation {
  let cursor = 0;
  const words = (grammar.words ?? []).map((word) => {
    const found = locateFrom(english, word.text, cursor);
    cursor = found.cursor;
    return found.span
      ? { text: word.text, pos: word.pos, start: found.span.start, end: found.span.end }
      : { text: word.text, pos: word.pos };
  });

  cursor = 0;
  const phrases = (grammar.phrases ?? []).map((phrase) => {
    const found = locateFrom(english, phrase.text, cursor);
    cursor = found.cursor;
    return found.span
      ? {
          text: phrase.text,
          role: phrase.role ?? null,
          roleType: phrase.roleType ?? null,
          start: found.span.start,
          end: found.span.end,
        }
      : { text: phrase.text, role: phrase.role ?? null, roleType: phrase.roleType ?? null };
  });

  return { ...grammar, words, phrases };
}

/**
 * 复刻 validate-format.py 的**错项** (E4/E5/E6, E7/E8, E9, E10/E11, E13)。
 * 返回中文错误描述, 空数组 = 合规。告警 (W1–W6) 不属于错项, 因此不在这里返回 ——
 * 调用方按「有错就丢这条标注」处理, 不能让告警把合规标注也丢掉。
 *
 * 未覆盖: E3 (chinese 为空, 本模块只有 english), E12 (order 重复, 属于文件级检查),
 * 以及 unitType 的枚举校验 (脚本本身也不校验 unitType)。
 */
export function validateGrammar(english: string, grammar: GrammarAnnotation): string[] {
  const errors: string[] = [];
  const words = grammar.words ?? [];
  const phrases = grammar.phrases ?? [];

  // E7: words 必须恰好是 english 的逐词切分 (确定性校验)
  const joinedWords = words.map((word) => word.text).join(" ");
  if (joinedWords !== english) {
    errors.push(`words 拼接不等于 english: 模型="${joinedWords}" 期望="${english}"`);
  }

  // E8: phrases 顺序拼接必须还原原句 (不多不少、不重排、不重复)
  const joinedPhrases = phrases.map((phrase) => phrase.text).join(" ");
  if (joinedPhrases !== english) {
    errors.push(`phrases 拼接不等于 english: 模型="${joinedPhrases}" 期望="${english}"`);
  }

  // E4/E5/E6: 偏移正确性 + 顺序覆盖 + 不重叠
  errors.push(...checkOffsets("words", english, words));
  errors.push(...checkOffsets("phrases", english, phrases));

  // E10/E13: 完整句必须有闭集 pattern, 且 structure 必须等于它的映射
  if (grammar.isSentence) {
    if (!grammar.pattern) {
      errors.push("E10 isSentence=true 但缺 pattern");
    } else {
      const unknownSymbols = grammar.pattern
        .split("+")
        .map((symbol) => symbol.trim())
        .filter((symbol) => !PATTERN_SYMBOL_SET.has(symbol));
      if (unknownSymbols.length > 0) {
        errors.push(`E13 pattern 含闭集外符号: ${unknownSymbols.join(" / ")}`);
      } else {
        const expected = structureFromPattern(grammar.pattern);
        if (grammar.structure !== expected) {
          errors.push(`E13 structure≠pattern 映射: 应为 "${expected}" 实为 "${grammar.structure}"`);
        }
      }
    }
    if (grammar.clauseType && !CLAUSE_TYPE_SET.has(grammar.clauseType)) {
      errors.push(`E9 clauseType 非法: "${grammar.clauseType}"`);
    }
  } else if (phrases.some((phrase) => phrase.role || phrase.roleType)) {
    // E11: 碎片 (非完整句) 不许标句子成分
    errors.push("E11 非完整句 (isSentence=false) 却标了 role/roleType");
  }

  // E9: 枚举合法性
  if (grammar.sentenceType && !SENTENCE_TYPE_SET.has(grammar.sentenceType)) {
    errors.push(`E9 sentenceType 非法: "${grammar.sentenceType}"`);
  }
  if (grammar.tense && !TENSE_SET.has(grammar.tense)) {
    errors.push(`E9 tense 非法: "${grammar.tense}"`);
  }
  for (const word of words) {
    if (!POS_SET.has(word.pos)) {
      errors.push(`E9 pos 非法: "${word.text}" → "${word.pos}"`);
    }
  }
  for (const phrase of phrases) {
    if (phrase.role && !ROLE_SET.has(phrase.role)) {
      errors.push(`E9 role 非法: "${phrase.text}" → "${phrase.role}"`);
    }
    if (phrase.roleType && !ROLE_TYPE_SET.has(phrase.roleType)) {
      errors.push(`E9 roleType 非法: "${phrase.text}" → "${phrase.roleType}"`);
    }
  }

  return errors;
}

/**
 * 拼 user message: 只放 {order, english}, 模型按 order 归一结果。
 * 系统提示词用 GRAMMAR_SYSTEM_PROMPT 原样 (调用方拼 messages)。
 */
export function buildAnnotationPrompt(items: { order: number; english: string }[]): string {
  const payload = items.map((item) => ({ order: item.order, english: item.english }));
  return [
    `Annotate these ${payload.length} items. Return a JSON object with an "items" array — ` +
      `exactly one entry per item below, SAME ORDER as given, and echo back each item's "order".`,
    JSON.stringify(payload, null, 1),
  ].join("\n");
}

/**
 * 容错解析模型响应 (风格同 ai-content.service.ts 的 parseStatements):
 * 允许 {items:[...]} / {statements:[...]} / 裸数组, 允许被 markdown 代码围栏或散文包裹。
 * 只保留 expectedOrders 里出现过的 order; 解析不出来返回空 Map, **不抛异常** (容错要求)。
 *
 * 模型的 structure 一律丢弃 (铁律 2), structure 只由程序按 pattern 映射算。
 */
export function parseAnnotationResponse(
  content: string,
  expectedOrders: number[],
): Map<number, GrammarAnnotation> {
  const annotations = new Map<number, GrammarAnnotation>();
  const root = parseJsonLoosely(content);
  if (root === null || root === undefined) return annotations;

  const list = pickItemArray(root);
  if (!list) return annotations;

  const expected = new Set(expectedOrders);
  for (const entry of list) {
    const order = readOrder(entry);
    if (order === null || !expected.has(order) || annotations.has(order)) continue;
    annotations.set(order, toAnnotation(entry));
  }
  return annotations;
}

function locateFrom(
  english: string,
  text: string,
  cursor: number,
): { span?: { start: number; end: number }; cursor: number } {
  if (!text) return { cursor };
  const index = english.indexOf(text, cursor);
  if (index < 0) return { cursor };
  return { span: { start: index, end: index + text.length }, cursor: index + text.length };
}

function checkOffsets(
  label: string,
  english: string,
  entries: { text: string; start?: number; end?: number }[],
): string[] {
  const errors: string[] = [];
  const spans: { start: number; end: number }[] = [];

  for (const entry of entries) {
    const { text, start, end } = entry;
    if (start === undefined || end === undefined) {
      // 偏移是规范要求的必填字段 (前台靠它连线), 缺失同样算错
      errors.push(`E5 ${label} 缺 start/end: "${text}"`);
      continue;
    }
    if (start < 0 || end > english.length || start >= end) {
      errors.push(`E5 ${label} 偏移越界 [${start},${end}): "${text}"`);
      continue;
    }
    if (english.slice(start, end) !== text) {
      errors.push(`E4 ${label} 偏移取到 "${english.slice(start, end)}" ≠ "${text}"`);
    }
    spans.push({ start, end });
  }

  // 逐条从游标往后找, 中间不能夹未覆盖的实词; 末尾同样不能剩实词
  let cursor = 0;
  let locatedInOrder = true;
  for (const entry of entries) {
    const index = english.indexOf(entry.text, cursor);
    if (index < 0 || english.slice(cursor, index).trim()) {
      locatedInOrder = false;
    } else {
      cursor = index + entry.text.length;
    }
  }
  if (locatedInOrder && english.slice(cursor).trim()) locatedInOrder = false;
  if (!locatedInOrder) {
    errors.push(`E4 ${label} 无法从原文顺序定位（有实词未被覆盖）`);
  }

  spans.sort((left, right) => left.start - right.start);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].start < spans[i - 1].end) {
      errors.push(
        `E6 ${label} 偏移重叠 [${spans[i - 1].start},${spans[i - 1].end}) / [${spans[i].start},${spans[i].end})`,
      );
    }
  }

  return errors;
}

function parseJsonLoosely(content: string): unknown {
  if (typeof content !== "string" || !content.trim()) return null;

  try {
    return JSON.parse(content) as unknown;
  } catch {
    // 允许被 ```json 围栏或散文包裹: 取第一个 { 或 [ 到最后一个 } 或 ]
  }

  const starts = [content.indexOf("{"), content.indexOf("[")].filter((index) => index >= 0);
  const ends = [content.lastIndexOf("}"), content.lastIndexOf("]")].filter((index) => index >= 0);
  if (starts.length === 0 || ends.length === 0) return null;

  const start = Math.min(...starts);
  const end = Math.max(...ends);
  if (end <= start) return null;

  try {
    return JSON.parse(content.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function pickItemArray(root: unknown): unknown[] | null {
  if (Array.isArray(root)) return root;
  if (!root || typeof root !== "object") return null;

  const container = root as Record<string, unknown>;
  for (const key of ["items", "statements", "sentences", "data", "annotations", "results"]) {
    const candidate = container[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return null;
}

function readOrder(entry: unknown): number | null {
  if (!entry || typeof entry !== "object") return null;
  const order = (entry as Record<string, unknown>).order;
  if (typeof order !== "number" || !Number.isInteger(order)) return null;
  return order;
}

function toAnnotation(entry: unknown): GrammarAnnotation {
  const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
  return {
    isSentence: raw.isSentence === true,
    unitType: asString(raw.unitType),
    pattern: asString(raw.pattern),
    clauseType: asString(raw.clauseType),
    sentenceType: asString(raw.sentenceType),
    tense: asString(raw.tense),
    keyPoints: Array.isArray(raw.keyPoints)
      ? raw.keyPoints.filter((point): point is string => typeof point === "string")
      : undefined,
    confidence: typeof raw.confidence === "number" ? raw.confidence : undefined,
    words: toWords(raw.words),
    phrases: toPhrases(raw.phrases),
    // 模型的 structure 一律丢弃 (铁律 2)
  };
}

function toWords(value: unknown): GrammarAnnotation["words"] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    // 只取 text/pos: 模型给的 start/end 一律丢弃 (铁律 1)
    return { text: asString(raw.text) ?? "", pos: asString(raw.pos) ?? "" };
  });
}

function toPhrases(value: unknown): GrammarAnnotation["phrases"] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const raw = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    return {
      text: asString(raw.text) ?? "",
      role: asString(raw.role) ?? null,
      roleType: asString(raw.roleType) ?? null,
    };
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
