import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { AdminController } from "../../admin/admin.controller";
import { DashboardController } from "../../admin/dashboard.controller";
import { BusinessSettingsController } from "../../business-settings/business-settings.controller";
import { CommissionAdminController } from "../../partner/commission-admin.controller";
import { CommissionRuleAdminController } from "../../partner/commission-rule-admin.controller";
import { PartnerAdminController } from "../../partner/partner-admin.controller";
import { PaymentChannelAdminController } from "../../payment/payment-channel-admin.controller";
import { AdminPlansController } from "../../plans/admin-plans.controller";
import { AuthGuard } from "../auth.guard";

const ADMIN_CONTROLLERS = [
  AdminController,
  DashboardController,
  AdminPlansController,
  BusinessSettingsController,
  PartnerAdminController,
  CommissionRuleAdminController,
  CommissionAdminController,
  PaymentChannelAdminController,
];

/** 收集控制器上所有 HTTP 路由方法 (排除构造/私有辅助) */
function routeHandlers(controller: any): Array<{ name: string; handler: (...args: any[]) => any }> {
  const routes: Array<{ name: string; handler: (...args: any[]) => any }> = [];
  for (const name of Object.getOwnPropertyNames(controller.prototype)) {
    if (name === "constructor") continue;
    const handler = controller.prototype[name];
    if (typeof handler !== "function") continue;
    // 只有被 @Get/@Post/... 装饰过的方法才带 path 元数据
    if (!Reflect.getMetadata("path", handler)) continue;
    if (Reflect.getMetadata("method", handler) === undefined) continue;
    routes.push({ name, handler });
  }
  return routes;
}

function resolvedPermissions(controller: any, handler: any): string[] | undefined {
  return (
    Reflect.getMetadata("permissions", handler) ?? Reflect.getMetadata("permissions", controller)
  );
}

describe("Admin 路由权限审计 (task 二)", () => {
  it("every /admin route requires admin:access (method or class level)", () => {
    const offenders: string[] = [];

    for (const controller of ADMIN_CONTROLLERS) {
      for (const route of routeHandlers(controller)) {
        const permissions = resolvedPermissions(controller, route.handler);
        if (!permissions || !permissions.includes("admin:access")) {
          offenders.push(`${controller.name}.${route.name}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("covers all admin controllers declared in the codebase", () => {
    // 防止新增 admin controller 时漏加入审计列表 (数量固定, 变更时强制更新本测试)
    expect(ADMIN_CONTROLLERS).toHaveLength(8);
    for (const controller of ADMIN_CONTROLLERS) {
      expect(routeHandlers(controller).length).toBeGreaterThan(0);
    }
  });
});

describe("AuthGuard 权限语义 (task 二)", () => {
  function contextFor(controller: any, handler: any, token?: string) {
    const request: any = { headers: token ? { authorization: `Bearer ${token}` } : {} };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controller,
    } as any;
  }

  const handler = AdminController.prototype.refundOrder;

  it("rejects anonymous requests with 401", async () => {
    const guard = new AuthGuard();
    await expect(guard.canActivate(contextFor(AdminController, handler))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects authenticated users without admin:access with 403 (not 401)", async () => {
    const guard = new AuthGuard();
    (guard as any).jwtVerify = async () => ({ sub: "u1", scope: "read:profile" });

    await expect(guard.canActivate(contextFor(AdminController, handler, "token"))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows admin scope through, and class-level permission applies to unlabeled routes", async () => {
    const guard = new AuthGuard();
    (guard as any).jwtVerify = async () => ({ sub: "admin1", scope: "admin:access openid" });

    await expect(guard.canActivate(contextFor(AdminController, handler, "token"))).resolves.toBe(
      true,
    );

    // 类级权限: 模拟「新增路由漏标 @Permissions」也不会放开
    const unlabeled = async () => undefined;
    Reflect.defineMetadata("path", "/admin/new-route", unlabeled);
    Reflect.defineMetadata("method", 0, unlabeled);
    (guard as any).jwtVerify = async () => ({ sub: "u2", scope: "read:profile" });

    await expect(
      guard.canActivate(contextFor(AdminController, unlabeled, "token")),
    ).rejects.toThrow(ForbiddenException);

    (guard as any).jwtVerify = async () => ({ sub: "admin1", scope: "admin:access" });
    await expect(guard.canActivate(contextFor(AdminController, unlabeled, "token"))).resolves.toBe(
      true,
    );
  });
});
