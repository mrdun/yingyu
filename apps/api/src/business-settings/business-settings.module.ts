import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { BusinessSettingsController } from "./business-settings.controller";
import { BusinessSettingsService } from "./business-settings.service";

@Module({
  imports: [GlobalModule],
  providers: [BusinessSettingsService],
  controllers: [BusinessSettingsController],
  exports: [BusinessSettingsService],
})
export class BusinessSettingsModule {}
