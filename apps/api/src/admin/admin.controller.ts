import { Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { AdminService } from "./admin.service";

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
  async coursePacks(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    return await this.adminService.listCoursePacks({ page: p, pageSize: ps });
  }

  @Patch("course-packs/:id/toggle-free")
  @Permissions("admin:access")
  async toggleFree(@Param("id") id: string) {
    return await this.adminService.toggleCoursePackFree(id);
  }

  @Patch("course-packs/:id/publish")
  @Permissions("admin:access")
  async publish(@Param("id") id: string) {
    return await this.adminService.publishCoursePack(id);
  }
}
