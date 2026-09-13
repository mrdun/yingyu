import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { PlanInput, PlansService } from "./plans.service";

@Controller("admin/plans")
@UseGuards(AuthGuard)
@Permissions("admin:access")
export class AdminPlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  @Permissions("admin:access")
  async list() {
    return await this.plansService.findAll();
  }

  /** 商业化健康检查: plans 为空/无在售方案时返回明确告警 */
  @Get("health")
  @Permissions("admin:access")
  async health() {
    return await this.plansService.getHealth();
  }

  @Post()
  @Permissions("admin:access")
  async create(@Body() dto: PlanInput & { id: string; name: string; priceFen: number }) {
    return await this.plansService.createPlan(dto);
  }

  @Patch(":id")
  @Permissions("admin:access")
  async update(@Param("id") id: string, @Body() dto: PlanInput) {
    return await this.plansService.updatePlan(id, dto);
  }

  @Delete(":id")
  @Permissions("admin:access")
  async remove(@Param("id") id: string) {
    return await this.plansService.deletePlan(id);
  }
}
