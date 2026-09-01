import { Module } from "@nestjs/common";

import { LearningPathController } from "./learning-path.controller";
import { LearningPathService } from "./learning-path.service";

@Module({
  providers: [LearningPathService],
  controllers: [LearningPathController],
})
export class LearningPathModule {}
