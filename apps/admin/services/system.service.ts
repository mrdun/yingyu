import type { HealthReport } from "~/types/admin";

import { adminApi, getHttpStatus } from "./admin-api";

/**
 * 系统健康检查 (GET /health, 后端无鉴权)。
 *
 * 注意: 后端在 database 失败时返回 **503 + 完整报告体**。
 * 503 会被 HTTP 层 reject, 但报告本身是有效数据 —— 这里把 503 的报告体取出来正常渲染,
 * 否则"数据库挂了"这个最关键的信息反而在页面上消失。
 */
export async function fetchSystemHealth(): Promise<HealthReport> {
  try {
    return await adminApi.get<HealthReport>("/health", { auth: false });
  } catch (error) {
    const body = (error as { data?: unknown }).data;
    if (getHttpStatus(error) === 503 && isHealthReport(body)) {
      return body;
    }
    throw error;
  }
}

/** 宽松校验: 只要求具备渲染所需的最小字段, 不信任网络返回值 */
export function isHealthReport(value: unknown): value is HealthReport {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<HealthReport>;
  if (typeof candidate.status !== "string") return false;
  if (!candidate.checks || typeof candidate.checks !== "object") return false;
  return true;
}
