import { Controller, Get, Post, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { CoinsService } from "./coins.service";
import { CheckInDto } from "./dto/check-in.dto";

@Controller("coins")
@UseGuards(AuthGuard)
export class CoinsController {
  constructor(private readonly coinsService: CoinsService) {}

  @Get("balance")
  async balance(@User() user: UserEntity) {
    return await this.coinsService.getBalance(user.userId);
  }

  @Get("tasks")
  async tasks(@User() user: UserEntity) {
    return await this.coinsService.getTodayTasks(user.userId);
  }

  @Get("check-in-history")
  async checkInHistory(@User() user: UserEntity) {
    return await this.coinsService.getCheckInHistory(user.userId);
  }

  @Post("check-in")
  async checkIn(@User() user: UserEntity, dto: CheckInDto) {
    return await this.coinsService.checkIn(user.userId, dto.taskType);
  }
}
