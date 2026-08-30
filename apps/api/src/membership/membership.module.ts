import { Module } from "@nestjs/common";

import { PaymentModule } from "../payment/payment.module";
import { MembershipController } from "./membership.controller";
import { MembershipService } from "./membership.service";

@Module({
  imports: [PaymentModule],
  providers: [MembershipService],
  controllers: [MembershipController],
  exports: [MembershipService],
})
export class MembershipModule {}
