import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { PartnerService } from "./partner.service";

/**
 * 管理端 Partner 行投影: 去掉 partners.commission_rate / commission_rate_bps 旧字段,
 * 佣金比例统一查看 /admin/commission-rules (唯一来源)。
 */
function toAdminPartnerView<T extends { commissionRate?: unknown; commissionRateBps?: unknown }>(
  row: T,
) {
  const { commissionRate: _commissionRate, commissionRateBps: _commissionRateBps, ...rest } = row;
  return rest;
}

@Controller("admin/partners")
@UseGuards(AuthGuard)
@Permissions("admin:access")
export class PartnerAdminController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get()
  @Permissions("admin:access")
  async list() {
    const rows = await this.partnerService.listPartners();
    return rows.map((row) => toAdminPartnerView(row));
  }

  @Get(":id")
  @Permissions("admin:access")
  async get(@Param("id") id: string) {
    return toAdminPartnerView(await this.partnerService.getPartner(id));
  }

  @Post(":id/approve")
  @Permissions("admin:access")
  async approve(@Param("id") id: string) {
    return await this.partnerService.approvePartner(id);
  }

  @Post(":id/reject")
  @Permissions("admin:access")
  async reject(@Param("id") id: string) {
    return await this.partnerService.rejectPartner(id);
  }

  @Post(":id/suspend")
  @Permissions("admin:access")
  async suspend(@Param("id") id: string) {
    return await this.partnerService.suspendPartner(id);
  }

  @Post(":id/activate")
  @Permissions("admin:access")
  async activate(@Param("id") id: string) {
    return await this.partnerService.activatePartner(id);
  }
}
