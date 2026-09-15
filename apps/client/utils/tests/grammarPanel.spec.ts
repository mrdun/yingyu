import { describe, expect, it } from "vitest";

import type { GrammarPanelGroup } from "../grammarPanel";
import { GRAMMAR_ROLE_THEME, resolveGrammarGroups, resolveGrammarRows } from "../grammarPanel";

// 行为测试: 用真实标注对象跑 resolveGrammarGroups / resolveGrammarRows。
// 目标句取自第一课真实标注 (.hermes/design/grammar-lesson1-annotated.json),
// 断言的是「渲染出来到底是什么」—— 词序 / 成分 / 断行, 不看源码文本。

/** 第一课第 5 句 (真实标注, 原样照抄) */
const likeFood = {
  order: 5,
  isSentence: true,
  unitType: "sentence",
  pattern: "S + V + O",
  clauseType: "简单句",
  sentenceType: "陈述句",
  tense: "一般现在时",
  keyPoints: ["主语 I + 谓语 like + 宾语 the food", "一般现在时表示喜好"],
  confidence: 0.95,
  words: [
    { text: "I", pos: "代词", start: 0, end: 1 },
    { text: "like", pos: "动词", start: 2, end: 6 },
    { text: "the", pos: "冠词", start: 7, end: 10 },
    { text: "food", pos: "名词", start: 11, end: 15 },
  ],
  phrases: [
    { text: "I", role: "主语", roleType: "单词", start: 0, end: 1 },
    { text: "like", role: "谓语", roleType: "动词短语", start: 2, end: 6 },
    { text: "the food", role: "宾语", roleType: "名词短语", start: 7, end: 15 },
  ],
  structure: "主语 + 谓语 + 宾语",
};

/** 含重复词 I / it / to 的并列长句 (so 前是主句, so 后是从句) */
const repeatedWords = {
  isSentence: true,
  words: [
    { text: "It", pos: "代词" },
    { text: "is", pos: "动词" },
    { text: "important", pos: "形容词" },
    { text: "for", pos: "介词" },
    { text: "me", pos: "代词" },
    { text: "so", pos: "连词" },
    { text: "I", pos: "代词" },
    { text: "have", pos: "助动词" },
    { text: "to", pos: "不定式" },
    { text: "do", pos: "动词" },
    { text: "it", pos: "代词" },
  ],
  phrases: [
    { text: "It", role: "主语", roleType: "单词" },
    { text: "is", role: "谓语", roleType: "动词短语" },
    { text: "important", role: "表语", roleType: "形容词短语" },
    { text: "for me", role: "状语", roleType: "介词短语" },
    { text: "so", role: "连接词", roleType: "单词" },
    { text: "I", role: "主语", roleType: "单词" },
    { text: "have to do", role: "谓语", roleType: "动词短语" },
    { text: "it", role: "宾语", roleType: "名词短语" },
  ],
};

const repeatedEnglish = "It is important for me so I have to do it";

/** 碎片 (真实标注形状: isSentence: false, 短语不带成分) */
const fragment = {
  isSentence: false,
  unitType: "phrase",
  keyPoints: ["to do it 表示「去做它」"],
  words: [
    { text: "to", pos: "不定式" },
    { text: "do", pos: "动词" },
    { text: "it", pos: "代词" },
  ],
  phrases: [{ text: "to do it", role: null, roleType: null }],
};

const signature = (groups: GrammarPanelGroup[]): string[][] =>
  groups.map((group) => [group.role, group.words.join(" ")]);

