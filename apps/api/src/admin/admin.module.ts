import { Module } from "@nestjs/common";

import { LogtoModule } from "../logto/logto.module";
import { MembershipModule } from "../membership/membership.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [LogtoModule, MembershipModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
