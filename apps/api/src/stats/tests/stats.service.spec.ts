import { Test } from "@nestjs/testing";

import { DB, DbType } from "../../global/providers/db.provider";
import { buildDailySeries, computeReviewStreak, StatsService } from "../stats.service";

const DAY = 24 * 60 * 60 * 1000;

function dateStr(d: Date) {
  return d.toISOString().split("T")[0];
}

const TODAY = new Date("2026-08-29T12:00:00.000Z");

describe("computeReviewStreak", () => {
  it("counts consecutive days back from today", () => {
    const dates = [0, 1, 2, 3].map((i) => dateStr(new Date(TODAY.getTime() - i * DAY)));
    expect(computeReviewStreak(dates, TODAY)).toBe(4);
  });

  it("counts from yesterday when today has no record", () => {
    const dates = [1, 2, 3].map((i) => dateStr(new Date(TODAY.getTime() - i * DAY)));
    expect(computeReviewStreak(dates, TODAY)).toBe(3);
  });

  it("returns 0 when neither today nor yesterday has a record", () => {
    const dates = [2, 3].map((i) => dateStr(new Date(TODAY.getTime() - i * DAY)));
    expect(computeReviewStreak(dates, TODAY)).toBe(0);
  });

  it("resets to 0 at a gap in the middle", () => {
    // 今天、昨天连续, 前天断档, 大前天有记录 → 连续 2 天
    const dates = [0, 1, 3, 4].map((i) => dateStr(new Date(TODAY.getTime() - i * DAY)));
    expect(computeReviewStreak(dates, TODAY)).toBe(2);
  });

  it("dedupes duplicate dates", () => {
    const d = dateStr(new Date(TODAY.getTime() - DAY));
    expect(computeReviewStreak([d, d, d], TODAY)).toBe(1);
  });

  it("returns 0 for empty records", () => {
    expect(computeReviewStreak([], TODAY)).toBe(0);
  });
});

describe("buildDailySeries", () => {
  it("fills missing days with zero and returns N days", () => {
    const d1 = dateStr(new Date(TODAY.getTime() - 2 * DAY));
    const series = buildDailySeries(3, TODAY, { [d1]: 5 }, {});
    expect(series).toHaveLength(3);
    expect(series[0].date).toBe(d1);
    expect(series[0].statements).toBe(5);
    expect(series[0].durationSeconds).toBe(0);
    expect(series[1].statements).toBe(0);
    expect(series[2].date).toBe(dateStr(TODAY));
    expect(series[2].statements).toBe(0);
  });

  it("merges statements and durations by date", () => {
    const d1 = dateStr(TODAY);
    const series = buildDailySeries(1, TODAY, { [d1]: 3 }, { [d1]: 90 });
    expect(series[0]).toEqual({ date: d1, statements: 3, durationSeconds: 90 });
  });
});

describe("StatsService", () => {
  let service: StatsService;

  function makeDb(responses: unknown[]) {
    const db: Record<string, any> = {};
    db.select = jest.fn().mockReturnValue(db);
    db.from = jest.fn().mockReturnValue(db);
    db.where = jest.fn();
    db.where.mockImplementation(() => {
      const result: any = Promise.resolve(responses.shift());
      // 支持 .where(...).groupBy(...) 链式写法
      result.groupBy = () => result;
      return result;
    });
    return db as unknown as DbType;
  }

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [StatsService, { provide: DB, useValue: {} as DbType }],
    }).compile();
    service = moduleRef.get(StatsService);
  });

  it("aggregates overview totals", async () => {
    const db = makeDb([
      [{ totalLearnDays: "3", totalStatements: "42" }],
      [{ total: "7200" }],
      [{ lastReviewedAt: new Date() }, { lastReviewedAt: new Date(Date.now() - DAY) }],
      [{ total: "7" }],
    ]);
    (service as any).db = db;

    const result = await service.getOverview("u1");

    expect(result.totalLearnDays).toBe(3);
    expect(result.totalStatements).toBe(42);
    expect(result.totalLearnDurationSeconds).toBe(7200);
    expect(result.reviewStreak).toBe(2);
    expect(result.masteredCount).toBe(7);
  });

  it("handles empty overview data", async () => {
    const db = makeDb([
      [{ totalLearnDays: "0", totalStatements: "0" }],
      [{ total: "0" }],
      [],
      [{ total: "0" }],
    ]);
    (service as any).db = db;

    const result = await service.getOverview("u1");
    expect(result.reviewStreak).toBe(0);
    expect(result.totalStatements).toBe(0);
  });

  it("builds daily series with zero-filled missing days", async () => {
    const yesterday = dateStr(new Date(Date.now() - DAY));
    const db = makeDb([[{ day: yesterday, statements: "5" }], [{ date: yesterday, total: "120" }]]);
    (service as any).db = db;

    const series = await service.getDaily("u1", 3);

    expect(series).toHaveLength(3);
    expect(series[2].date).toBe(dateStr(new Date()));
    expect(series[2].statements).toBe(0);
    const yRow = series.find((s) => s.date === yesterday);
    expect(yRow?.statements).toBe(5);
    expect(yRow?.durationSeconds).toBe(120);
  });
});
