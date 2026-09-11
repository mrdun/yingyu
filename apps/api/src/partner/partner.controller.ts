import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { PartnerService } from "./partner.service";

@Controller("partner")
@UseGuards(AuthGuard)
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get("me")
  async me(@User() user: UserEntity) {
    const p = await this.partnerService.findByUserId(user.userId);
    return {
      isPartner: Boolean(p),
      commissionRate: p?.commissionRate ?? null,
      status: p?.status ?? null,
    };
  }

  @Get("referrals")
  async referrals(@User() user: UserEntity) {
    return await this.partnerService.listReferrals(user.userId);
  }

  @Get("commissions")
  async commissions(@User() user: UserEntity) {
    return await this.partnerService.getCommissionSummary(user.userId);
  }
}
