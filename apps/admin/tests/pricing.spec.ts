import { describe, expect, it } from "vitest";

import { PAGE_FILES, listSourceFiles, readSource } from "./helpers/admin-source";

/**
 * 商业数据必须来自 API。
 * 这些断言防的回归:
 *  - 页面里写死价格 (改价要发版, 且与后端 plans 表不一致导致收款金额错误)
 *  - 写死佣金比例 (业务规则变更后前端仍展示旧比例)
 */

/** 用户端历史上出现过的硬编码价格 (元), 一律不得出现在管理后台页面里 */
const HARDCODED_PRICE_TOKENS = ["18", "48", "168", "199"];
/** 硬编码佣金比例 */
const HARDCODED_RATE_TOKENS = ["0.4", "40%"];

describe("页面不得硬编码价格", () => {
  it.each(PAGE_FILES)("%s 不含硬编码价格片段", (page) => {
    const source = readSource(page);
    for (const token of HARDCODED_PRICE_TOKENS) {
      expect(source, `${page} 不应出现价格片段 "${token}"`).not.toContain(token);
    }
  });

  it("价格全部来自 API 字段 priceFen, 并按统一 utility 格式化", () => {
    const plansPage = readSource("pages/plans.vue");
    expect(plansPage).toContain("formatYuanFromFen");
    expect(readSource("pages/dashboard.vue")).toContain("formatYuanFromFen");

    const formatUtil = readSource("utils/format.ts");
    expect(formatUtil).toContain("formatYuanFromFen");
    // 换算常量只允许在 utility 里定义一次
    expect(formatUtil).toContain("FEN_PER_YUAN");
  });
});

describe("不得硬编码佣金比例", () => {
  it("全部源码都不含写死的比例", () => {
    const offenders = listSourceFiles().filter((file) => {
      const source = readSource(file);
      return HARDCODED_RATE_TOKENS.some((token) => source.includes(token));
    });
    expect(offenders).toEqual([]);
  });

  it("佣金金额来自后端字段并按统一 utility 展示", () => {
    const dashboard = readSource("pages/dashboard.vue");
    expect(dashboard).toContain("commissionPendingFen");
    expect(dashboard).toContain("commissionTotalFen");
  });
});
