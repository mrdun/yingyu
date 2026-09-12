import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { CommissionAdminController } from "./commission-admin.controller";
import { CommissionRuleAdminController } from "./commission-rule-admin.controller";
import { PartnerAdminController } from "./partner-admin.controller";
import { PartnerController } from "./partner.controller";
import { PartnerService } from "./partner.service";

@Module({
  imports: [GlobalModule],
  providers: [PartnerService],
  controllers: [
    PartnerController,
    PartnerAdminController,
    CommissionRuleAdminController,
    CommissionAdminController,
  ],
  exports: [PartnerService],
})
export class PartnerModule {}
