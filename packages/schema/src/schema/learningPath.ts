import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { coursePack } from "./coursePack";

/**
 * 学习路线：把若干课程包组织成「新手 → 进阶」的有序路径（对标句乐部「学习路线 v2」）。
 */
export const learningPath = pgTable("learning_paths", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  title: text("title").notNull(),
  description: text("description").default(""),
  cover: text("cover"),
  order: integer("order").notNull().default(0),
  isPublished: boolean("is_published").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
});

/**
 * 学习路线项：路线与课程包的关联（带顺序与可选阶段名）。
 */
export const learningPathItem = pgTable(
  "learning_path_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    learningPathId: text("learning_path_id")
      .notNull()
      .references(() => learningPath.id),
    coursePackId: text("course_pack_id")
      .notNull()
      .references(() => coursePack.id),
    order: integer("order").notNull().default(0),
    stage: text("stage").default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
  },
  (t) => ({
    unq: unique().on(t.learningPathId, t.coursePackId),
  }),
);

export const learningPathRelations = relations(learningPath, ({ many }) => ({
  items: many(learningPathItem),
}));

export const learningPathItemRelations = relations(learningPathItem, ({ one }) => ({
  learningPath: one(learningPath, {
    fields: [learningPathItem.learningPathId],
    references: [learningPath.id],
  }),
  coursePack: one(coursePack, {
    fields: [learningPathItem.coursePackId],
    references: [coursePack.id],
  }),
}));
