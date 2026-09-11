import { Module } from "@nestjs/common";

import { PaymentModule } from "../payment/payment.module";
import { PartnerModule } from "../partner/partner.module";
import { MembershipController } from "./membership.controller";
import { MembershipService } from "./membership.service";

@Module({
  imports: [PaymentModule, PartnerModule],
  providers: [MembershipService],
  controllers: [MembershipController],
  exports: [MembershipService],
})
export class MembershipModule {}
