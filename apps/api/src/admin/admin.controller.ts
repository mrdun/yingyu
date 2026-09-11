import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { AdminService } from "./admin.service";
import { CreateCoursePackDto, SetAccessLevelDto, UpdateCoursePackDto } from "./dto/course-pack.dto";

@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("overview")
  @Permissions("admin:access")
  async overview() {
    return await this.adminService.getOverview();
  }

  @Get("users")
  @Permissions("admin:access")
  async users(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    return await this.adminService.listUsers({ page: p, pageSize: ps, keyword });
  }

  @Get("course-packs")
  @Permissions("admin:access")
  async coursePacks(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: string,
    @Query("source") source?: string,
    @Query("accessLevel") accessLevel?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    return await this.adminService.listCoursePacks({
      page: p,
      pageSize: ps,
      status,
      source,
      accessLevel,
    });
  }

  @Post("course-packs")
  @Permissions("admin:access")
  async createCoursePack(@Body() dto: CreateCoursePackDto) {
    return await this.adminService.createCoursePack(dto);
  }

  @Patch("course-packs/:id")
  @Permissions("admin:access")
  async updateCoursePack(@Param("id") id: string, @Body() dto: UpdateCoursePackDto) {
    return await this.adminService.updateCoursePack(id, dto);
  }

  @Patch("course-packs/:id/access-level")
  @Permissions("admin:access")
  async setAccessLevel(@Param("id") id: string, @Body() dto: SetAccessLevelDto) {
    return await this.adminService.setCoursePackAccessLevel(id, dto.accessLevel);
  }

  @Patch("course-packs/:id/toggle-free")
  @Permissions("admin:access")
  async toggleFree(@Param("id") id: string) {
    return await this.adminService.toggleCoursePackFree(id);
  }

  @Post("course-packs/:id/submit-review")
  @Permissions("admin:access")
  async submitReview(@Param("id") id: string) {
    return await this.adminService.submitReview(id);
  }

  @Post("course-packs/:id/reject")
  @Permissions("admin:access")
  async reject(@Param("id") id: string) {
    return await this.adminService.rejectReview(id);
  }

  @Post("course-packs/:id/publish")
  @Permissions("admin:access")
  async publish(@Param("id") id: string) {
    return await this.adminService.publishCoursePack(id);
  }

  @Post("course-packs/:id/archive")
  @Permissions("admin:access")
  async archive(@Param("id") id: string) {
    return await this.adminService.archiveCoursePack(id);
  }

  @Post("course-packs/:id/restore")
  @Permissions("admin:access")
  async restore(@Param("id") id: string) {
    return await this.adminService.restoreCoursePack(id);
  }
}
