import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { LearningPathService } from "./learning-path.service";

@Controller("learning-path")
export class LearningPathController {
  constructor(private readonly learningPathService: LearningPathService) {}

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get()
  findAll() {
    return this.learningPathService.findAll();
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.learningPathService.findOne(id);
  }
}
