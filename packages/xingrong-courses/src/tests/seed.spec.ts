import { describe, expect, it } from "vitest";

// 只导入无副作用模块: seed.ts 顶层会执行清库/写入, 不能在测试中导入
import { buildCoursePackSeedValues } from "../coursePackSeedValues";

/**
 * 内容导入必须产出「商城可见」的课程包。
 * 背景: schema 默认 status='draft', 早期导入脚本未显式设置, 导致导入后商城为空 (RC 发现)。
 */
describe("课程内容导入状态", () => {
  it("publishes imported course packs (status=published)", () => {
    expect(buildCoursePackSeedValues(true).status).toBe("published");
    expect(buildCoursePackSeedValues(false).status).toBe("published");
  });

  it("公开到商城 (share_level=public) 且来源标记为 manual", () => {
    const values = buildCoursePackSeedValues(true);
    expect(values.shareLevel).toBe("public");
    expect(values.source).toBe("manual");
  });

  it("access_level 与 is_free 保持一致", () => {
    expect(buildCoursePackSeedValues(true).accessLevel).toBe("free");
    expect(buildCoursePackSeedValues(false).accessLevel).toBe("membership");
  });
});
