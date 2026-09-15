/**
 * 句子语法标注（API 返回的 `statements.grammar` 列的 DTO）。
 *
 * ⚠️ 这是**客户端自己的 DTO 副本**，不是从 `@earthworm/schema` 导入的：
 * 本仓约定 `apps/client` 不声明任何 `@earthworm/*` 工作区依赖（`apps/admin` 也一样），
 * 从 client 里 import 工作区包会让 `nuxi typecheck` 报 TS2307。
 * 服务端那份真值在 `packages/schema/src/schema/statement.ts` 的 `StatementGrammar`；
 * **改字段时两边一起改**（服务端加列 → 这里加字段）。
 *
 * 形状说明:
 * - 完整句 (`isSentence: true`): 有 `pattern` / `clauseType` / `sentenceType` / `tense` / `structure`；
 *   `phrases[].role` 是句子成分（主语 / 谓语 / 宾语 / 表语 / 状语 / 定语 / 连接词）。
 * - 碎片 (`isSentence: false`): 只有 `words` + `role` 为 null 的 `phrases`，无成分 / 结构 / 时态。
 * - `words[].pos` 是中文词性（代词 / 动词 / 名词 …），逐词下划线 + 词性文字用它。
 * - `start` / `end` 是英文原文的**字符**下标；实际定位用 `text` 在词数组里逐词匹配
 *   （见 `~/utils/grammarPanel`）：重复词只能靠位置匹配，不能靠「文本首次出现位置」。
 */
export interface StatementGrammar {
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
