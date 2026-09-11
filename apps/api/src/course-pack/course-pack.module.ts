import { Module } from "@nestjs/common";

import { CourseHistoryModule } from "../course-history/course-history.module";
import { CourseModule } from "../course/course.module";
import { MembershipModule } from "../membership/membership.module";
import { CourseAccessService } from "./course-access.service";
import { CoursePackController } from "./course-pack.controller";
import { CoursePackService } from "./course-pack.service";

@Module({
  imports: [CourseModule, MembershipModule, CourseHistoryModule],
  providers: [CoursePackService, CourseAccessService],
  controllers: [CoursePackController],
})
export class CoursePackModule {}
