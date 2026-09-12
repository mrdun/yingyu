import { Module } from "@nestjs/common";

import { PartnerModule } from "../partner/partner.module";
import { PaymentModule } from "../payment/payment.module";
import { PlansModule } from "../plans/plans.module";
import { MembershipController } from "./membership.controller";
import { MembershipService } from "./membership.service";

@Module({
  imports: [PaymentModule, PartnerModule, PlansModule],
  providers: [MembershipService],
  controllers: [MembershipController],
  exports: [MembershipService],
})
export class MembershipModule {}
