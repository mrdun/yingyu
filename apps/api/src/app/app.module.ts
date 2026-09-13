import { RedisModule } from "@nestjs-modules/ioredis";
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";

import { AdminModule } from "../admin/admin.module";
import { AiContentModule } from "../ai-content/ai-content.module";
import { BusinessSettingsModule } from "../business-settings/business-settings.module";
import { CoinsModule } from "../coins/coins.module";
import { CourseHistoryModule } from "../course-history/course-history.module";
import { CoursePackModule } from "../course-pack/course-pack.module";
import { CourseModule } from "../course/course.module";
import { CronJobModule } from "../cron-job/cron-job.module";
import { GlobalModule } from "../global/global.module";
import { HealthModule } from "../health/health.module";
import { LearningPathModule } from "../learning-path/learning-path.module";
import { LogtoModule } from "../logto/logto.module";
import { MasteredElementModule } from "../mastered-element/mastered-element.module";
import { MembershipModule } from "../membership/membership.module";
import { PartnerModule } from "../partner/partner.module";
import { PictureWordModule } from "../picture-word/picture-word.module";
import { PlansModule } from "../plans/plans.module";
import { RankModule } from "../rank/rank.module";
import { ReviewModule } from "../review/review.module";
import { StatsModule } from "../stats/stats.module";
import { ToolModule } from "../tool/tool.module";
import { UserCourseProgressModule } from "../user-course-progress/user-course-progress.module";
import { UserLearningActivityModule } from "../user-learning-activity/user-learning-activity.module";
import { UserModule } from "../user/user.module";

@Module({
  imports: [
    GlobalModule,
    HealthModule,
    AiContentModule,
    LogtoModule,
    UserModule,
    CoursePackModule,
    CourseModule,
    LearningPathModule,
    PictureWordModule,
    UserCourseProgressModule,
    UserLearningActivityModule,
    ToolModule,
    RankModule,
    CronJobModule,
    CourseHistoryModule,
    MembershipModule,
    MasteredElementModule,
    PartnerModule,
    PlansModule,
    ReviewModule,
    CoinsModule,
    StatsModule,
    AdminModule,
    BusinessSettingsModule,
    RedisModule.forRootAsync({
      useFactory: () => ({
        type: "single",
        url: process.env.REDIS_URL,
        options: {
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
