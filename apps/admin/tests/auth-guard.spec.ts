import { describe, expect, it } from "vitest";

import { readSource } from "./helpers/admin-source";

/**
 * 认证与权限 (本批次关键验证点)。
 * 这些断言防的回归:
 *  - 把"已登录但无权限"当成"未登录"处理 (用户会被反复丢去登录页, 甚至死循环)
 *  - HTTP 层丢状态码导致 e.status === 401/403 恒不成立 (用户端历史上踩过)
 *  - 忘记申请 admin:access scope (后端一定是 403)
 *  - 忘记带 Bearer token
 */

const guard = readSource("middleware/auth.global.ts");
const http = readSource("api/http.ts");
const accessStore = readSource("stores/admin-access.ts");
const authService = readSource("services/auth.ts");
const logtoPlugin = readSource("plugins/logto.ts");
const forbiddenPage = readSource("pages/forbidden.vue");

describe("路由守卫: 未登录 vs 已登录无权限", () => {
  it("存在全局守卫, 未登录会发起 Logto 登录并中止导航", () => {
    expect(guard).toContain("defineNuxtRouteMiddleware");
    expect(guard).toContain("waitForAuthReady");
    expect(guard).toContain("signIn(to.fullPath)");
    expect(guard).toContain("abortNavigation()");
  });

  it("公开路径含 /callback 与 /forbidden (否则会无限重定向)", () => {
    expect(guard).toContain('const PUBLIC_PATHS = ["/callback", "/forbidden"]');
    expect(guard).toContain("isPublicPath(to.path)");
  });

  it("403 → Forbidden 页; 401 → 重新登录 (两者不混用)", () => {
    expect(guard).toContain('status === "forbidden"');
    expect(guard).toContain('navigateTo("/forbidden")');
    expect(guard).toContain('status === "unauthenticated"');
    expect(guard).toContain("signIn(to.fullPath)");
    // 403 分支不得出现 signIn
    const forbiddenBranch = guard.slice(
      guard.indexOf('status === "forbidden"'),
      guard.indexOf('status === "unauthenticated"'),
    );
    expect(forbiddenBranch).not.toContain("signIn(");
  });

  it("重新登录有次数上限, 避免会话异常时无限重定向", () => {
    expect(guard).toContain("MAX_REAUTH_ATTEMPTS");
    expect(guard).toContain("readReauthAttempts() >= MAX_REAUTH_ATTEMPTS");
    expect(guard).toContain('"/forbidden?reason=session"');
  });

  it("无法确认权限 (后端不通) 时放行并交给页面展示错误, 不误判为无权限", () => {
    expect(guard).toContain('status === "unknown" | "error"');
  });
});

describe("HTTP 层保留状态码 (401/403 必须可区分)", () => {
  it("ApiError 同时带 status 与 statusCode", () => {
    expect(http).toContain("status: number");
    expect(http).toContain("statusCode: number");
    expect(http).toContain("error.status = status");
    expect(http).toContain("error.statusCode = status");
  });

  it("提供 401/403 判定工具", () => {
    expect(http).toContain("export function isUnauthorized");
    expect(http).toContain("export function isForbidden");
    expect(http).toContain("getHttpStatus(error) === 401");
    expect(http).toContain("getHttpStatus(error) === 403");
  });

  it("权限状态机区分 403/401, 且网络错误不会变成无权限", () => {
    expect(accessStore).toContain('setState("forbidden"');
    expect(accessStore).toContain('setState("unauthenticated"');
    expect(accessStore).toContain('setState("error"');
    expect(accessStore).toContain("isForbidden(error)");
    expect(accessStore).toContain("isUnauthorized(error)");
  });

  it("权限探测使用需要 admin:access 的接口", () => {
    expect(accessStore).toContain("fetchPlansHealth()");
  });
});

describe("Logto 与 token", () => {
  it("scopes 含 admin:access, 且复用同一个 SPA 应用配置", () => {
    expect(logtoPlugin).toContain('"admin:access"');
    expect(logtoPlugin).toContain("createLogto");
    expect(logtoPlugin).toContain("runtimeConfig.public.appId");
    expect(logtoPlugin).toContain("runtimeConfig.public.backendEndpoint");
  });

  it("API 调用带 Authorization: Bearer <token>", () => {
    expect(http).toContain("Bearer ${token}");
    expect(authService).toContain("getAccessToken");
  });

  it("回调页完成登录后回到原路径, 且不依赖任何第二套认证", () => {
    const callbackPage = readSource("pages/callback.vue");
    expect(callbackPage).toContain("useHandleSignInCallback");
    expect(callbackPage).toContain("getSignInCallback()");
    // 不存在第二套认证/自建 token 存储
    expect(callbackPage).not.toContain("localStorage");
  });
});

describe("Forbidden 页面 (不假装成未登录)", () => {
  it("明确说明 403 与未登录的区别", () => {
    expect(forbiddenPage).toContain("403 Forbidden");
    expect(forbiddenPage).toContain("已成功登录");
    expect(forbiddenPage).toContain("admin:access");
  });

  it("提供换账号登录与退出登录入口", () => {
    expect(forbiddenPage).toContain("signIn(");
    expect(forbiddenPage).toContain("signOut(");
  });
});
