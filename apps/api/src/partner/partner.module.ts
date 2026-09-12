import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { PartnerAdminController } from "./partner-admin.controller";
import { PartnerController } from "./partner.controller";
import { PartnerService } from "./partner.service";

@Module({
  imports: [GlobalModule],
  providers: [PartnerService],
  controllers: [PartnerController, PartnerAdminController],
  exports: [PartnerService],
})
export class PartnerModule {}
