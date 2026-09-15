import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveGrammarGroups, resolveGrammarRows } from "../../utils/grammarPanel";

// 「句子成分胶囊」面板的守卫。
//
// 为什么不是挂载测试: apps/client 的 package.json 里没有挂载测试库, 仓库根 node_modules/.pnpm
// 下虽然有一份, 但 pnpm 严格解析会拒绝 import; 为一个测试去改 package.json 会动依赖, 不允许。
// 所以这里退而用两层覆盖:
//   1. 源码级守卫 (本仓既有约定): 钉住面板挂在答题后的那个组件里、钉住关键渲染写法;
//   2. 纯函数 + 真实对象的覆盖: 面板真正渲染出来的词序 / 成分由 utils/grammarPanel.ts 决定,
//      这里用真实标注对象直接断言它的输出。
// 真实浏览器里的对齐 / 配色由 RC 手工巡检验证。
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const answer = readSource("components/main/Answer.vue");
const grammarPanel = readSource("components/main/GrammarPanel.vue");
const grammarPanelUtil = readSource("utils/grammarPanel.ts");
const chineseToEnglishMode = readSource(
  "components/mode/chineseToEnglish/ChineseToEnglishMode.vue",
);
const dictationMode = readSource("components/mode/dictation/DictationMode.vue");

describe("面板挂在答题后的 MainAnswer 上", () => {
  it("Answer.vue 里用到面板组件 (全局注册名)", () => {
    expect(answer).toContain("<MainGrammarPanel");
  });

  it("位置在「中文翻译」之后、按钮之前", () => {
    const chineseBlock = answer.indexOf("currentStatement?.chinese");
    const panel = answer.indexOf("<MainGrammarPanel");
    const buttons = answer.indexOf("再来一次");

    expect(chineseBlock).toBeGreaterThan(-1);
    expect(panel).toBeGreaterThan(chineseBlock);
    expect(buttons).toBeGreaterThan(panel);
  });

  it("面板只在答题态出现: 两个模式都只在答题分支渲染 MainAnswer", () => {
    for (const source of [chineseToEnglishMode, dictationMode]) {
      expect(source).toContain("isAnswer()");
      // 面板不得被挪到出题分支里去 (提前露出整句 + 成分 = 直接给答案)
      expect(source).not.toContain("MainGrammarPanel");
      expect(source).not.toContain("GrammarPanel");
    }
  });
});

describe("GrammarPanel.vue 渲染写法守卫", () => {
  it("没有标注时整块不渲染 (不留空卡片 / 错误文案)", () => {
    expect(grammarPanel).toContain('v-if="groups.length > 0"');
    expect(grammarPanel).not.toContain("暂无");
  });

  it("每个词 / 下划线 / 词性都显式写 grid-column (否则三者中心线不齐)", () => {
    // 胶囊与成分名跨满整行, 词 / 下划线 / 词性各自占一列, 列号显式写
    expect(grammarPanel).toContain("grid-column: 1 / -1");
    expect(grammarPanel).toContain("gridColumn: String(column + 1)");
    expect(grammarPanel).toContain("grid-template-columns: repeat(var(--n), max-content)");
  });

  it("只有 B 方案: 下划线 / 词性跟随所属成分的 acc", () => {
    expect(grammarPanel).toContain('"--u": theme.acc');
    expect(grammarPanel).not.toContain("POS_THEME");
  });

  it("碎片只留逐词词性 + 一行灰字, 不显示四个卡片", () => {
    expect(grammarPanel).toContain("碎片只显示逐词词性 —— 不显示成分胶囊 / 结构 / 时态");
    expect(grammarPanel).toContain("isSentence === false");
  });

  it("只读展示: 不碰答题 / 连击 / 评分等游戏状态", () => {
    expect(grammarPanel).not.toContain("submitAnswer");
    expect(grammarPanel).not.toContain("useGameMode");
    expect(grammarPanel).not.toContain("combo");
  });
});

describe("定位逻辑不得回退成「文本首次出现位置」", () => {
  it("utils/grammarPanel.ts 不按文本首次出现位置定位短语", () => {
    expect(grammarPanelUtil).not.toContain("indexOf");
    expect(grammarPanelUtil).toContain("spans.sort(");
  });

  it("真实对象走一遍: 碎片每个词一个裸组, 完整句按成分归组", () => {
    const fragment = resolveGrammarGroups(
      {
        isSentence: false,
        words: [
          { text: "to", pos: "不定式" },
          { text: "do", pos: "动词" },
          { text: "it", pos: "代词" },
        ],
        phrases: [{ text: "to do it", role: null, roleType: null }],
      },
      "to do it",
    );
    expect(fragment.map((group) => group.role)).toEqual(["", "", ""]);
    expect(fragment.flatMap((group) => group.words).join(" ")).toBe("to do it");
    expect(resolveGrammarRows(fragment)).toHaveLength(1);

    const sentence = resolveGrammarGroups(
      {
        isSentence: true,
        structure: "主语 + 谓语 + 宾语",
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
      },
      "I like the food",
    );
    expect(sentence.map((group) => [group.role, group.words.join(" ")])).toEqual([
      ["主语", "I"],
      ["谓语", "like"],
      ["宾语", "the food"],
    ]);
  });
});
