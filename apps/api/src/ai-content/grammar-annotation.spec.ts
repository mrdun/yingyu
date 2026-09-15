import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { GrammarAnnotation } from "./grammar-annotation";
import {
  buildAnnotationPrompt,
  computeOffsets,
  GRAMMAR_SYSTEM_PROMPT,
  parseAnnotationResponse,
  structureFromPattern,
  validateGrammar,
} from "./grammar-annotation";

type FixtureRow = { english: string; annotation: GrammarAnnotation };

// 夹具 = .hermes/design/grammar-lesson1-annotated.json (218 条真实标注, 由
// scripts/grammar/annotate-lesson.py 跑通) 里逐字抄出来的三条: order 9 / 3 / 174。
// __FIXTURES_START__
const FIXTURE_SENTENCE = {
  english: "I don't like the food",
  annotation: {
    isSentence: true,
    unitType: "sentence",
    pattern: "S + V + O",
    clauseType: "简单句",
    sentenceType: "陈述句",
    tense: "一般现在时",
    keyPoints: ["don't like 构成否定谓语", "一般现在时否定句"],
    confidence: 0.95,
    words: [
      {
        text: "I",
        pos: "代词",
        start: 0,
        end: 1,
      },
      {
        text: "don't",
        pos: "助动词",
        start: 2,
        end: 7,
      },
      {
        text: "like",
        pos: "动词",
        start: 8,
        end: 12,
      },
      {
        text: "the",
        pos: "冠词",
        start: 13,
        end: 16,
      },
      {
        text: "food",
        pos: "名词",
        start: 17,
        end: 21,
      },
    ],
    phrases: [
      {
        text: "I",
        role: "主语",
        roleType: "单词",
        start: 0,
        end: 1,
      },
      {
        text: "don't like",
        role: "谓语",
        roleType: "动词短语",
        start: 2,
        end: 12,
      },
      {
        text: "the food",
        role: "宾语",
        roleType: "名词短语",
        start: 13,
        end: 21,
      },
    ],
    structure: "主语 + 谓语 + 宾语",
  },
} as FixtureRow;
const FIXTURE_FRAGMENT = {
  english: "I like",
  annotation: {
    isSentence: false,
    unitType: "phrase",
    keyPoints: ["主谓片段，缺少宾语"],
    confidence: 0.9,
    words: [
      {
        text: "I",
        pos: "代词",
        start: 0,
        end: 1,
      },
      {
        text: "like",
        pos: "动词",
        start: 2,
        end: 6,
      },
    ],
    phrases: [
      {
        text: "I like",
        role: null,
        roleType: null,
        start: 0,
        end: 6,
      },
    ],
  },
} as FixtureRow;
const FIXTURE_COORDINATED = {
  english: "It is important for me so I have to do it",
  annotation: {
    isSentence: true,
    unitType: "sentence",
    pattern: "S + V + P + Adv + conj + S + V + O",
    clauseType: "并列句",
    sentenceType: "陈述句",
    tense: "一般现在时",
    keyPoints: ["so 连接两个并列分句", "for me 表示对我来说"],
    confidence: 0.88,
    words: [
      {
        text: "It",
        pos: "代词",
        start: 0,
        end: 2,
      },
      {
        text: "is",
        pos: "动词",
        start: 3,
        end: 5,
      },
      {
        text: "important",
        pos: "形容词",
        start: 6,
        end: 15,
      },
      {
        text: "for",
        pos: "介词",
        start: 16,
        end: 19,
      },
      {
        text: "me",
        pos: "代词",
        start: 20,
        end: 22,
      },
      {
        text: "so",
        pos: "连词",
        start: 23,
        end: 25,
      },
      {
        text: "I",
        pos: "代词",
        start: 26,
        end: 27,
      },
      {
        text: "have",
        pos: "助动词",
        start: 28,
        end: 32,
      },
      {
        text: "to",
        pos: "不定式",
        start: 33,
        end: 35,
      },
      {
        text: "do",
        pos: "动词",
        start: 36,
        end: 38,
      },
      {
        text: "it",
        pos: "代词",
        start: 39,
        end: 41,
      },
    ],
    phrases: [
      {
        text: "It",
        role: "主语",
        roleType: "单词",
        start: 0,
        end: 2,
      },
      {
        text: "is",
        role: "谓语",
        roleType: "单词",
        start: 3,
        end: 5,
      },
      {
        text: "important",
        role: "表语",
        roleType: "形容词短语",
        start: 6,
        end: 15,
      },
      {
        text: "for me",
        role: "状语",
        roleType: "介词短语",
        start: 16,
        end: 22,
      },
      {
        text: "so",
        role: "连接词",
        roleType: "单词",
        start: 23,
        end: 25,
      },
      {
        text: "I",
        role: "主语",
        roleType: "单词",
        start: 26,
        end: 27,
      },
      {
        text: "have to do",
        role: "谓语",
        roleType: "动词短语",
        start: 28,
        end: 38,
      },
      {
        text: "it",
        role: "宾语",
        roleType: "单词",
        start: 39,
        end: 41,
      },
    ],
    structure: "主语 + 谓语 + 表语 + 状语 + 连接词 + 主语 + 谓语 + 宾语",
  },
} as FixtureRow;
// __FIXTURES_END__

