import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { PartnerService } from "./partner.service";

@Controller("admin/partners")
@UseGuards(AuthGuard)
export class PartnerAdminController {
  constructor(private readonly partnerService: PartnerService) {}

  @Get()
  @Permissions("admin:access")
  async list() {
    return await this.partnerService.listPartners();
  }

  @Get(":id")
  @Permissions("admin:access")
  async get(@Param("id") id: string) {
    return await this.partnerService.getPartner(id);
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
