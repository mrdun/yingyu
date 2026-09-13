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
@Permissions("admin:access")
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

  /**
   * 管理员退款 (唯一退款入口):
   * 订单锁定 → 第三方退款 → refunded → 撤销会员权益 → 撤销佣金。
   * 重复退款会被状态机拒绝。
   */
  @Post("orders/:orderId/refund")
  @Permissions("admin:access")
  async refundOrder(@Param("orderId") orderId: string) {
    return await this.membershipService.refundOrder(orderId);
  }

  /**
   * 订单异常恢复 (管理员手动入口):
   * - pending 且已超时 → 先关第三方单再过期
   * - pending 未超时 → 主动向渠道查单 (回调丢失兜底, 已支付则入账)
   * - refunding 长期停留 → 恢复中断的退款 (渠道退款单号幂等)
   */
  @Post("orders/:orderId/reconcile")
  @Permissions("admin:access")
  async reconcileOrder(@Param("orderId") orderId: string) {
    return await this.membershipService.reconcileOrder(orderId);
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

  /**
   * 单个课程包详情 (只读, 不限状态): draft/review/archived 都要能读。
   * 只返回包字段 + courses (含 statementCount), 不返回语句正文。
   */
  @Get("course-packs/:id")
  @Permissions("admin:access")
  async coursePackDetail(@Param("id") id: string) {
    return await this.adminService.getCoursePackDetail(id);
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

  /** 某课程的语句列表 (只读, 按 order 升序, 服务端分页) */
  @Get("courses/:courseId/statements")
  @Permissions("admin:access")
  async courseStatements(
    @Param("courseId") courseId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const p = Math.max(Number(page) || 1, 1);
    const ps = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    return await this.adminService.listCourseStatements(courseId, { page: p, pageSize: ps });
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
  async listOrders(
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    const l = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return await this.membershipService.listOrders({
      limit: l,
      status,
      provider,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
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
