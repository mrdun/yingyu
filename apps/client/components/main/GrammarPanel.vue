<template>
  <!-- 没有标注 (其它 54 课) 时整块不渲染: 不留空卡片、不留错误文案 -->
  <div
    v-if="groups.length > 0"
    class="grammar-panel"
  >
    <!-- 一个成分一个 grid: [成分名][胶囊 + 词][下划线][词性] 四行共用同一套列宽 -->
    <div class="rows">
      <div
        v-for="(row, rowIndex) in rows"
        :key="rowIndex"
        class="sent"
      >
        <div
          v-for="(group, groupIndex) in row"
          :key="groupIndex"
          class="grp"
          :class="{ frag: !group.role }"
          :data-comp="group.role"
          :style="groupStyle(group)"
        >
          <!-- 成分名: 在胶囊上方, 与胶囊居中, 颜色 = 该成分的 acc (裸组 / 碎片是空串) -->
          <div class="name">{{ group.role }}</div>
          <!-- 胶囊底色: 浅彩底 + 1.5px acc 描边 + 圆角, 跨满整个成分 -->
          <div class="pill"></div>
          <!-- 词: 显式写列号, 否则 grid 自动排布会避开胶囊占用的格子, 把词挤到下一行 -->
          <span
            v-for="(wordIndex, column) in group.wordIndexes"
            :key="`word-${wordIndex}`"
            class="w"
            :style="{ gridColumn: String(column + 1) }"
            >{{ words[wordIndex]?.text }}</span
          >
          <!-- 下划线: 每个单词一条, 颜色 = --u (B 方案: 跟随所属成分的 acc) -->
          <span
            v-for="(wordIndex, column) in group.wordIndexes"
            :key="`underline-${wordIndex}`"
            class="ul"
            :style="{ gridColumn: String(column + 1) }"
          ></span>
          <!-- 词性: 与词、下划线同一竖中心线, 颜色 = --u -->
          <span
            v-for="(wordIndex, column) in group.wordIndexes"
            :key="`pos-${wordIndex}`"
            class="pp"
            :style="{ gridColumn: String(column + 1) }"
            >{{ words[wordIndex]?.pos }}</span
          >
        </div>
      </div>
    </div>

    <!-- 完整句: 四个等宽卡片 (句子结构 / 时态 / 句型 / 语法要点);
         碎片 (isSentence: false): 只留一行灰字, 不显示成分 / 结构 / 时态 -->
    <div
      v-if="isFragment"
      class="footnote"
    >
      碎片只显示逐词词性 —— 不显示成分胶囊 / 结构 / 时态
    </div>
    <div
      v-else
      class="cards"
    >
      <div class="info c-blue">
        <div class="info-t">句子结构</div>
        <div class="info-v">{{ meta.structure || "—" }}</div>
        <span
          v-if="meta.pattern"
          class="tag"
          >{{ meta.pattern }}</span
        >
      </div>
      <div class="info c-amber">
        <div class="info-t">时态</div>
        <div class="info-v">{{ meta.tense || "—" }}</div>
      </div>
      <div class="info c-violet">
        <div class="info-t">句型</div>
        <div class="info-v">{{ meta.sentenceType || "—" }}</div>
        <span
          v-if="meta.clauseType"
          class="tag"
          >{{ meta.clauseType }}</span
        >
      </div>
      <div class="info c-rose">
        <div class="info-t">语法要点</div>
        <ul v-if="meta.keyPoints.length > 0">
          <li
            v-for="(point, index) in meta.keyPoints"
            :key="index"
          >
            {{ point }}
          </li>
        </ul>
        <div
          v-else
          class="info-v"
        >
          —
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { GrammarPanelGroup } from "~/utils/grammarPanel";
import { useCourseStore } from "~/store/course";
import {
  GRAMMAR_ROLE_THEME,
  resolveGrammarGroups,
  resolveGrammarRows,
  resolveGrammarWords,
} from "~/utils/grammarPanel";

// 只读展示: 数据全部来自当前这道题 (答题后才渲染本组件), 不改任何答题状态
const courseStore = useCourseStore();

const grammar = computed(() => courseStore.currentStatement?.grammar);
const english = computed(() => courseStore.currentStatement?.english ?? "");

const words = computed(() => resolveGrammarWords(grammar.value, english.value));
const groups = computed(() => resolveGrammarGroups(grammar.value, english.value));
const rows = computed(() => resolveGrammarRows(groups.value));

// 碎片 (isSentence: false) 只显示逐词词性, 不显示四个卡片
const isFragment = computed(() => grammar.value?.isSentence === false);

const meta = computed(() => {
  const keyPoints = grammar.value?.keyPoints;
  return {
    structure: grammar.value?.structure ?? "",
    pattern: grammar.value?.pattern ?? "",
    tense: grammar.value?.tense ?? "",
    sentenceType: grammar.value?.sentenceType ?? "",
    clauseType: grammar.value?.clauseType ?? "",
    keyPoints: Array.isArray(keyPoints) ? keyPoints : [],
  };
});