// 拼一个最小合规完整句, 供「改动某处 → 必须报错」的用例使用 (基线本身合规)。
function validSentence(overrides: Partial<GrammarAnnotation> = {}): GrammarAnnotation {
  return {
    ...FIXTURE_SENTENCE.annotation,
    ...overrides,
  };
}

describe("GRAMMAR_SYSTEM_PROMPT 与 python 探针脚本同源", () => {
  /**
   * 提示词有两份副本：`scripts/grammar/system-prompt.txt`（探针脚本用）与本文件里的常量
   * （生产管道用）。**改一份忘另一份**会让「同一批句子在脚本与管道里标出不同结果」，
   * 而那种漂移极难发现。所以用一条测试把两份钉在一起。
   */
  it("与 scripts/grammar/system-prompt.txt 逐字一致", () => {
    const promptPath = join(__dirname, "../../../../scripts/grammar/system-prompt.txt");
    const fromFile = readFileSync(promptPath, "utf-8").replace(/\r\n/g, "\n").trim();
    expect(GRAMMAR_SYSTEM_PROMPT.replace(/\r\n/g, "\n").trim()).toBe(fromFile);
  });

  it("明确要求保留句末标点（否则带标点的句子会被校验器整条丢标）", () => {
    // 真实踩过：模型把 "I like the food." 的句号去掉 → words/phrases 拼不回原文 → 全部丢弃。
    // 生产语料无标点所以没暴露，但字幕/音频入口的文本会带标点。
    expect(GRAMMAR_SYSTEM_PROMPT).toContain("KEEP the punctuation");
  });
});

describe("structureFromPattern (pattern → 中文结构串)", () => {
  it("S + V + O → 主语 + 谓语 + 宾语", () => {
    expect(structureFromPattern("S + V + O")).toBe("主语 + 谓语 + 宾语");
  });

  it("并列句的 conj 与复合句的 Clause 都能映射", () => {
    expect(structureFromPattern("S + V + P + Adv + conj + S + V + O")).toBe(
      "主语 + 谓语 + 表语 + 状语 + 连接词 + 主语 + 谓语 + 宾语",
    );
    expect(structureFromPattern("S + V + O + Clause")).toBe("主语 + 谓语 + 宾语 + 从句");
  });

  it("There be 整体是一个符号", () => {
    expect(structureFromPattern("There be + S + Adv")).toBe("There be + 主语 + 状语");
  });

  it("未知符号 / 空串 → 空串 (交给校验器报错, 不抛异常)", () => {
    expect(structureFromPattern("S + V + X")).toBe("");
    expect(structureFromPattern("")).toBe("");
    expect(structureFromPattern("S + V + constructor")).toBe("");
  });
});

