import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * HttpErrorProvider 的 401 语义回归测试 (源码级)。
 *
 * 为什么不做挂载测试: 本项目 tsconfig 继承 .nuxt/tsconfig.json, 不包含 .vue 模块声明,
 * 在 spec 里 import .vue 会得到 TS2307 (仓库内也没有先例)。真实渲染行为由 Playwright
 * 巡检覆盖 (12 路由游客巡检: 不跳登录页 / 无 pageerror)。
 *
 * 为什么不用 fileURLToPath: vitest 的 nuxt environment 下 import.meta.url 会触发
 * ERR_INVALID_URL_SCHEME; npm script 以 apps/client 为 cwd 运行, 故用 process.cwd() 定位。
 */
const source = readFileSync(join(process.cwd(), "components/HttpErrorProvider.vue"), "utf8");

describe("HttpErrorProvider 的 HTTP 状态码处理", () => {
  it("页面级 401 不再全局跳转登录页 (游客态才能显示出来)", () => {
    expect(source).not.toContain("import { signIn }");
    expect(source).not.toContain("signIn(window.location.pathname)");
    expect(source).not.toContain("onAutoClose");
  });

  it("401 也不弹错误提示: 未登录是游客的正常状态", () => {
    expect(source).toContain("case 401:");
    const case401 = source.slice(source.indexOf("case 401:"), source.indexOf("default:"));
    // 注释里会解释「主动动作由按钮 signIn()」, 因此断言前先剥掉注释行
    const code401 = case401
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(code401).not.toContain("signIn");
    expect(code401).not.toContain("toast.error");
  });

  it("其它状态码仍提示, 管理后台权限不足 (403) 不静默", () => {
    expect(source).toContain("toast.error(errMessage)");
  });
});
