import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, lte } from "drizzle-orm";

import { reviewRecords, statement } from "@earthworm/schema";
import { DB, DbType } from "../global/providers/db.provider";
import { AnswerReviewDto } from "./dto/answer-review.dto";

export const MIN_EASE_FACTOR = 1.3;

export interface Sm2State {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface Sm2Result extends Sm2State {
  nextReviewAt: Date;
}

/**
 * Pure SM-2 algorithm:
 * - EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), floored at 1.3
 * - quality >= 3: repetitions + 1; interval: rep 1 => 1d, rep 2 => 6d, else round(interval * EF)
 * - quality < 3: repetitions reset to 0, interval = 1 day
 * - nextReviewAt = now + interval days
 */
export function applySm2(state: Sm2State, quality: number, now: Date): Sm2Result {
  const { easeFactor, repetitions } = state;
  const q = quality;

  const newEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
  );

  let newRepetitions: number;
  let newIntervalDays: number;

  if (q >= 3) {
    newRepetitions = repetitions + 1;
    if (newRepetitions === 1) {
      newIntervalDays = 1;
    } else if (newRepetitions === 2) {
      newIntervalDays = 6;
    } else {
      newIntervalDays = Math.round(state.intervalDays * newEaseFactor);
    }
  } else {
    newRepetitions = 0;
    newIntervalDays = 1;
  }

  const nextReviewAt = new Date(now.getTime() + newIntervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor: newEaseFactor,
    intervalDays: newIntervalDays,
    repetitions: newRepetitions,
    nextReviewAt,
  };
}

@Injectable()
export class ReviewService {
  constructor(@Inject(DB) private db: DbType) {}

  async answer(userId: string, dto: AnswerReviewDto) {
    const now = new Date();
    const existing = await this.db
      .select()
      .from(reviewRecords)
      .where(and(eq(reviewRecords.userId, userId), eq(reviewRecords.statementId, dto.statementId)))
      .limit(1);

    const current = existing[0] ?? {
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
    };

    const result = applySm2(current, dto.quality, now);

    if (existing[0]) {
      const [updated] = await this.db
        .update(reviewRecords)
        .set({
          easeFactor: result.easeFactor,
          intervalDays: result.intervalDays,
          repetitions: result.repetitions,
          nextReviewAt: result.nextReviewAt,
          lastReviewedAt: now,
        })
        .where(eq(reviewRecords.id, existing[0].id))
        .returning();
      return updated;
    }

    // 新学的句子首次回答时自动进入复习库
    const [created] = await this.db
      .insert(reviewRecords)
      .values({
        userId,
        statementId: dto.statementId,
        easeFactor: result.easeFactor,
        intervalDays: result.intervalDays,
        repetitions: result.repetitions,
        nextReviewAt: result.nextReviewAt,
        lastReviewedAt: now,
      })
      .returning();
    return created;
  }

  async getTodayQueue(userId: string) {
    const now = new Date();
    return this.db
      .select({
        statementId: reviewRecords.statementId,
        chinese: statement.chinese,
        english: statement.english,
        soundmark: statement.soundmark,
      })
      .from(reviewRecords)
      .innerJoin(statement, eq(statement.id, reviewRecords.statementId))
      .where(and(eq(reviewRecords.userId, userId), lte(reviewRecords.nextReviewAt, now)))
      .orderBy(asc(reviewRecords.nextReviewAt))
      .limit(50);
  }

  async add(userId: string, statementId: string) {
    const now = new Date();
    const nextReviewAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const existing = await this.db
      .select()
      .from(reviewRecords)
      .where(and(eq(reviewRecords.userId, userId), eq(reviewRecords.statementId, statementId)))
      .limit(1);

    if (existing[0]) {
      // 已存在则重置进度
      const [updated] = await this.db
        .update(reviewRecords)
        .set({
          repetitions: 0,
          intervalDays: 1,
          nextReviewAt,
          lastReviewedAt: now,
        })
        .where(eq(reviewRecords.id, existing[0].id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(reviewRecords)
      .values({
        userId,
        statementId,
        nextReviewAt,
        lastReviewedAt: now,
      })
      .returning();
    return created;
  }
}
