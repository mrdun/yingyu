import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { AuthGuard, UncheckAuth } from "../guards/auth.guard";
import { AiContentService } from "./ai-content.service";
import { AudioDto, CoursePackDto, SplitDto, SubtitleDto } from "./dto/ai-content.dto";

@Controller("ai-content")
export class AiContentController {
  constructor(private readonly aiContentService: AiContentService) {}

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post("split")
  async split(@Body() dto: SplitDto) {
    return await this.aiContentService.split(dto);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post("course-pack")
  async createCoursePack(@Body() dto: CoursePackDto) {
    return await this.aiContentService.createCoursePack(dto);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post("subtitle")
  async createCoursePackFromSubtitle(@Body() dto: SubtitleDto) {
    return await this.aiContentService.createCoursePackFromSubtitle(dto);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Post("audio")
  async createCoursePackFromAudio(@Body() dto: AudioDto) {
    return await this.aiContentService.createCoursePackFromAudio(dto);
  }

  @UncheckAuth()
  @UseGuards(AuthGuard)
  @Get("course-pack/:coursePackId")
  async findCoursePack(@Param("coursePackId") coursePackId: string) {
    return await this.aiContentService.findCoursePack(coursePackId);
  }
}
