import { describe, expect, it } from "vitest";

import { isWorkbenchShell, MARKETING_ONLY_PATHS, resolveAppShell } from "../appShell";

// 外壳判定 (阶段 1 的骨架核心): 登录态 × 路径 → 工作台外壳 / 营销外壳。
//
// 这是**唯一**的判定入口 (layouts/default.vue 通过 composables/useAppShell.ts 调用),
// 所以这里逐条钉死需求点名的用例; 判定被改宽 (例如"永远返回工作台外壳") 时全部变红。
describe("外壳判定: 登录态 × 路径 → 工作台 / 营销", () => {
  const businessPaths = [
    "/course-pack",
    "/course-pack/star-pack",
    "/learning-path",
    "/my-courses",
    "/picture-word",
    "/review",
    "/rewards",
    "/stats",
    "/membership",
    "/partner",
    "/User/Setting",
    "/mastered-elements",
  ];

  it("已登录 + 业务页 → 工作台外壳 (app-shell)", () => {
    for (const path of businessPaths) {
      expect(resolveAppShell(path, true)).toBe("workbench");
    }
  });

  it("未登录 + 同样的业务页 → 营销外壳 (游客不能看到空壳侧栏)", () => {
    for (const path of businessPaths) {
      expect(resolveAppShell(path, false)).toBe("marketing");
    }
  });

  it("需求点名的对照组: /course-pack 登录进工作台, 未登录留在营销外壳", () => {
    expect(resolveAppShell("/course-pack", true)).toBe("workbench");
    expect(resolveAppShell("/course-pack", false)).toBe("marketing");
  });

  it("/game/* 恒为营销外壳: 全屏沉浸练习不能被 212px 侧栏挤压", () => {
    for (const path of ["/game", "/game/pack-1", "/game/pack-1/course-1"]) {
      expect(resolveAppShell(path, true)).toBe("marketing");
      expect(resolveAppShell(path, false)).toBe("marketing");
    }
  });

  it("落地页 `/` 跟着登录态走: 未登录=营销(落地页), 登录后=工作台(会员中心主页)", () => {
    // 用户明确要求: 登录后落在「主页」(= 侧栏第一项), 且主页与其它业务页用同一套全局外壳。
    // 所以 `/` 不能钉进 MARKETING_ONLY_PATHS —— 未登录由 !isAuthenticated 分支兜住。
    expect(resolveAppShell("/", true)).toBe("workbench");
    expect(resolveAppShell("/", false)).toBe("marketing");
  });

  it("协议页恒为营销外壳 (登录前后外观一致)", () => {
    for (const path of MARKETING_ONLY_PATHS) {
      expect(resolveAppShell(path, true)).toBe("marketing");
      expect(resolveAppShell(path, false)).toBe("marketing");
    }
  });

  it("营销专用路径只剩两页协议, 没有顺手把业务页或落地页塞进去", () => {
    expect(MARKETING_ONLY_PATHS).toEqual(["/privacy-policy", "/terms"]);
    expect(MARKETING_ONLY_PATHS).not.toContain("/");
  });

  it("isWorkbenchShell 与 resolveAppShell 同源 (不会各判一套)", () => {
    expect(isWorkbenchShell("/course-pack", true)).toBe(true);
    expect(isWorkbenchShell("/course-pack", false)).toBe(false);
    expect(isWorkbenchShell("/game/pack-1/course-1", true)).toBe(false);
    // 登录后的主页属于工作台外壳 (与其它业务页一致)
    expect(isWorkbenchShell("/", true)).toBe(true);
    expect(isWorkbenchShell("/", false)).toBe(false);
    expect(isWorkbenchShell("/privacy-policy", true)).toBe(false);
    expect(isWorkbenchShell("/terms", true)).toBe(false);
  });
});
