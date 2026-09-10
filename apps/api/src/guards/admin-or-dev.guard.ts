import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { isProduction } from "../common/env";
import { AuthGuard } from "./auth.guard";

/**
 * AI 内容生成等敏感接口的守卫:
 * - 非生产环境: 放行 (保留开发环境调试方式)
 * - 生产环境: 委托 AuthGuard, 强制要求 @Permissions("admin:access")
 */
@Injectable()
export class AdminOrDevGuard extends AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isProduction()) {
      return true;
    }
    return await super.canActivate(context);
  }
}
