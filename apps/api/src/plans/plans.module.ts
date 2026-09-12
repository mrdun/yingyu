import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { AdminPlansController } from "./admin-plans.controller";
import { PlansController } from "./plans.controller";
import { PlansService } from "./plans.service";

@Module({
  imports: [GlobalModule],
  providers: [PlansService],
  controllers: [PlansController, AdminPlansController],
  exports: [PlansService],
})
export class PlansModule {}
