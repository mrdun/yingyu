import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { PartnerService } from "./partner.service";

@Controller("admin/commissions")
@UseGuards(AuthGuard)
@Permissions("admin:access")
export class CommissionAdminController {
  constructor(private readonly partnerService: PartnerService) {}

  /** 手动触发: 退款保护期结束的 holding 佣金 → pending (幂等, 未来可接 Cron) */
  @Post("confirm")
  @Permissions("admin:access")
  async confirm() {
    return await this.partnerService.confirmExpiredCommission();
  }

  /**
   * 佣金流水列表 (只读, 供管理后台「佣金管理」页使用)。
   *
   * 分页默认 page=1 / pageSize=20, pageSize 上限 100 (与 /admin/users 等接口一致);
   * 可选 status 过滤, 取值以 schema 的 commission_records.status 约束为准:
   * holding / pending / payable / paid / reversed。
   * 只读接口: 不改动佣金状态, 状态推进仍走下面 3 个 POST。
   */
  @Get()
  @Permissions("admin:access")
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    return await this.partnerService.listCommissions({ page: p, pageSize: ps, status });
  }

  /** pending → payable (满足结算条件) */
  @Post(":id/payable")
  @Permissions("admin:access")
  async payable(@Param("id") id: string) {
    return await this.partnerService.markCommissionPayable(id);
  }

  /** payable → paid (管理员结算, 不含提现) */
  @Post(":id/settle")
  @Permissions("admin:access")
  async settle(@Param("id") id: string) {
    return await this.partnerService.settleCommission(id);
  }
}
