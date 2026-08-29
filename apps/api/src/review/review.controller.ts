import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { AddReviewDto } from "./dto/add-review.dto";
import { AnswerReviewDto } from "./dto/answer-review.dto";
import { ReviewService } from "./review.service";

@Controller("review")
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @UseGuards(AuthGuard)
  @Post("answer")
  async answer(@User() user: UserEntity, @Body() dto: AnswerReviewDto) {
    return await this.reviewService.answer(user.userId, dto);
  }

  @UseGuards(AuthGuard)
  @Get("today")
  async today(@User() user: UserEntity) {
    return await this.reviewService.getTodayQueue(user.userId);
  }

  @UseGuards(AuthGuard)
  @Post("add")
  async add(@User() user: UserEntity, @Body() dto: AddReviewDto) {
    return await this.reviewService.add(user.userId, dto.statementId);
  }
}