describe("computeOffsets (位置只由程序按空白顺序走位算)", () => {
  it("I like the food: I=[0,1) like=[2,6) the food=[7,15)", () => {
    const grammar = computeOffsets("I like the food", {
      isSentence: true,
      words: [
        { text: "I", pos: "代词" },
        { text: "like", pos: "动词" },
        { text: "the", pos: "冠词" },
        { text: "food", pos: "名词" },
      ],
      phrases: [
        { text: "I", role: "主语", roleType: "单词" },
        { text: "like", role: "谓语", roleType: "动词短语" },
        { text: "the food", role: "宾语", roleType: "名词短语" },
      ],
    });

    expect([grammar.phrases[0].start, grammar.phrases[0].end]).toEqual([0, 1]);
    expect([grammar.phrases[1].start, grammar.phrases[1].end]).toEqual([2, 6]);
    expect([grammar.phrases[2].start, grammar.phrases[2].end]).toEqual([7, 15]);
    expect([grammar.words[0].start, grammar.words[0].end]).toEqual([0, 1]);
    expect([grammar.words[2].start, grammar.words[2].end]).toEqual([7, 10]); // the
    expect([grammar.words[3].start, grammar.words[3].end]).toEqual([11, 15]); // food

    for (const entry of [...grammar.words, ...grammar.phrases]) {
      expect("I like the food".slice(entry.start, entry.end)).toBe(entry.text);
    }
  });

  it("重复词不能被「首次出现位置」带偏 (It is important for me so I have to do it)", () => {
    const english = FIXTURE_COORDINATED.english;
    const grammar = computeOffsets(english, FIXTURE_COORDINATED.annotation);

    for (const entry of [...grammar.words, ...grammar.phrases]) {
      expect(english.slice(entry.start, entry.end)).toBe(entry.text);
    }
    // I 在句中出现两次 (开头还有 it), 第二个 I 必须是 26 而不是 0
    expect(grammar.phrases[0].start).toBe(0); // It
    expect(grammar.phrases[5].start).toBe(26); // I
    expect(grammar.phrases[7].start).toBe(39); // it
    const spans = grammar.phrases.map((phrase) => `${phrase.start}-${phrase.end}`);
    expect(new Set(spans).size).toBe(grammar.phrases.length);
  });

  it("找不到的条目跳过偏移, 后续条目照常定位 (不让整份数据连锁误报)", () => {
    const grammar = computeOffsets("I like the food", {
      isSentence: true,
      words: [],
      phrases: [
        { text: "I", role: null, roleType: null },
        { text: "banana", role: null, roleType: null },
        { text: "the food", role: null, roleType: null },
      ],
    });

    expect(grammar.phrases[1].start).toBeUndefined();
    expect(grammar.phrases[1].end).toBeUndefined();
    expect([grammar.phrases[2].start, grammar.phrases[2].end]).toEqual([7, 15]);
  });

  it("模型给的 start/end 一律丢弃", () => {
    const grammar = computeOffsets("I like the food", {
      isSentence: true,
      words: [{ text: "I", pos: "代词", start: 7, end: 8 }],
      phrases: [{ text: "banana", role: null, roleType: null, start: 0, end: 6 }],
    });

    expect([grammar.words[0].start, grammar.words[0].end]).toEqual([0, 1]);
    expect(grammar.phrases[0].start).toBeUndefined();
  });
});

