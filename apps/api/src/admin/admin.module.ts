import { Module } from "@nestjs/common";

import { LogtoModule } from "../logto/logto.module";
import { MembershipModule } from "../membership/membership.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { LearningPathsAdminController } from "./learning-paths.controller";
import { LearningPathsAdminService } from "./learning-paths.service";

@Module({
  imports: [LogtoModule, MembershipModule],
  controllers: [AdminController, DashboardController, LearningPathsAdminController],
  providers: [AdminService, DashboardService, LearningPathsAdminService],
})
export class AdminModule {}
