import { createId } from "@paralleldrive/cuid2";
import { relations } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { course } from "./course";

export const coursePack = pgTable("course_packs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  order: integer("order").notNull(),
  title: text("title").notNull(),
  description: text("description").default(""),
  isFree: boolean("is_free"),
  cover: text("cover"),
  creatorId: text("creator_id").notNull(),
  shareLevel: text("share_level").default("private"),
  status: text("status").notNull().default("draft"), // draft / review / published / archived
  source: text("source").notNull().default("manual"), // manual / ai / subtitle / audio / import
  accessLevel: text("access_level").notNull().default("membership"), // free / membership
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
});

export const coursePackRelations = relations(coursePack, ({ many }) => ({
  courses: many(course),
}));