describe("resolveGrammarGroups — 词覆盖完整且恰好一次", () => {
  it("I like the food: 主语 / 谓语 / 宾语, 词序与标注一致", () => {
    const groups = resolveGrammarGroups(likeFood, "I like the food");

    expect(signature(groups)).toEqual([
      ["主语", "I"],
      ["谓语", "like"],
      ["宾语", "the food"],
    ]);
    expect(groups.flatMap((group) => group.wordIndexes)).toEqual([0, 1, 2, 3]);
  });

  it("重复词 (I / it) 必须落对位置, 渲染出来还原成原句", () => {
    const groups = resolveGrammarGroups(repeatedWords, repeatedEnglish);

    // 渲染口径: 按顺序把每个分组的词拼起来 = 原句, 不重不漏
    expect(groups.flatMap((group) => group.words).join(" ")).toBe(repeatedEnglish);
    expect(groups.flatMap((group) => group.wordIndexes)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    // 两个主语分别在句首 It 与 so 之后的 I
    expect(
      groups.filter((group) => group.role === "主语").map((group) => group.wordIndexes[0]),
    ).toEqual([0, 6]);
    // 唯一的宾语是句尾的 it (下标 10), 而不是句首的 It (下标 0)
    expect(groups.filter((group) => group.role === "宾语")[0].wordIndexes).toEqual([10]);
  });

  it("同一短语文本出现两次时, 第二次必须落在后面还没被占的空位", () => {
    const english = "I like it so I do it";
    const grammar = {
      isSentence: true,
      words: [
        { text: "I", pos: "代词" },
        { text: "like", pos: "动词" },
        { text: "it", pos: "代词" },
        { text: "so", pos: "连词" },
        { text: "I", pos: "代词" },
        { text: "do", pos: "动词" },
        { text: "it", pos: "代词" },
      ],
      phrases: [
        { text: "I", role: "主语", roleType: "单词" },
        { text: "like", role: "谓语", roleType: "动词短语" },
        { text: "it", role: "宾语", roleType: "名词短语" },
        { text: "so", role: "连接词", roleType: "单词" },
        { text: "I", role: "主语", roleType: "单词" },
        { text: "do", role: "谓语", roleType: "动词短语" },
        { text: "it", role: "宾语", roleType: "名词短语" },
      ],
    };

    const groups = resolveGrammarGroups(grammar, english);

    expect(groups.map((group) => group.wordIndexes)).toEqual([[0], [1], [2], [3], [4], [5], [6]]);
    expect(groups.flatMap((group) => group.words).join(" ")).toBe(english);
  });

  it("短语没覆盖到的词按原顺序补成裸组 (role 为空串, 中性灰)", () => {
    const withoutPredicate = {
      ...likeFood,
      phrases: likeFood.phrases.filter((phrase) => phrase.role !== "谓语"),
    };

    const groups = resolveGrammarGroups(withoutPredicate, "I like the food");

    expect(signature(groups)).toEqual([
      ["主语", "I"],
      ["", "like"],
      ["宾语", "the food"],
    ]);
    expect(groups[1].wordIndexes).toEqual([1]);
    expect(groups[1].roleType).toBe("");
    expect(groups.flatMap((group) => group.wordIndexes)).toEqual([0, 1, 2, 3]);
  });
});

describe("resolveGrammarRows — 从句断行", () => {
  it("遇连接词另起一行: 行数 >= 2, 第二行首组是连接词", () => {
    const groups = resolveGrammarGroups(repeatedWords, repeatedEnglish);
    const rows = resolveGrammarRows(groups);

    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows[1][0].role).toBe("连接词");
    // 断行点就在 so: 第一行只有 so 之前的词
    expect(rows[0].flatMap((row) => row.words).join(" ")).toBe("It is important for me");
    expect(rows[1].flatMap((row) => row.words).join(" ")).toBe("so I have to do it");
  });

  it("clauseBreak: false 时不分行 (全部放一行)", () => {
    const groups = resolveGrammarGroups(repeatedWords, repeatedEnglish);

    expect(resolveGrammarRows(groups, { clauseBreak: false })).toHaveLength(1);
    expect(resolveGrammarRows(groups, { clauseBreak: true })).toHaveLength(2);
  });

  it("没有连接词时仍然只有一行", () => {
    const groups = resolveGrammarGroups(likeFood, "I like the food");

    expect(resolveGrammarRows(groups)).toHaveLength(1);
  });
});

describe("碎片 (isSentence: false)", () => {
  it("成分短语 (role 为 null) 不进分组, 每个词都变成裸组", () => {
    const groups = resolveGrammarGroups(fragment, "to do it");

    expect(groups.map((group) => group.role)).toEqual(["", "", ""]);
    expect(groups.map((group) => group.roleType)).toEqual(["", "", ""]);
    expect(groups.map((group) => group.words)).toEqual([["to"], ["do"], ["it"]]);
    expect(groups.flatMap((group) => group.wordIndexes)).toEqual([0, 1, 2]);
    expect(resolveGrammarRows(groups)).toHaveLength(1);
  });
});

describe("空输入不抛异常", () => {
  it("grammar 为 null / undefined 返回 []", () => {
    expect(resolveGrammarGroups(null, "I like the food")).toEqual([]);
    expect(resolveGrammarGroups(undefined, "I like the food")).toEqual([]);
    expect(() => resolveGrammarGroups(null, repeatedEnglish)).not.toThrow();
  });

  it("english 为空返回 []", () => {
    expect(resolveGrammarGroups(likeFood, "")).toEqual([]);
    expect(resolveGrammarGroups(fragment, "")).toEqual([]);
  });

  it("没有分组时也就没有行", () => {
    expect(resolveGrammarRows([])).toEqual([]);
    expect(resolveGrammarRows([], { clauseBreak: false })).toEqual([]);
  });
});

describe("成分配色表 (效果页实算值, 别改)", () => {
  it("七个成分 + 裸组 / 碎片的中性灰", () => {
    expect(GRAMMAR_ROLE_THEME["主语"]).toEqual({ bg: "#FEE6EF", ink: "#9F1239", acc: "#DB2777" });
    expect(GRAMMAR_ROLE_THEME["谓语"]).toEqual({ bg: "#E1F1FE", ink: "#1E3A8A", acc: "#2563EB" });
    expect(GRAMMAR_ROLE_THEME["宾语"]).toEqual({ bg: "#D8FAED", ink: "#065F46", acc: "#047857" });
    expect(GRAMMAR_ROLE_THEME["连接词"]).toEqual({
      bg: "#EEF2F7",
      ink: "#1E293B",
      acc: "#475569",
    });
    // 裸组 / 碎片: 中性灰, 没有成分名
    expect(GRAMMAR_ROLE_THEME[""]).toEqual({ bg: "#F1F5F9", ink: "#1E293B", acc: "#475569" });
  });
});
