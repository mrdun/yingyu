import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { isAiContentDevBypassEnabled } from "../common/env";
import { AuthGuard } from "./auth.guard";

/**
 * AI 内容生成等敏感接口 (`/ai-content/*`) 的守卫。
 *
 * 规则 (默认安全, 逐条):
 * 1. 非生产 **且** 显式设置 `AI_CONTENT_DEV_BYPASS=true|1` → 放行 (仅本地调试 AI 建课时临时打开);
 * 2. 非生产但**没设**该开关 (默认) → 走 `super.canActivate()`, 要求 `@Permissions("admin:access")`;
 * 3. 生产 → 一律走 `super.canActivate()`, **即使误设了该开关也不放行** (生产不得被该开关削弱)。
 *
 * 为什么默认安全: 原来这里对**所有**非生产实例无条件 `return true`, 于是任何 dev / 预览 /
 * 局域网可达的实例, 任何人 (含未登录游客) 都能触发 AI 建课 —— 既烧 LLM/Whisper 额度, 又往库里写草稿。
 * 改成显式开关后, "忘了配置" 的后果从 "对全世界开放" 变成 "需要管理员令牌", 漏配不再等于裸奔。
 */
@Injectable()
export class AdminOrDevGuard extends AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isAiContentDevBypassEnabled()) {
      return true;
    }
    return await super.canActivate(context);
  }
}
