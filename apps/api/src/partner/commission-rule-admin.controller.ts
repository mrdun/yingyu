import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { PartnerService } from "./partner.service";

@Controller("admin/commission-rules")
@UseGuards(AuthGuard)
export class CommissionRuleAdminController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get()
  @Permissions("admin:access")
  async list() {
    return await this.partnerService.listCommissionRules();
  }

  @Post()
  @Permissions("admin:access")
  async create(
    @Body()
    dto: {
      partnerType?: string;
      planId?: string | null;
      rateBps: number;
      status?: string;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
    },
  ) {
    return await this.partnerService.createCommissionRule(dto);
  }

  @Patch(":id")
  @Permissions("admin:access")
  async update(
    @Param("id") id: string,
    @Body()
    dto: {
      planId?: string | null;
      rateBps?: number;
      status?: string;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
    },
  ) {
    return await this.partnerService.updateCommissionRule(id, dto);
  }
}
