import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { CoursePackService } from "./course-pack.service";
import { RateCourseDto } from "./dto/rate-course.dto";

@Controller("course-pack")
export class CoursePackController {
  constructor(private readonly coursePackService: CoursePackService) {}

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get()
  async findAll(
    @User() user: UserEntity,
    @Query("keyword") keyword?: string,
    @Query("filter") filter?: string,
  ) {
    return await this.coursePackService.findAll(user.userId, { keyword, filter });
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("default")
  async findDefault(@User() user: UserEntity) {
    return await this.coursePackService.findDefaultEntry(user.userId);
  }

  /**
   * 注意: `default` 必须声明在 `:coursePackId` 之前, 否则会被当成课程包 ID。
   */
  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":coursePackId")
  async findOne(@User() user: UserEntity, @Param("coursePackId") coursePackId: string) {
    return await this.coursePackService.findOneWithCourses(user.userId, coursePackId);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":coursePackId/courses/:courseId")
  findCourse(
    @User() user: UserEntity,
    @Param("coursePackId") coursePackId: string,
    @Param("courseId") courseId: string,
  ) {
    return this.coursePackService.findCourse(user.userId, coursePackId, courseId);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":coursePackId/courses/:courseId/next")
  findNextCourse(
    @User() user: UserEntity,
    @Param("coursePackId") coursePackId: string,
    @Param("courseId") courseId: string,
  ) {
    return this.coursePackService.findNextCourse(user.userId, coursePackId, courseId);
  }

  @UseGuards(AuthGuard)
  @Post(":coursePackId/courses/:courseId/complete")
  CompleteCourse(
    @User() user: UserEntity,
    @Param("coursePackId") coursePackId: string,
    @Param("courseId") courseId: string,
  ) {
    return this.coursePackService.completeCourse(user.userId, coursePackId, courseId);
  }

  @UseGuards(AuthGuard)
  @Post(":coursePackId/courses/:courseId/rate")
  rateCourse(
    @User() user: UserEntity,
    @Param("coursePackId") coursePackId: string,
    @Param("courseId") courseId: string,
    @Body() body: RateCourseDto,
  ) {
    return this.coursePackService.rateCourse(
      user.userId,
      coursePackId,
      courseId,
      body.total,
      body.correct,
    );
  }

  @UseGuards(AuthGuard)
  @Get(":coursePackId/ratings")
  getRatings(@User() user: UserEntity, @Param("coursePackId") coursePackId: string) {
    return this.coursePackService.getRatings(user.userId, coursePackId);
  }

  @UseGuards(AuthGuard)
  @Get(":coursePackId/progress")
  getProgress(@User() user: UserEntity, @Param("coursePackId") coursePackId: string) {
    return this.coursePackService.getProgress(user.userId, coursePackId);
  }
}
