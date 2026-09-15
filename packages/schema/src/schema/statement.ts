import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import { customType, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { course } from "./course";

/**
 * 句子语法标注 (模型对 statement.english 的逐词标注, 存 statements.grammar)。
 *
 * - 完整句 (isSentence: true): 有 pattern / clauseType / sentenceType / tense / structure;
 *   phrases[].role 是句子成分 (主语 / 谓语 / 宾语 / 表语 / 状语 / 定语 / 连接词)。
 * - 碎片 (isSentence: false): 只有 words + role 为 null 的 phrases, 无成分 / 结构 / 时态。
 *
 * words[].pos 是中文词性 (代词 / 动词 / 名词 ...), 逐词下划线 + 词性文字用它。
 * start / end 是英文原文的**字符**下标; 实际定位用 text 在词数组里逐词匹配
 * (见客户端 utils/grammarPanel.ts): 重复词只能靠位置匹配, 不能靠文本首次出现位置。
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

/**
 * jsonb 列，但**把值原样交给驱动**（不像 drizzle 内置的 `jsonb()` 那样先 `JSON.stringify`）。
 *
 * 为什么不能用内置 `jsonb()`：
 *   内置映射会先 `JSON.stringify`，而驱动 `postgres.js` 对 jsonb 参数会把「JS 字符串」
 *   当成 **jsonb 值**再包一层 → 库里存成 `jsonb_typeof = 'string'`（双编码的 JSON 字符串），
 *   于是 `grammar->>'structure'`、`jsonb_array_length(grammar->'phrases')` 这类 SQL 全部取不到东西
 *   （只有 ORM 读回来时靠再解析一次，看着才正常 —— 所以单测能过、直接查库才发现）。
 *   实测三种写法：传对象→object（本写法） / 传字符串→string / 传字符串+`::jsonb`→仍是 string。
 *
 * 与 `scripts/grammar/ingest-lesson.py`（用 `%s::jsonb` 写）保持一致：
 * **同一列不能一半是 object 一半是 string**。守卫见
 * `apps/api/src/ai-content/tests/grammar-annotation-pipeline.spec.ts` 的
 * `jsonb_typeof = 'object'` 断言（必须用裸 SQL 查，ORM 读回来会掩盖它）。
 */
const jsonbPassthrough = customType<{
  data: StatementGrammar | null;
  driverData: unknown;
}>({
  dataType() {
    return "jsonb";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value as StatementGrammar | null;
  },
});

export const statement = pgTable("statements", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  order: integer("order").notNull(),
  chinese: text("chinese").notNull(),
  english: text("english").notNull(),
  soundmark: text("soundmark").notNull(),
  sourceType: text("source_type").default("text"), // text / audio / video
  audioUrl: text("audio_url"),
  startMs: integer("start_ms"),
  endMs: integer("end_ms"),
  courseId: text("course_id")
    .notNull()
    .references(() => course.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  grammar: jsonbPassthrough("grammar"),
});

export const statementRelations = relations(statement, ({ one }) => ({
  course: one(course, {
    fields: [statement.courseId],
    references: [course.id],
  }),
}));
