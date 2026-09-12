import { Module } from "@nestjs/common";

import { LogtoModule } from "../logto/logto.module";
import { MembershipModule } from "../membership/membership.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  imports: [LogtoModule, MembershipModule],
  controllers: [AdminController, DashboardController],
  providers: [AdminService, DashboardService],
})
export class AdminModule {}
