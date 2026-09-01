import { createId } from "@paralleldrive/cuid2";
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * 看图学词：图片 + 单词 + 释义 + 音标的词卡（对标句乐部「看图学词」）。
 * 首版平铺 + order 排序；后续可加 word_set 分组。
 */
export const pictureWord = pgTable("picture_words", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => createId()),
  word: text("word").notNull(),
  chinese: text("chinese").notNull(),
  soundmark: text("soundmark").default(""),
  imageUrl: text("image_url").notNull(),
  exampleSentence: text("example_sentence").default(""),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").$onUpdateFn(() => new Date()),
});
