import { HttpException } from "@nestjs/common";
import { Test } from "@nestjs/testing";

import { DB, DbType } from "../../global/providers/db.provider";
import { applySm2, ReviewService } from "../review.service";

const NOW = new Date("2026-08-29T00:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

describe("applySm2 (SM-2 algorithm)", () => {
  it("first answer with quality >= 3 sets interval to 1 day", () => {
    const r = applySm2({ easeFactor: 2.5, intervalDays: 0, repetitions: 0 }, 4, NOW);
    expect(r.repetitions).toBe(1);
    expect(r.intervalDays).toBe(1);
    expect(daysBetween(NOW, r.nextReviewAt)).toBe(1);
  });

  it("second consecutive success sets interval to 6 days", () => {
    const r = applySm2({ easeFactor: 2.5, intervalDays: 1, repetitions: 1 }, 4, NOW);
    expect(r.repetitions).toBe(2);
    expect(r.intervalDays).toBe(6);
    expect(daysBetween(NOW, r.nextReviewAt)).toBe(6);
  });

  it("third success multiplies interval by ease factor (rounded)", () => {
    // q=4: EF' = 2.5 + (0.1 - 1*(0.08+0.02)) = 2.5 ; round(6*2.5) = 15
    const r = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 4, NOW);
    expect(r.easeFactor).toBeCloseTo(2.5);
    expect(r.repetitions).toBe(3);
    expect(r.intervalDays).toBe(15);
    expect(daysBetween(NOW, r.nextReviewAt)).toBe(15);
  });

  it("quality 5 increases ease factor by 0.1", () => {
    const r = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 5, NOW);
    expect(r.easeFactor).toBeCloseTo(2.6);
  });

  it("quality 3 decreases ease factor (0.1 - 2*0.12 = -0.14)", () => {
    const r = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 2 }, 3, NOW);
    expect(r.easeFactor).toBeCloseTo(2.36);
    expect(r.intervalDays).toBe(Math.round(6 * 2.36)); // 14
  });

  it("quality 0 decreases ease factor the most but never below 1.3", () => {
    const r = applySm2({ easeFactor: 2.5, intervalDays: 6, repetitions: 3 }, 0, NOW);
    expect(r.easeFactor).toBeCloseTo(2.5 - 0.8); // 1.7
    expect(r.easeFactor).toBeGreaterThanOrEqual(1.3);
  });

  it("ease factor floors at 1.3", () => {
    let state = { easeFactor: 1.6, intervalDays: 10, repetitions: 4 };
    for (let i = 0; i < 10; i++) {
      state = applySm2(state, 0, NOW);
    }
    expect(state.easeFactor).toBeCloseTo(1.3);
  });

  it("quality < 3 resets repetitions to 0 and interval to 1 day", () => {
    for (const q of [0, 1, 2]) {
      const r = applySm2({ easeFactor: 2.5, intervalDays: 15, repetitions: 3 }, q, NOW);
      expect(r.repetitions).toBe(0);
      expect(r.intervalDays).toBe(1);
      expect(daysBetween(NOW, r.nextReviewAt)).toBe(1);
    }
  });
});

describe("review service", () => {
  let service: ReviewService;
  const dbMock: Record<string, jest.Mock> = {};

  function makeChainedDb() {
    const chain = () => {
      const c: any = {};
      const methods = [
        "select",
        "from",
        "where",
        "limit",
        "insert",
        "values",
        "update",
        "set",
        "returning",
        "innerJoin",
        "orderBy",
      ];
      for (const m of methods) {
        c[m] = jest.fn().mockReturnValue(c);
      }
      return c;
    };
    return chain();
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewService, { provide: DB, useValue: dbMock as unknown as DbType }],
    }).compile();
    service = moduleRef.get(ReviewService);
  });

  it("first answer on unseen statement inserts a new review record", async () => {
    const db = makeChainedDb() as any;
    db.select.mockReturnValue(db);
    db.limit.mockResolvedValueOnce([]); // no existing record
    db.returning.mockResolvedValueOnce([{ id: "r1", repetitions: 1, intervalDays: 1 }]);
    (service as any).db = db;

    const result = await service.answer("u1", { statementId: "s1", quality: 4 });

    expect(db.insert).toHaveBeenCalled();
    expect(result.repetitions).toBe(1);
    expect(result.intervalDays).toBe(1);
  });

  it("answering wrong resets an existing record's progress", async () => {
    const db = makeChainedDb() as any;
    db.limit.mockResolvedValueOnce([
      { id: "r1", easeFactor: 2.5, intervalDays: 15, repetitions: 3 },
    ]);
    db.returning.mockResolvedValueOnce([{ id: "r1", repetitions: 0, intervalDays: 1 }]);
    (service as any).db = db;

    const result = await service.answer("u1", { statementId: "s1", quality: 1 });

    expect(db.update).toHaveBeenCalled();
    expect(result.repetitions).toBe(0);
    expect(result.intervalDays).toBe(1);
  });
});
