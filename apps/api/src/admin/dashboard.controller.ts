import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AuthGuard, Permissions } from "../guards/auth.guard";
import { DashboardService } from "./dashboard.service";

@Controller("admin/dashboard")
@UseGuards(AuthGuard)
@Permissions("admin:access")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("overview")
  @Permissions("admin:access")
  async overview() {
    return await this.dashboardService.getOverview();
  }

  @Get("orders")
  @Permissions("admin:access")
  async orders(
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("planId") planId?: string,
    @Query("userId") userId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return await this.dashboardService.listOrders({
      status,
      provider,
      planId,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("memberships")
  @Permissions("admin:access")
  async memberships(@Query("from") from?: string, @Query("to") to?: string) {
    const now = new Date();
    const toDate = to ? new Date(to) : now;
    const fromDate = from ? new Date(from) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return await this.dashboardService.getMembershipGrowth(fromDate, toDate);
  }

  @Get("partners")
  @Permissions("admin:access")
  async partners() {
    return await this.dashboardService.getPartnerStats();
  }
}
