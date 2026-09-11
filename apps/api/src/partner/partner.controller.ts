import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { PartnerService } from "./partner.service";

@Controller("partner")
export class PartnerController {
  constructor(private readonly partnerService: PartnerService) {}

  /** 当前用户查看自己的 Partner 信息 */
  @UseGuards(AuthGuard)
  @Get("me")
  async me(@User() user: UserEntity) {
    const p = await this.partnerService.findByUserId(user.userId);
    return {
      isPartner: Boolean(p),
      commissionRateBps: p?.commissionRateBps ?? null,
      status: p?.status ?? null,
    };
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

  /** 管理员激活 Partner */
  @Permissions("admin:access")
  @UseGuards(AuthGuard)
  @Post("activate")
  async activate(@Body() dto: { userId: string; commissionRateBps?: number }) {
    return await this.partnerService.becomePartner(dto.userId, dto.commissionRateBps ?? 4000);
  }

  /** 管理员暂停 Partner (历史 referral/commission 保留, 新订单不再产生佣金) */
  @Permissions("admin:access")
  @UseGuards(AuthGuard)
  @Post("suspend")
  async suspend(@Body() dto: { userId: string }) {
    return await this.partnerService.suspendPartner(dto.userId);
  }
}
