import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { StatsService } from "./stats.service";

@Controller("stats")
@UseGuards(AuthGuard)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get("overview")
  async overview(@User() user: UserEntity) {
    return await this.statsService.getOverview(user.userId);
  }

  @Get("daily")
  async daily(@User() user: UserEntity, @Query("days") days?: string) {
    const parsed = Number(days);
    const n = Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 1), 365) : 30;
    return await this.statsService.getDaily(user.userId, n);
  }
}
