import { describe, expect, it } from "vitest";

import { PAGE_FILES, SERVICE_FILES, fileExists, readSource } from "./helpers/admin-source";

/**
 * Service 层集中化。
 * 这些断言防的回归:
 *  - 页面里出现裸 fetch/$fetch + 手拼 URL (将来插 BFF 时要满地改)
 *  - service 绕过统一 transport (token/错误归一化会漏掉)
 *  - 传输层丢掉分页参数与错误状态码
 */

const adminApi = readSource("services/admin-api.ts");
const httpClient = readSource("api/http.ts");

describe("页面只通过 service 取数", () => {
  it("页面里没有裸 fetch( / $fetch(", () => {
    for (const page of PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 不应出现 $fetch(`).not.toMatch(/\$fetch\(/);
      expect(source, `${page} 不应出现裸 fetch(`).not.toMatch(/(?<![\w$])fetch\(/);
    }
  });

  it("页面里没有内联请求路径 (只能出现在 services/ 内)", () => {
    for (const page of PAGE_FILES) {
      const source = readSource(page);
      expect(source, `${page} 不应内联 /admin/ 路径`).not.toMatch(/["'`]\/admin\//);
      expect(source, `${page} 不应内联 /health 路径`).not.toMatch(/["'`]\/health["'`]/);
    }
  });

  it("每个页面都引用了对应 service", () => {
    const expectations: Array<[string, string]> = [
      ["pages/dashboard.vue", 'from "~/services/dashboard.service"'],
      ["pages/plans.vue", 'from "~/services/plans.service"'],
      ["pages/payment-channels.vue", 'from "~/services/paymentChannels.service"'],
      ["pages/system/health.vue", 'from "~/services/system.service"'],
    ];
    for (const [page, importPath] of expectations) {
      expect(readSource(page), `${page} 应引用 ${importPath}`).toContain(importPath);
    }
  });
});

describe("service 层结构", () => {
  it("统一入口与 4 个模块 service 都存在", () => {
    for (const file of SERVICE_FILES) {
      expect(fileExists(file), `${file} 应存在`).toBe(true);
    }
  });

  it("模块 service 全部走统一 transport, 不自己建 HTTP 客户端", () => {
    for (const file of SERVICE_FILES.filter((name) => name.includes(".service.ts"))) {
      const source = readSource(file);
      expect(source, `${file} 应使用 adminApi`).toContain("adminApi.");
      expect(source, `${file} 不应自行 import ofetch`).not.toContain("ofetch");
      expect(source, `${file} 不应硬编码 baseURL`).not.toContain("baseURL");
    }
  });

  it("transport 负责 baseURL / token 注入 / 错误归一化 / 分页参数", () => {
    expect(httpClient).toContain("baseURL");
    expect(adminApi).toContain("normalizeTransportError");
    expect(adminApi).toContain("normalizePageParams");
    expect(adminApi).toContain("MAX_PAGE_SIZE");
    // 写操作不重试, 避免重复提交
    expect(adminApi).toContain("toFetchOptions(options, 0)");
  });

  it("分页参数归一化收敛越界值", () => {
    expect(adminApi).toContain("Math.max(1, Math.floor(rawPage))");
    expect(adminApi).toContain("Math.min(Math.max(1, Math.floor(rawSize)), MAX_PAGE_SIZE)");
  });

  it("路径参数做了编码 (方案 id / provider 可能含特殊字符)", () => {
    expect(adminApi).toContain("encodeURIComponent");
    expect(readSource("services/plans.service.ts")).toContain("pathSegment(id)");
    expect(readSource("services/paymentChannels.service.ts")).toContain("pathSegment(provider)");
  });

  it("健康检查把 503 的报告体取出来 (数据库故障仍可在页面看到)", () => {
    const systemService = readSource("services/system.service.ts");
    expect(systemService).toContain("503");
    expect(systemService).toContain("isHealthReport");
    expect(systemService).toContain("auth: false");
  });
});
