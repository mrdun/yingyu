import type { StatementGrammar } from "~/types";

/**
 * 「句子成分胶囊」面板的纯函数 (无 Vue / 无副作用, 可单测)。
 *
 * 视觉契约: .hermes/design/grammar-effect-page.html (用户拍板的效果页)。
 * 这里只负责把 statements.grammar 变成「一行一行、一块一块的成分分组」,
 * 排序 / 补裸组 / 去重的逻辑都在本文件, 渲染见 components/main/GrammarPanel.vue。
 */
export interface GrammarPanelGroup {
  role: string; // 句子成分 (主语 / 谓语 / 宾语 ...); "" = 裸组 / 碎片 (不声称任何成分)
  roleType: string; // 成分类型 (单词 / 名词短语 ...); 裸组为 ""
  words: string[]; // 该成分的英文词, 渲染成一个胶囊
  wordIndexes: number[]; // 上面每个词在整句词数组里的下标 (渲染词性 / 下划线要用)
}

/** 整句的词 + 中文词性 (渲染逐词下划线 / 词性文字用)。 */
export interface GrammarPanelWord {
  text: string;
  pos: string;
}

/**
 * 成分配色 (效果页实算过对比度, 别改):
 * bg 浅彩底 (胶囊底) / ink 深色词 (压浅底) / acc 亮色点缀 (成分名 + 下划线 + 词性)。
 * "" 是裸组与碎片的中性灰, 且没有成分名。
 */
export const GRAMMAR_ROLE_THEME: Record<string, { bg: string; ink: string; acc: string }> = {
  主语: { bg: "#FEE6EF", ink: "#9F1239", acc: "#DB2777" },
  谓语: { bg: "#E1F1FE", ink: "#1E3A8A", acc: "#2563EB" },
  宾语: { bg: "#D8FAED", ink: "#065F46", acc: "#047857" },
  表语: { bg: "#D9F3F8", ink: "#155E75", acc: "#0E7490" },
  状语: { bg: "#FEF3D7", ink: "#78350F", acc: "#B45309" },
  定语: { bg: "#E9E4FE", ink: "#5B21B6", acc: "#7C3AED" },
  连接词: { bg: "#EEF2F7", ink: "#1E293B", acc: "#475569" },
  "": { bg: "#F1F5F9", ink: "#1E293B", acc: "#475569" },
};

interface GrammarPhraseSpan {
  start: number; // 起点词下标 (闭)
  end: number; // 终点词下标 (开)
  phrase: StatementGrammar["phrases"][number];
}

/**
 * 整句的词表: 优先用标注里的 words (带词性), 没有再退回 english.split(" ")。
 * 分词规则与效果页一致 (单空格切分)。
 */
export function resolveGrammarWords(
  grammar: StatementGrammar | null | undefined,
  english: string,
): GrammarPanelWord[] {
  const annotatedWords = grammar?.words;
  if (annotatedWords && annotatedWords.length > 0) {
    return annotatedWords.map((word) => ({ text: word.text, pos: word.pos ?? "" }));
  }
  if (!english) return [];
  return english.split(" ").map((text) => ({ text, pos: "" }));
}

/**
 * 给一个短语文本找一个「连续且不与已占用区间重叠」的落点。
 *
 * ⚠️ 从前往后逐个落点试, 重复词 (I / it / to) 只有这里能落对位置;
 * 落点被占就跳过这个落点继续往后找, 全句都找不到才放弃这个短语。
 */
function locateFreeSpan(
  words: GrammarPanelWord[],
  phrase: StatementGrammar["phrases"][number],
  taken: GrammarPhraseSpan[],
): GrammarPhraseSpan | null {
  const parts = phrase.text.split(" ");

  for (let start = 0; start + parts.length <= words.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < parts.length; offset += 1) {
      if (words[start + offset].text !== parts[offset]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    const end = start + parts.length;
    const overlaps = taken.some((span) => start < span.end && end > span.start);
    if (overlaps) continue;

    return { start, end, phrase };
  }

  return null;
}

function bareGroup(words: GrammarPanelWord[], index: number): GrammarPanelGroup {
  return { role: "", roleType: "", words: [words[index].text], wordIndexes: [index] };
}

/**
 * 把标注切成「成分分组」。
 *
 * 硬要求 (都有历史缺陷对应):
 * 1. 分组区间**按匹配到的起点升序**排 —— 绝不能按「文本首次出现的位置」排,
 *    否则重复词会让区间乱走, 渲染时重复输出已经标过的词 (14 词的句子渲染出 21 个词)。
 * 2. 区间之间不得重叠 (按 phrases 原顺序先到先得, 重叠的落点跳过)。
 * 3. role 为 null 的短语 (碎片) 不进分组。
 * 4. 词覆盖必须完整且**恰好一次**: 没被任何短语覆盖的词按原顺序补成裸组。
 * 5. grammar 缺失 / english 为空 → 返回 [] (不抛异常)。
 */
export function resolveGrammarGroups(
  grammar: StatementGrammar | null | undefined,
  english: string,
): GrammarPanelGroup[] {
  if (!grammar || !english) return [];

  const words = resolveGrammarWords(grammar, english);
  if (words.length === 0) return [];

  // 1) 先给每个有成分的短语定位 (phrases 原顺序: 先到先得)
  const spans: GrammarPhraseSpan[] = [];
  for (const phrase of grammar.phrases ?? []) {
    if (!phrase || !phrase.role) continue; // 碎片 (role: null) 不进分组
    const span = locateFreeSpan(words, phrase, spans);
    if (span) spans.push(span);
  }

  // 2) 再按起点排序 —— 排序依据是**匹配到的位置**, 不是文本首次出现位置
  spans.sort((a, b) => a.start - b.start);

  // 3) 按顺序铺开: 区间之间空出来的词补裸组, 保证每个词恰好出现一次
  const groups: GrammarPanelGroup[] = [];
  let cursor = 0;
  for (const span of spans) {
    while (cursor < span.start) {
      groups.push(bareGroup(words, cursor));
      cursor += 1;
    }

    const wordIndexes: number[] = [];
    for (let index = span.start; index < span.end; index += 1) wordIndexes.push(index);

    groups.push({
      role: span.phrase.role ?? "",
      roleType: span.phrase.roleType ?? "",
      words: wordIndexes.map((index) => words[index].text),
      wordIndexes,
    });
    cursor = span.end;
  }
  while (cursor < words.length) {
    groups.push(bareGroup(words, cursor));
    cursor += 1;
  }

  return groups;
}

/**
 * 分组排成一行一行: 默认遇到「连接词」且当前行非空就另起一行 (长并列句在 so / and 处断行)。
 * opts.clauseBreak 为 false 时全部放一行。
 */
export function resolveGrammarRows(
  groups: GrammarPanelGroup[],
  opts?: { clauseBreak?: boolean },
): GrammarPanelGroup[][] {
  const clauseBreak = opts?.clauseBreak !== false;

  const rows: GrammarPanelGroup[][] = [];
  let current: GrammarPanelGroup[] = [];

  for (const group of groups) {
    if (clauseBreak && current.length > 0 && group.role === "连接词") {
      rows.push(current);
      current = [];
    }
    current.push(group);
  }
  if (current.length > 0) rows.push(current);

  return rows;
}
