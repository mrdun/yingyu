import { Module } from "@nestjs/common";

import { GlobalModule } from "../global/global.module";
import { ReviewController } from "./review.controller";
import { ReviewService } from "./review.service";

@Module({
  imports: [GlobalModule],
  providers: [ReviewService],
  controllers: [ReviewController],
})
export class ReviewModule {}
