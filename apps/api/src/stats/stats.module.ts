import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

@Module({
  imports: [GlobalModule],
  providers: [StatsService],
  controllers: [StatsController],
})
export class StatsModule {}
