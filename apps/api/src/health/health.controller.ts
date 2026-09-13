import { getRedisConnectionToken } from "@nestjs-modules/ioredis";
import { Controller, Get, Inject, Optional, Res, UseGuards } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { Response } from "express";

import { DB, DbType } from "../global/providers/db.provider";
import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { LogtoService } from "../logto/logto.service";

/** 单个依赖检查超时 (毫秒): 健康检查必须快速返回, 不能被慢依赖拖住 */
const CHECK_TIMEOUT_MS = 3000;

export type DependencyState = "ok" | "fail" | "skipped";

export interface HealthReport {
  status: "ok" | "degraded" | "fail";
  version: string;
  env: string;
  checks: {
    database: DependencyState;
    redis: DependencyState;
    logto: DependencyState;
  };
  details?: Record<string, string>;
  timestamp: string;
}

export async function withTimeout<T>(
  task: Promise<T>,
  label: string,
  timeoutMs: number = CHECK_TIMEOUT_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 健康检查 (供负载均衡 / 发布 smoke test 使用, 无需登录)。
 *
 * - database 失败 → 503 (无法提供业务, 必须摘流量)
 * - redis / logto 失败 → 200 + degraded (部分功能受影响, 但可继续服务)
 */
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: DbType,
    @Optional() @Inject(getRedisConnectionToken()) private readonly redis?: any,
    @Optional() private readonly logto?: LogtoService,
  ) {}

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthReport> {
    const details: Record<string, string> = {};
    const checks: HealthReport["checks"] = {
      database: "fail",
      redis: "skipped",
      logto: "skipped",
    };

    try {
      await withTimeout(this.db.execute(sql`select 1`), "database");
      checks.database = "ok";
    } catch (error) {
      details.database = (error as Error).message;
    }

    if (this.redis) {
      try {
        await withTimeout(Promise.resolve(this.redis.ping()), "redis");
        checks.redis = "ok";
      } catch (error) {
        checks.redis = "fail";
        details.redis = (error as Error).message;
      }
    }

    if (this.logto) {
      try {
        const token = await withTimeout(this.logto.fetchToken(), "logto");
        checks.logto = token ? "ok" : "fail";
      } catch (error) {
        checks.logto = "fail";
        details.logto = (error as Error).message;
      }
    }

    const status: HealthReport["status"] =
      checks.database !== "ok"
        ? "fail"
        : checks.redis === "fail" || checks.logto === "fail"
          ? "degraded"
          : "ok";
    if (status === "fail") {
      res.status(503);
    }

    return {
      status,
      version: process.env.RELEASE_VERSION ?? "unknown",
      env: process.env.NODE_ENV ?? "development",
      checks,
      ...(Object.keys(details).length > 0 ? { details } : {}),
      timestamp: new Date().toISOString(),
    };
  }
}
