import {
  CheckInContext,
  CheckInSnapshot,
  computeStreak,
  isEligible,
  processCheckIn,
  streakBonusFor,
  taskReason,
} from "../coins.rules";

const DAY = 24 * 60 * 60 * 1000;
const TODAY = "2026-08-29";

function daysAgo(n: number): string {
  return new Date(new Date(`${TODAY}T00:00:00.000Z`).getTime() - n * DAY)
    .toISOString()
    .split("T")[0];
}

const BASE: CheckInSnapshot = {
  todayStudyCount: 0,
  hasSssToday: false,
  hasReviewToday: false,
  existingTask: false,
  completedDates: [],
  streakBonusDates: [],
};

function setup(snapshotOverrides: Partial<CheckInSnapshot> = {}) {
  const state = {
    snapshot: { ...BASE, ...snapshotOverrides } as CheckInSnapshot,
    coins: 0,
    transactions: [] as { amount: number; reason: string; relatedId: string | null }[],
    conflictOnce: false,
  };
  const ctx = {
    async getSnapshot() {
      return { ...state.snapshot };
    },
    async insertDailyTask(_userId: string, today: string, _taskType: string, _rewardCoins: number) {
      if (state.conflictOnce) return false;
      state.snapshot = {
        ...state.snapshot,
        completedDates: [...state.snapshot.completedDates, today],
      };
      return true;
    },
    async addCoins(_userId: string, amount: number) {
      state.coins += amount;
    },
    async addTransaction(
      _userId: string,
      amount: number,
      reason: string,
      relatedId: string | null,
    ) {
      state.transactions.push({ amount, reason, relatedId });
    },
    async getTodayEarned() {
      return state.transactions.reduce((s, t) => s + t.amount, 0);
    },
  } as any;
  return { ctx, state };
}

describe("任务资格判定 (服务端验证当日真实数据)", () => {
  it("study_10: 练满 10 句达标", () => {
    expect(isEligible("study_10", { ...BASE, todayStudyCount: 10 })).toBe(true);
    expect(isEligible("study_10", { ...base(9) })).toBe(false);
  });

  it("study_30: 练满 30 句达标", () => {
    expect(isEligible("study_30", { ...base(30) })).toBe(true);
    expect(isEligible("study_30", { ...base(29) })).toBe(false);
  });

  it("review_done: 今日有复习记录才达标", () => {
    expect(isEligible("review_done", { ...BASE, hasReviewToday: true })).toBe(true);
    expect(isEligible("review_done", BASE)).toBe(false);
  });

  it("sss_once: 今日有 SSS 评级才达标", () => {
    expect(isEligible("sss_once", { ...BASE, hasSssToday: true })).toBe(true);
    expect(isEligible("sss_once", BASE)).toBe(false);
  });
});

function base(studyCount: number): CheckInSnapshot {
  return { ...BASE, todayStudyCount: studyCount };
}