function roleTheme(group: GrammarPanelGroup) {
  return GRAMMAR_ROLE_THEME[group.role] || GRAMMAR_ROLE_THEME[""];
}

function groupStyle(group: GrammarPanelGroup): Record<string, string> {
  const theme = roleTheme(group);
  return {
    "--n": String(group.wordIndexes.length),
    "--bg": theme.bg,
    "--acc": theme.acc,
    "--ink": theme.ink,
    "--u": theme.acc, // B 方案: 下划线 / 词性文字跟随所属成分的 acc
  };
}
</script>

<style scoped>
/* 视觉规格来源: .hermes/design/grammar-effect-page.html (用户拍板的效果页), 配色与数值不要改 */
.grammar-panel {
  margin: 18px auto 0;
  max-width: 1000px;
  text-align: left;
}

.rows {
  display: flex;
  flex-direction: column;
  align-items: center;
  row-gap: 20px;
}
.sent {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: center;
  column-gap: 46px;
  row-gap: 16px;
}

/* 每个成分一个 grid: 四行 —— [成分名][胶囊 + 词][下划线][词性]。
   用**同一个 grid** 是为了让「胶囊里的词」与「下面的下划线、词性」共用列宽,
   三者天然同一条中心线。 */
.grp {
  display: grid;
  grid-template-columns: repeat(var(--n), max-content);
  column-gap: 24px;
  position: relative;
}
/* 成分名: 在胶囊上方, 与胶囊居中, 颜色与胶囊描边同色 (亮色点缀) */
.grp .name {
  grid-row: 1;
  grid-column: 1 / -1;
  justify-self: center;
  color: var(--acc);
  font-size: 12.5px;
  font-weight: 800;
  margin-bottom: 6px;
  white-space: nowrap;
  letter-spacing: 0.3px;
}
/* 胶囊: 浅彩底 + 亮色描边, 底色跨列铺满、左右各外扩 13px 当内边距 */
.grp .pill {
  grid-row: 2;
  grid-column: 1 / -1;
  margin: 0 -13px;
  background: var(--bg);
  border: 1.5px solid var(--acc);
  border-radius: 999px;
}
/* 词: 各自占一列, 压在浅彩底上, 用深色字 */
.grp .w {
  grid-row: 2;
  justify-self: center;
  align-self: center;
  position: relative;
  z-index: 1;
  color: var(--ink);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  padding: 9px 0;
  white-space: nowrap;
}
/* 下划线: 每个单词一条, 颜色 = --u (跟随所属成分的 acc) */
.grp .ul {
  grid-row: 3;
  justify-self: center;
  width: 100%;
  min-width: 26px;
  height: 3px;
  border-radius: 2px;
  background: var(--u);
  margin-top: 8px;
}
/* 词性文字: 与词、下划线同一中心线, 颜色与下划线一致 */
.grp .pp {
  grid-row: 4;
  justify-self: center;
  color: var(--u);
  font-size: 11.5px;
  font-weight: 700;
  margin-top: 5px;
  white-space: nowrap;
}

/* 裸组 / 碎片: 中性浅灰胶囊, 不声称任何成分, 也没有成分名 */
.grp.frag .pill {
  background: #f1f5f9;
  border-color: #cbd5e1;
}
.grp.frag .w {
  color: #1e293b;
}

/* 四个卡片: 等宽等高一排 —— 句子结构 / 时态 / 句型 / 语法要点 */
.cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
  align-items: stretch;
}
.info {
  border-radius: 10px;
  padding: 10px 12px;
  border: 1px solid;
  display: flex;
  flex-direction: column;
}
.c-blue {
  background: #eff6ff;
  border-color: #bfdbfe;
}
.c-amber {
  background: #fffbeb;
  border-color: #fde68a;
}
.c-violet {
  background: #f5f3ff;
  border-color: #ddd6fe;
}
.c-rose {
  background: #fff1f2;
  border-color: #fecdd3;
}
.info-t {
  font-size: 10.5px;
  font-weight: 700;
  opacity: 0.62;
  margin-bottom: 4px;
}
.info-v {
  font-size: 13.5px;
  font-weight: 800;
}
.info ul {
  margin: 0;
  padding-left: 15px;
  font-size: 12.5px;
  line-height: 1.7;
  color: #334155;
}
.tag {
  display: inline-block;
  margin-top: 5px;
  font-size: 10.5px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 999px;
  padding: 2px 8px;
  color: #334155;
  align-self: flex-start;
}
.footnote {
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  margin-top: 18px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  text-align: center;
}

@media (max-width: 900px) {
  .cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 560px) {
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>
