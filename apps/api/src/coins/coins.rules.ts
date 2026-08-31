import type { TaskType } from "./dto/check-in.dto";

/**
 * 金币规则 (纯函数, 便于单测)
 */
export const TASK_DEFS: Record<TaskType, { reward: number; label: string }> = {
  study_10: { reward: 10, label: "今日练满 10 句" },
  study_30: { reward: 25, label: "今日练满 30 句" },
  review_done: { reward: 10, label: "完成一次复习" },
  sss_once: { reward: 15, label: "今日获得一次 SSS 评级" },
  daily_check_in: { reward: 5, label: "每日打卡" },
};

export const STREAK_BONUS: Record<number, number> = {
  3: 20,
  7: 50,
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/**
 * 连续完成任务天数: 基于已完成任务的日期去重集合, 从 today 往回数, 遇断档归零。
 */
export function computeStreak(completedDates: string[], today: string): number {
  const set = new Set(completedDates);
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00.000Z`);
  for (let i = 0; i < 3650; i++) {
    const key = toDateStr(cursor);
    if (!set.has(key)) break;
    streak++;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
}

/**
 * 连击里程碑奖励: 恰好达到 3 天 +20, 7 天 +50, 其他 0。
 */
export function streakBonusFor(streak: number): number {
  return STREAK_BONUS[streak] ?? 0;
}

export interface CheckInSnapshot {
  todayStudyCount: number;
  hasSssToday: boolean;
  hasReviewToday: boolean;
  existingTask: boolean;
  /** 历史完成任务日期 (含今天之前), 用于连击计算 */
  completedDates: string[];
  /** 连击奖励是否已发 (防重复) */
  streakBonusDates: string[];
}

export interface CheckInContext {
  getSnapshot(userId: string, today: string, taskType: TaskType): Promise<CheckInSnapshot>;
  /** 写入每日任务记录, 冲突(已存在)时返回 false */
  insertDailyTask(
    userId: string,
    today: string,
    taskType: TaskType,
    rewardCoins: number,
  ): Promise<boolean>;
  /** 增加金币余额 (upsert user_coins) */
  addCoins(userId: string, amount: number): Promise<void>;
  /** 写入金币流水 */
  addTransaction(
    userId: string,
    amount: number,
    reason: string,
    relatedId: string | null,
  ): Promise<void>;
  getTodayEarned(userId: string, today: string): Promise<number>;
}

export interface CheckInResult {
  granted: boolean;
  alreadyDone: boolean;
  eligible: boolean;
  taskType: TaskType;
  rewardCoins: number;
  streakBonus: number;
  streak: number;
}

/**
 * 任务资格判定 (纯函数): 服务端根据当日真实数据验证是否达标。
 */
export function isEligible(taskType: TaskType, snapshot: CheckInSnapshot): boolean {
  switch (taskType) {
    case "study_10":
      return snapshot.todayStudyCount >= 10;
    case "study_30":
      return snapshot.todayStudyCount >= 30;
    case "review_done":
      return snapshot.hasReviewToday;
    case "sss_once":
      return snapshot.hasSssToday;
    case "daily_check_in":
      return true; // 每日打卡任务，无额外条件
    default:
      return false;
  }
}

/**
 * check-in 核心流程 (纯逻辑):
 * 1. 幂等: 同日同任务已有记录 → 不再发币;
 * 2. 资格: 服务端根据当日真实数据判定, 不信任前端;
 * 3. 连击: 今日任务入库后连击恰好达到 3/7 天时发额外奖励, 每个里程碑只发一次。
 */
export async function processCheckIn(
  ctx: CheckInContext,
  userId: string,
  taskType: TaskType,
  today: string,
): Promise<CheckInResult> {
  const snapshot = await ctx.getSnapshot(userId, today, taskType);

  if (snapshot.existingTask) {
    return {
      granted: false,
      alreadyDone: true,
      eligible: true,
      taskType,
      rewardCoins: 0,
      streakBonus: 0,
      streak: 0,
    };
  }

  if (!isEligible(taskType, snapshot)) {
    return {
      granted: false,
      alreadyDone: false,
      eligible: false,
      taskType,
      rewardCoins: 0,
      streakBonus: 0,
      streak: 0,
    };
  }

  const reward = TASK_DEFS[taskType].reward;
  const inserted = await ctx.insertDailyTask(userId, today, taskType, reward);
  if (!inserted) {
    // 并发兜底: 唯一约束冲突说明已被领取
    return {
      granted: false,
      alreadyDone: true,
      eligible: true,
      taskType,
      rewardCoins: 0,
      streakBonus: 0,
      streak: 0,
    };
  }

  await ctx.addCoins(userId, reward);
  await ctx.addTransaction(userId, reward, taskReason(taskType), null);

  // 连击奖励: 先把今天计入日期集合再计算
  const dates = new Set(snapshot.completedDates);
  dates.add(today);
  const streak = computeStreak([...dates], today);
  const bonus = streakBonusFor(streak);
  let streakGranted = 0;
  if (bonus > 0) {
    const relatedId = `streak:${streak}:${today}`;
    if (!snapshot.streakBonusDates.includes(relatedId)) {
      await ctx.addCoins(userId, bonus);
      await ctx.addTransaction(userId, bonus, "streak_bonus", relatedId);
      streakGranted = bonus;
    }
  }

  return {
    granted: true,
    alreadyDone: false,
    eligible: true,
    taskType,
    rewardCoins: reward,
    streakBonus: streakGranted,
    streak,
  };
}

const TASK_REASON: Record<TaskType, string> = {
  study_10: "daily_study",
  study_30: "daily_study",
  review_done: "daily_review",
  sss_once: "sss_rating",
  daily_check_in: "daily_check_in",
};

export function taskReason(taskType: TaskType): string {
  return TASK_DEFS[taskType] ? TASK_REASON[taskType] : "admin_grant";
}
