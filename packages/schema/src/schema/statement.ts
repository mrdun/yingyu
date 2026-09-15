import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
  grammar: jsonb("grammar").$type<StatementGrammar | null>(),
});

export const statementRelations = relations(statement, ({ one }) => ({
  course: one(course, {
    fields: [statement.courseId],
    references: [course.id],
  }),
}));
