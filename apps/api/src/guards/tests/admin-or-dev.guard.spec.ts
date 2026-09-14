import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { AiContentController } from "../../ai-content/ai-content.controller";
import { AdminOrDevGuard } from "../admin-or-dev.guard";
import { AuthGuard } from "../auth.guard";

function createContext(opts: { token?: string; permissions?: string[]; uncheck?: boolean } = {}) {
  const request: any = {
    headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
    userId: undefined,
  };
  const handler: any = {};
  if (opts.permissions) Reflect.defineMetadata("permissions", opts.permissions, handler);
  if (opts.uncheck) Reflect.defineMetadata("uncheck", true, handler);
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getRequest: () => request,
  } as unknown as ExecutionContext;
}

function mockJwt(guard: AuthGuard, payload: Record<string, unknown>) {
  (guard as any).jwtVerify = jest.fn().mockResolvedValue(payload);
}

describe("AuthGuard permissions (admin RBAC)", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("requires admin:access scope", async () => {
    const guard = new AuthGuard();
    mockJwt(guard, { sub: "user-1", scope: "admin:access something" });

    await expect(
      guard.canActivate(createContext({ token: "t", permissions: ["admin:access"] })),
    ).resolves.toBe(true);
  });

  it("rejects a user without admin:access scope", async () => {
    const guard = new AuthGuard();
    mockJwt(guard, { sub: "user-2", scope: "read:something" });

    await expect(
      guard.canActivate(createContext({ token: "t", permissions: ["admin:access"] })),
      // 已登录但权限不足 → 403 (TASK-002-J-01: 401 会让前端误判为未登录)
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects when no token is provided", async () => {
    const guard = new AuthGuard();

    await expect(
      guard.canActivate(createContext({ permissions: ["admin:access"] })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("allows anonymous access for @UncheckAuth without token", async () => {
    const guard = new AuthGuard();

    await expect(guard.canActivate(createContext({ uncheck: true }))).resolves.toBe(true);
  });
});

describe("AdminOrDevGuard (AI endpoints)", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalDevBypass = process.env.AI_CONTENT_DEV_BYPASS;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalDevBypass === undefined) delete process.env.AI_CONTENT_DEV_BYPASS;
    else process.env.AI_CONTENT_DEV_BYPASS = originalDevBypass;
  });

  /** 显式设置开关: undefined 表示删除该变量 (即「没设」) */
  function setDevBypass(value: string | undefined) {
    if (value === undefined) delete process.env.AI_CONTENT_DEV_BYPASS;
    else process.env.AI_CONTENT_DEV_BYPASS = value;
  }

  it("rejects anonymous requests in non-production when the dev bypass is NOT set", async () => {
    process.env.NODE_ENV = "test";
    setDevBypass(undefined);
    const guard = new AdminOrDevGuard();

    // 安全回归: 非生产默认必须要求 admin:access, 无令牌 → 401
    await expect(guard.canActivate(createContext())).rejects.toThrow(UnauthorizedException);
  });

  it("bypasses auth in non-production only when AI_CONTENT_DEV_BYPASS is truthy", async () => {
    process.env.NODE_ENV = "test";
    setDevBypass("true");
    const guard = new AdminOrDevGuard();

    await expect(guard.canActivate(createContext())).resolves.toBe(true);
  });

  it("ignores AI_CONTENT_DEV_BYPASS in production (no token → 401)", async () => {
    process.env.NODE_ENV = "prod";
    setDevBypass("true");
    const guard = new AdminOrDevGuard();

    // 生产即使误设开关也不得放行, 必须走 AuthGuard
    await expect(guard.canActivate(createContext())).rejects.toThrow(UnauthorizedException);
  });

  it("requires admin:access in production", async () => {
    process.env.NODE_ENV = "prod";
    setDevBypass(undefined);
    const guard = new AdminOrDevGuard();
    mockJwt(guard, { sub: "user-1", scope: "admin:access something" });

    await expect(
      guard.canActivate(createContext({ token: "t", permissions: ["admin:access"] })),
    ).resolves.toBe(true);
  });

  it("rejects a non-admin user in production", async () => {
    process.env.NODE_ENV = "prod";
    setDevBypass(undefined);
    const guard = new AdminOrDevGuard();
    mockJwt(guard, { sub: "user-2", scope: "read:something" });

    await expect(
      guard.canActivate(createContext({ token: "t", permissions: ["admin:access"] })),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe("AiContentController permissions", () => {
  it("declares admin:access on every AI generation endpoint", () => {
    const methods = [
      "split",
      "createCoursePack",
      "createCoursePackFromSubtitle",
      "createCoursePackFromAudio",
      "findCoursePack",
    ];
    for (const method of methods) {
      const permissions = Reflect.getMetadata(
        "permissions",
        (AiContentController.prototype as any)[method],
      );
      expect(permissions).toEqual(["admin:access"]);
    }
  });
});
