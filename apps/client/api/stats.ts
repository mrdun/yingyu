import { getHttp } from "./http";

export interface StatsOverview {
  totalLearnDays: number;
  totalStatements: number;
  totalLearnDurationSeconds: number;
  reviewStreak: number;
  masteredCount: number;
}

export interface DailyStat {
  date: string;
  statements: number;
  durationSeconds: number;
}

export async function fetchStatsOverview() {
  const http = getHttp();
  return await http<StatsOverview>("/stats/overview", {
    method: "get",
  });
}

export async function fetchStatsDaily(days = 30) {
  const http = getHttp();
  return await http<DailyStat[]>("/stats/daily", {
    method: "get",
    params: { days },
  });
}
