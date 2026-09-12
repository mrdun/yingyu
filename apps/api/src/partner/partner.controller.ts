import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { PartnerService } from "./partner.service";

@Controller("partner")
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  /**
   * Partner 视图统一投影。
   * 佣金信息只来自 partner_commission_rules, 不返回 partners.commission_rate 旧字段。
   */
  private async buildPartnerView(userId: string) {
    const p = await this.partnerService.findByUserId(userId);
    const commission = await this.partnerService.getEffectiveCommission();
    return {
      isPartner: Boolean(p),
      status: p?.status ?? null,
      referralCode: p?.referralCode ?? null,
      commission,
    };
  }

  /** 当前用户查看自己的 Partner 信息 */
  @UseGuards(AuthGuard)
  @Get("me")
  async me(@User() user: UserEntity) {
    return await this.buildPartnerView(user.userId);
  }

  /** 当前用户查看自己的邀请列表 */
  @UseGuards(AuthGuard)
  @Get("referrals")
  async referrals(@User() user: UserEntity) {
    return await this.partnerService.listReferrals(user.userId);
  }

  /** 当前用户查看自己的佣金汇总 */
  @UseGuards(AuthGuard)
  @Get("commissions")
  async commissions(@User() user: UserEntity) {
    return await this.partnerService.getCommissionSummary(user.userId);
  }

  /** 用户用推广码归因 (当前用户被归因到某个 Partner) */
  @UseGuards(AuthGuard)
  @Post("attribute")
  async attribute(@User() user: UserEntity, @Body() dto: { referralCode: string }) {
    return await this.partnerService.attributeReferral(dto.referralCode, user.userId);
  }

  /** 用户申请成为 Partner (lifetime 会员) → pending */
  @UseGuards(AuthGuard)
  @Post("apply")
  async apply(@User() user: UserEntity) {
    await this.partnerService.apply(user.userId);
    return await this.buildPartnerView(user.userId);
  }
}
