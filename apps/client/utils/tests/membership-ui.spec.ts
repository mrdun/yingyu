import { describe, expect, it } from "vitest";

import type { DisplayPlan } from "../membership-ui";
import {
  commissionExampleFen,
  compareWithMonthly,
  dailyPriceFen,
  describeCommissionStatus,
  describeEntitlements,
  formatYuan,
  paymentStageOf,
  pickLifetimePlan,
  pickRecommendedPlan,
} from "../membership-ui";

const monthly: DisplayPlan = {
  id: "monthly",
  name: "月度会员",
  priceFen: 1800,
  durationDays: 30,
  entitlements: [{ key: "course_access", value: "all" }],
};
const yearly: DisplayPlan = {
  id: "yearly",
  name: "年度会员",
  priceFen: 16800,
  durationDays: 365,
  entitlements: [{ key: "course_access", value: "all" }],
};
const lifetime: DisplayPlan = {
  id: "lifetime",
  name: "永久会员",
  priceFen: 19900,
  durationDays: null,
  entitlements: [{ key: "course_access", value: "all" }],
};

describe("会员页展示逻辑 (API 数据驱动)", () => {
  it("formats API prices for display", () => {
    expect(formatYuan(1800)).toBe("18");
    expect(formatYuan(19900)).toBe("199");
    expect(formatYuan(1988)).toBe("19.88");
  });

  it("derives per-day cost from API duration, ignoring lifetime", () => {
    expect(dailyPriceFen(monthly)).toBe(60);
    expect(dailyPriceFen(yearly)).toBe(46);
    expect(dailyPriceFen(lifetime)).toBeNull();
  });

  it("recommends the cheapest per-day plan from data (not a hardcoded id)", () => {
    expect(pickRecommendedPlan([monthly, yearly, lifetime])?.id).toBe("yearly");
    // 后台把年度改成更贵 → 推荐自动切换为月度
    const expensiveYearly = { ...yearly, priceFen: 99000 };
    expect(pickRecommendedPlan([monthly, expensiveYearly, lifetime])?.id).toBe("monthly");
  });

  it("does not force a recommendation when data is insufficient", () => {
    expect(pickRecommendedPlan([monthly])).toBeNull();
    expect(pickRecommendedPlan([monthly, lifetime])).toBeNull();
  });

  it("finds the lifetime plan by duration instead of a hardcoded id", () => {
    expect(pickLifetimePlan([monthly, lifetime])?.name).toBe("永久会员");
    expect(pickLifetimePlan([{ ...lifetime, id: "forever", name: "终身" }])?.id).toBe("forever");
    expect(pickLifetimePlan([monthly, yearly])).toBeNull();
  });

  it("compares a longer plan with monthly using API prices", () => {
    // 365 天 ≈ 12.17 个月 → 月付等价 21900 分, 省 5100 分 (23%)
    expect(compareWithMonthly(yearly, monthly)).toEqual({ savedFen: 5100, discountPercent: 23 });
    // 年度比 12 个月更贵时不展示"省xx"
    expect(compareWithMonthly({ ...yearly, priceFen: 30000 }, monthly)).toBeNull();
  });

  it("describes API entitlements and falls back for unknown keys", () => {
    expect(describeEntitlements([{ key: "course_access", value: "all" }])).toEqual([
      "全部课程无限畅学",
    ]);
    expect(
      describeEntitlements([
        { key: "new_feature", value: "on" },
        { key: "ai_daily_quota", value: "10" },
      ]),
    ).toEqual(["new_feature: on", "每日 AI 生成额度 10 次"]);
  });

  it("computes commission examples from the API rate (no hardcoded 40%)", () => {
    expect(commissionExampleFen(1800, 4000)).toBe(720);
    expect(commissionExampleFen(1800, 3000)).toBe(540);
    expect(commissionExampleFen(1800, null)).toBeNull();
    expect(commissionExampleFen(1800, 0)).toBeNull();
  });

  it("maps order status to payment UI stage", () => {
    expect(paymentStageOf("pending")).toBe("waiting");
    expect(paymentStageOf("processing")).toBe("waiting");
    expect(paymentStageOf("paid")).toBe("success");
    expect(paymentStageOf("failed")).toBe("failed");
    expect(paymentStageOf("expired")).toBe("expired");
    expect(paymentStageOf("cancelled")).toBe("expired");
  });

  it("explains every commission status from the backend", () => {
    for (const status of ["holding", "pending", "payable", "paid", "reversed"]) {
      expect(describeCommissionStatus(status).label).not.toBe(status);
    }
    expect(describeCommissionStatus("holding").label).toBe("保护期内");
    expect(describeCommissionStatus("unknown_status").label).toBe("unknown_status");
  });
});
