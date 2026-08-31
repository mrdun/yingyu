import { getHttp } from "./http";

export type CoinTaskType = "study_10" | "study_30" | "review_done" | "sss_once" | "daily_check_in";

export interface CoinBalance {
  coins: number;
  todayEarned: number;
}

export interface TodayTask {
  taskType: CoinTaskType;
  label: string;
  rewardCoins: number;
  target: number;
  current: number;
  goalMet: boolean;
  claimed: boolean;
}

export interface TodayTasksResponse {
  tasks: TodayTask[];
}

export interface CheckInResponse {
  granted: boolean;
  alreadyDone: boolean;
  eligible: boolean;
  taskType: string;
  rewardCoins: number;
  streakBonus: number;
  streak: number;
}

export async function fetchCoinBalance() {
  const http = getHttp();
  return await http<CoinBalance>("/coins/balance", {
    method: "get",
  });
}

export async function fetchTodayTasks() {
  const http = getHttp();
  return await http<TodayTasksResponse>("/coins/tasks", {
    method: "get",
  });
}

export async function checkInTask(taskType: CoinTaskType) {
  const http = getHttp();
  return await http<CheckInResponse>("/coins/check-in", {
    method: "post",
    body: { taskType },
  });
}

export async function fetchCheckInHistory() {
  const http = getHttp();
  return await http<{ dates: string[] }>("/coins/check-in-history", {
    method: "get",
  });
}
