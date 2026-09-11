import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { PartnerController } from "./partner.controller";
import { PartnerService } from "./partner.service";

@Module({
  imports: [GlobalModule],
  providers: [PartnerService],
  controllers: [PartnerController],
  exports: [PartnerService],
})
export class PartnerModule {}
