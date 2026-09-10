import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { AdminOrDevGuard } from "../guards/admin-or-dev.guard";
import { Permissions } from "../guards/auth.guard";
import { AiContentService } from "./ai-content.service";
import { AudioDto, CoursePackDto, SplitDto, SubtitleDto } from "./dto/ai-content.dto";

@Controller("ai-content")
@UseGuards(AdminOrDevGuard)
export class AiContentController {
  constructor(private readonly aiContentService: AiContentService) {}

  @Permissions("admin:access")
  @Post("split")
  async split(@Body() dto: SplitDto) {
    return await this.aiContentService.split(dto);
  }

  @Permissions("admin:access")
  @Post("course-pack")
  async createCoursePack(@Body() dto: CoursePackDto) {
    return await this.aiContentService.createCoursePack(dto);
  }

  @Permissions("admin:access")
  @Post("subtitle")
  async createCoursePackFromSubtitle(@Body() dto: SubtitleDto) {
    return await this.aiContentService.createCoursePackFromSubtitle(dto);
  }

  @Permissions("admin:access")
  @Post("audio")
  async createCoursePackFromAudio(@Body() dto: AudioDto) {
    return await this.aiContentService.createCoursePackFromAudio(dto);
  }

  @Permissions("admin:access")
  @Get("course-pack/:coursePackId")
  async findCoursePack(@Param("coursePackId") coursePackId: string) {
    return await this.aiContentService.findCoursePack(coursePackId);
  }
}
