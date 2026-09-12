import { Controller, Get, UseGuards } from "@nestjs/common";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { PlansService } from "./plans.service";

@Controller("plans")
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /** 会员方案列表 (价格以服务端 DB 为准); 游客/登录用户均可浏览 */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get()
  async findAll() {
    const plans = await this.plansService.findPublic();
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      priceFen: p.priceFen,
      durationDays: p.durationDays,
      sortOrder: p.sortOrder,
    }));
  }
}
