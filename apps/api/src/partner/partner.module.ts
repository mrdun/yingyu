import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { CommissionRuleAdminController } from "./commission-rule-admin.controller";
import { PartnerAdminController } from "./partner-admin.controller";
import { PartnerController } from "./partner.controller";
import { PartnerService } from "./partner.service";

@Module({
  imports: [GlobalModule],
  providers: [PartnerService],
  controllers: [PartnerController, PartnerAdminController, CommissionRuleAdminController],
  exports: [PartnerService],
})
export class PartnerModule {}
