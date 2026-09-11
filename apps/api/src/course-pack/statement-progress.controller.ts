import { Controller, Param, Post, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../guards/auth.guard";
import { User, UserEntity } from "../user/user.decorators";
import { CoursePackService } from "./course-pack.service";

@Controller("courses")
export class StatementProgressController {
  constructor(private readonly coursePackService: CoursePackService) {}

  @UseGuards(AuthGuard)
  @Post(":courseId/statements/:statementId/complete")
  complete(
    @User() user: UserEntity,
    @Param("courseId") courseId: string,
    @Param("statementId") statementId: string,
  ) {
    return this.coursePackService.completeStatement(user.userId, courseId, statementId);
  }
}
