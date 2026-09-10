import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { PlansService } from "./plans.service";

@Module({
  imports: [GlobalModule],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
