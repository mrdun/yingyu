import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { MembershipService } from "../membership/membership.service";
import { AdminService } from "./admin.service";
import {
  CreateCourseDto,
  CreateStatementDto,
  UpdateCourseDto,
  UpdateStatementDto,
} from "./dto/course-content.dto";
import { CreateCoursePackDto, SetAccessLevelDto, UpdateCoursePackDto } from "./dto/course-pack.dto";

@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly membershipService: MembershipService,
  ) {}

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

  @Post("course-packs/:coursePackId/courses")
  @Permissions("admin:access")
  async createCourse(@Param("coursePackId") coursePackId: string, @Body() dto: CreateCourseDto) {
    return await this.adminService.createCourse(coursePackId, dto);
  }

  @Patch("courses/:courseId")
  @Permissions("admin:access")
  async updateCourse(@Param("courseId") courseId: string, @Body() dto: UpdateCourseDto) {
    return await this.adminService.updateCourse(courseId, dto);
  }

  @Delete("courses/:courseId")
  @Permissions("admin:access")
  async deleteCourse(@Param("courseId") courseId: string) {
    return await this.adminService.deleteCourse(courseId);
  }

  @Post("courses/:courseId/statements")
  @Permissions("admin:access")
  async createStatement(@Param("courseId") courseId: string, @Body() dto: CreateStatementDto) {
    return await this.adminService.createStatement(courseId, dto);
  }

  @Patch("statements/:statementId")
  @Permissions("admin:access")
  async updateStatement(
    @Param("statementId") statementId: string,
    @Body() dto: UpdateStatementDto,
  ) {
    return await this.adminService.updateStatement(statementId, dto);
  }

  @Delete("statements/:statementId")
  @Permissions("admin:access")
  async deleteStatement(@Param("statementId") statementId: string) {
    return await this.adminService.deleteStatement(statementId);
  }

  /** 管理员查看订单列表 */
  @Get("orders")
  @Permissions("admin:access")
  async listOrders(@Query("limit") limit?: string) {
    const l = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return await this.membershipService.listOrders(l);
  }

  /** 管理员查看单个订单 */
  @Get("orders/:id")
  @Permissions("admin:access")
  async getOrder(@Param("id") id: string) {
    return await this.membershipService.findOrder(id);
  }

  /** 管理员赠送会员 (不产生 order/payment) */
  @Post("memberships/grant")
  @Permissions("admin:access")
  async grantMembership(@Body() dto: { userId: string; planId: string }) {
    return await this.membershipService.grantMembership(dto.userId, dto.planId);
  }
}
