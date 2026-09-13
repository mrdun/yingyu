import { Controller, Param, Post, UseGuards } from "@nestjs/common";

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