describe("validateGrammar (复刻 validate-format.py 的错项)", () => {
  it("真实完整句夹具 → 空数组", () => {
    expect(validateGrammar(FIXTURE_SENTENCE.english, FIXTURE_SENTENCE.annotation)).toEqual([]);
  });

  it("真实碎片夹具 → 空数组", () => {
    expect(validateGrammar(FIXTURE_FRAGMENT.english, FIXTURE_FRAGMENT.annotation)).toEqual([]);
  });

  it("完整句缺 pattern → E10", () => {
    const errors = validateGrammar(
      FIXTURE_SENTENCE.english,
      validSentence({ pattern: undefined, structure: undefined }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join("; ")).toContain("E10");
  });

  it("pattern 含闭集外符号 → E13", () => {
    const errors = validateGrammar(
      FIXTURE_SENTENCE.english,
      validSentence({ pattern: "S + V + Predicative" }),
    );
    expect(errors.join("; ")).toContain("E13");
  });

  it("structure 与 pattern 映射不符 / 缺失 → E13", () => {
    expect(
      validateGrammar(FIXTURE_SENTENCE.english, validSentence({ structure: "主语 + 谓语" })).join(
        "; ",
      ),
    ).toContain("E13");
    expect(
      validateGrammar(FIXTURE_SENTENCE.english, validSentence({ structure: undefined })).join("; "),
    ).toContain("E13");
  });

  it("碎片标了 role / roleType → E11", () => {
    const withRole = validateGrammar(FIXTURE_FRAGMENT.english, {
      ...FIXTURE_FRAGMENT.annotation,
      phrases: [{ ...FIXTURE_FRAGMENT.annotation.phrases[0], role: "谓语" }],
    });
    expect(withRole.join("; ")).toContain("E11");

    const withRoleType = validateGrammar(FIXTURE_FRAGMENT.english, {
      ...FIXTURE_FRAGMENT.annotation,
      phrases: [{ ...FIXTURE_FRAGMENT.annotation.phrases[0], roleType: "动词短语" }],
    });
    expect(withRoleType.join("; ")).toContain("E11");
  });

  it("words 拼接不等于 english → 报错", () => {
    const errors = validateGrammar(
      FIXTURE_SENTENCE.english,
      validSentence({ words: FIXTURE_SENTENCE.annotation.words.slice(0, 4) }),
    );
    expect(errors.join("; ")).toContain("words 拼接不等于 english");
  });

  it("phrases 拼接不等于 english (漏词/多词/重排) → 报错", () => {
    const errors = validateGrammar(FIXTURE_SENTENCE.english, {
      ...FIXTURE_SENTENCE.annotation,
      phrases: [
        { text: "I like", role: "谓语", roleType: "动词短语", start: 0, end: 6 },
        { text: "food", role: "宾语", roleType: "名词短语", start: 17, end: 21 },
      ],
    });
    expect(errors.join("; ")).toContain("phrases 拼接不等于 english");
  });

  it("偏移 slice 与 text 不一致 / 缺偏移 → E4 / E5", () => {
    const shifted = validateGrammar(FIXTURE_SENTENCE.english, {
      ...FIXTURE_SENTENCE.annotation,
      phrases: FIXTURE_SENTENCE.annotation.phrases.map((phrase, index) =>
        index === 0 ? { ...phrase, start: 13, end: 16 } : phrase,
      ),
    });
    expect(shifted.join("; ")).toContain("E4");

    const missing = validateGrammar(FIXTURE_SENTENCE.english, {
      ...FIXTURE_SENTENCE.annotation,
      words: FIXTURE_SENTENCE.annotation.words.map((word, index) =>
        index === 0 ? { text: word.text, pos: word.pos } : word,
      ),
    });
    expect(missing.join("; ")).toContain("E5");
  });

  it("枚举非法 → E9 (pos / role / roleType / sentenceType / tense / clauseType)", () => {
    expect(
      validateGrammar(
        FIXTURE_SENTENCE.english,
        validSentence({
          words: FIXTURE_SENTENCE.annotation.words.map((word, index) =>
            index === 0 ? { ...word, pos: "名词性" } : word,
          ),
        }),
      ).join("; "),
    ).toContain("E9 pos");

    expect(
      validateGrammar(
        FIXTURE_SENTENCE.english,
        validSentence({
          phrases: FIXTURE_SENTENCE.annotation.phrases.map((phrase, index) =>
            index === 0 ? { ...phrase, role: "主题" } : phrase,
          ),
        }),
      ).join("; "),
    ).toContain("E9 role");

    expect(
      validateGrammar(
        FIXTURE_SENTENCE.english,
        validSentence({
          phrases: FIXTURE_SENTENCE.annotation.phrases.map((phrase, index) =>
            index === 0 ? { ...phrase, roleType: "主语从句" } : phrase,
          ),
        }),
      ).join("; "),
    ).toContain("E9 roleType");

    expect(
      validateGrammar(FIXTURE_SENTENCE.english, validSentence({ sentenceType: "强调句" })).join(
        "; ",
      ),
    ).toContain("E9 sentenceType");
    expect(
      validateGrammar(FIXTURE_SENTENCE.english, validSentence({ tense: "过去式" })).join("; "),
    ).toContain("E9 tense");
    expect(
      validateGrammar(FIXTURE_SENTENCE.english, validSentence({ clauseType: "并列复合句" })).join(
        "; ",
      ),
    ).toContain("E9 clauseType");
  });

  it("缺偏移时不会连锁假报顺序错 (实测踩过 436 条假错)", () => {
    const errors = validateGrammar("I like the food", {
      isSentence: false,
      words: [
        { text: "I", pos: "代词" },
        { text: "like", pos: "动词" },
        { text: "the", pos: "冠词" },
        { text: "food", pos: "名词" },
      ],
      phrases: [{ text: "I like the food", role: null, roleType: null }],
    });

    expect(errors.filter((error) => error.includes("E4 phrases")).length).toBe(0);
  });
});

describe("parseAnnotationResponse (容错解析, 绝不抛异常)", () => {
  const expectedOrders = [1, 2];
  const fragment = { order: 1, isSentence: false, words: [], phrases: [] };

  it("吃 {items:[...]} / {statements:[...]} / 裸数组 / 代码围栏包裹", () => {
    const wrapped = parseAnnotationResponse(JSON.stringify({ items: [fragment] }), expectedOrders);
    expect(wrapped.get(1).isSentence).toBe(false);

    const statements = parseAnnotationResponse(
      JSON.stringify({ statements: [{ ...fragment, order: 2 }] }),
      expectedOrders,
    );
    expect(statements.size).toBe(1);
    expect(statements.has(2)).toBe(true);

    const bare = parseAnnotationResponse(JSON.stringify([fragment]), expectedOrders);
    expect(bare.has(1)).toBe(true);

    const fenced = parseAnnotationResponse(
      'Sure!\n```json\n{"items":[{"order":1,"isSentence":false,"words":[],"phrases":[]}]}\n```\nDone.',
      expectedOrders,
    );
    expect(fenced.get(1).isSentence).toBe(false);
  });

  it("只保留 expectedOrders 里出现过的 order", () => {
    const parsed = parseAnnotationResponse(
      JSON.stringify({ items: [{ ...fragment, order: 7 }, fragment] }),
      expectedOrders,
    );
    expect(parsed.size).toBe(1);
    expect(parsed.has(1)).toBe(true);
    expect(parsed.has(7)).toBe(false);
  });

  it("垃圾输入 / 空串 / 截断 JSON → 空 Map 且不抛异常", () => {
    expect(parseAnnotationResponse("the model refused to answer", expectedOrders).size).toBe(0);
    expect(parseAnnotationResponse("", expectedOrders).size).toBe(0);
    expect(parseAnnotationResponse('{"items":[{"order":1,', expectedOrders).size).toBe(0);
  });

  it("模型写的 structure / start / end 全部丢弃 (铁律 1、2)", () => {
    const parsed = parseAnnotationResponse(
      JSON.stringify({
        items: [
          {
            order: 1,
            isSentence: true,
            pattern: "S + V + O",
            structure: "模型自己编的",
            words: [{ text: "I", pos: "代词", start: 99, end: 100 }],
            phrases: [{ text: "I", role: "主语", roleType: "单词", start: 99, end: 100 }],
          },
        ],
      }),
      expectedOrders,
    );

    expect(parsed.get(1).structure).toBeUndefined();
    expect(parsed.get(1).words[0].start).toBeUndefined();
    expect(parsed.get(1).phrases[0].start).toBeUndefined();
  });

  it("重复 order 只取第一条, 缺 order / order 非整数直接丢弃", () => {
    const duplicated = parseAnnotationResponse(
      JSON.stringify({
        items: [
          { ...fragment, unitType: "word" },
          { ...fragment, unitType: "sentence" },
        ],
      }),
      expectedOrders,
    );
    expect(duplicated.get(1).unitType).toBe("word");

    expect(
      parseAnnotationResponse(
        JSON.stringify({ items: [{ isSentence: false, words: [], phrases: [] }] }),
        expectedOrders,
      ).size,
    ).toBe(0);
    const invalidOrder = parseAnnotationResponse(
      JSON.stringify({ items: [{ ...fragment, order: "1" }] }),
      expectedOrders,
    );
    expect(invalidOrder.size).toBe(0);
  });
});

describe("buildAnnotationPrompt", () => {
  it("含每条 order 与 english, 尾部是可解析的 items 数组", () => {
    const items = [
      { order: 0, english: "I" },
      { order: 3, english: "I like the food" },
    ];
    const prompt = buildAnnotationPrompt(items);

    expect(prompt).toContain('"order": 0');
    expect(prompt).toContain('"order": 3');
    expect(prompt).toContain('"english": "I"');
    expect(prompt).toContain('"english": "I like the food"');

    const payload = JSON.parse(prompt.slice(prompt.indexOf("["), prompt.lastIndexOf("]") + 1));
    expect(payload).toEqual(items);
  });

  it("系统提示词是 scripts/grammar/system-prompt.txt 的逐字副本, 不是占位符", () => {
    expect(GRAMMAR_SYSTEM_PROMPT).not.toContain("__GRAMMAR_SYSTEM_PROMPT__");
    expect(GRAMMAR_SYSTEM_PROMPT).toContain('Do NOT output a "structure" field');
    expect(GRAMMAR_SYSTEM_PROMPT).toContain("There be");
    expect(GRAMMAR_SYSTEM_PROMPT).toContain(
      "Words joined with single spaces MUST equal the sentence",
    );
  });
});