describe("连击计算", () => {
  it("从今天往回数连续天数", () => {
    expect(computeStreak([TODAY, daysAgo(1), daysAgo(2)], TODAY)).toBe(3);
    expect(computeStreak([TODAY, daysAgo(2)], TODAY)).toBe(1);
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it("里程碑奖励: 3 天 +20, 7 天 +50", () => {
    expect(streakBonusFor(3)).toBe(20);
    expect(streakBonusFor(4)).toBe(0);
    expect(streakBonusFor(7)).toBe(50);
  });
});

describe("check-in 全流程", () => {
  it("金币发放规则: study_10=10, study_30=25, review_done=10, sss_once=15", async () => {
    const a = await processCheckIn(setup({ todayStudyCount: 35 }).ctx, "u1", "study_10", TODAY);
    expect(a).toMatchObject({ granted: true, rewardCoins: 10 });

    const b = await processCheckIn(
      setup({ todayStudyCount: 35 }).ctx as any,
      "u1",
      "study_30",
      TODAY,
    );
    expect(b.rewardCoins).toBe(25);

    const c = await processCheckIn(
      setup({ hasReviewToday: true }).ctx as any,
      "u1",
      "review_done",
      TODAY,
    );
    expect(c.rewardCoins).toBe(10);

    const d = await processCheckIn(
      setup({ hasSssToday: true }).ctx as any,
      "u1",
      "sss_once",
      TODAY,
    );
    expect(d.rewardCoins).toBe(15);
  });

  it("不达标不发币", async () => {
    const { ctx, state } = setup(base(5));
    const r = await processCheckIn(ctx as any, "u1", "study_10", TODAY);
    expect(r).toMatchObject({ granted: false, eligible: false, rewardCoins: 0 });
    expect(state.transactions).toHaveLength(0);
  });

  it("幂等: 同日同任务重复 check-in 不重复发币", async () => {
    const { ctx, state } = setup(base(12));
    const first = await processCheckIn(ctx as any, "u1", "study_10", TODAY);
    expect(first.granted).toBe(true);
    const coinsAfterFirst = state.coins;

    state.snapshot = { ...state.snapshot, existingTask: true };
    const second = await processCheckIn(ctx as any, "u1", "study_10", TODAY);
    expect(second.granted).toBe(false);
    expect(second.alreadyDone).toBe(true);
    expect(state.coins).toBe(coinsAfterFirst);
    expect(state.transactions.filter((t) => t.reason === "daily_study")).toHaveLength(1);
  });

  it("并发兜底: 任务表唯一约束冲突时返回 alreadyDone 且不发币", async () => {
    const { ctx, state } = setup(base(12));
    state.conflictOnce = true;
    const r = await processCheckIn(ctx as any, "u1", "study_10", TODAY);
    expect(r.alreadyDone).toBe(true);
    expect(state.coins).toBe(0);
    expect(state.transactions).toHaveLength(0);
  });

  it("连续 3 天完成任务: 额外 +20, 同日只发一次", async () => {
    const { ctx, state } = setup({
      ...BASE,
      todayStudyCount: 12,
      completedDates: [daysAgo(1), daysAgo(2)],
    });
    const r = await processCheckIn(ctx as any, "u1", "study_10", TODAY);
    expect(r.streak).toBe(3);
    expect(r.streakBonus).toBe(20);
    expect(state.coins).toBe(10 + 20);

    // 同日第二个任务: 连击奖励已发 (relatedId 相同) → 不重复
    state.snapshot = {
      ...state.snapshot,
      hasReviewToday: true,
      streakBonusDates: ["streak:3:" + TODAY],
    };
    const r2 = await processCheckIn(ctx as any, "u1", "review_done", TODAY);
    expect(r2.streakBonus).toBe(0);
    expect(state.coins).toBe(40);
  });

  it("连续 7 天完成任务 → 额外 +50", async () => {
    const { ctx, state } = setup({
      ...BASE,
      completedDates: [1, 2, 3, 4, 5, 6].map(daysAgo),
      hasSssToday: true,
    });
    const r = await processCheckIn(ctx as any, "u1", "sss_once", TODAY);
    expect(r.streak).toBe(7);
    expect(r.streakBonus).toBe(50);
    expect(state.coins).toBe(65);
  });

  it("断档归零: 不发里程碑奖励", async () => {
    const { ctx, state } = setup({
      ...BASE,
      todayStudyCount: 12,
      completedDates: [daysAgo(1), daysAgo(3)],
    });
    const r = await processCheckIn(ctx as any, "u1", "study_10", TODAY);
    expect(r.streak).toBe(2);
    expect(r.streakBonus).toBe(0);
    expect(state.coins).toBe(10);
  });

  it("reason 映射", () => {
    expect(taskReason("study_10")).toBe("daily_study");
    expect(taskReason("study_30")).toBe("daily_study");
    expect(taskReason("review_done")).toBe("daily_review");
    expect(taskReason("sss_once")).toBe("sss_rating");
  });
});
