import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { formatCoursePackProgressLine, resolveWorkbenchCardActionLabel } from "../coursePackCard";

const cardSource = readFileSync(
  resolve(__dirname, "../../components/courses/CoursePackCard.vue"),
  "utf8",
);

/**
 * P1 修复: 「我的课程」的按钮文案必须**按进度派生**, 不能按权限派生。
 *
 * 背景: 卡片数据来自 `GET /user-course-progress/recent-course-packs`, 该接口
 * 只 select 了 `isFree`, **不返回** `accessLevel` / `accessible`。
 * 于是会员课的 `accessible === undefined` → `resolveCoursePackCardActionLabel`
 * 走兜底分支 → 给**已经能学**的会员显示「开通会员解锁」。
 *
 * 所以工作台形态的按钮改读 `resolveWorkbenchCardActionLabel(progress)`。
 * 把按钮改回 `{{ actionLabel }}` → 本文件立刻变红。
 */
describe("P1: 工作台按钮文案按进度派生, 与权限无关", () => {
  it("有真实进度 → 继续游戏", () => {
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 4, completedCourses: 1, progress: 25 }),
    ).toBe("继续游戏");
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 3, completedCourses: 3, progress: 100 }),
    ).toBe("继续游戏");
  });

  it("没有可用进度 → 开始第一课 (空包 / 非法值 / 字符串 / 缺字段)", () => {
    expect(resolveWorkbenchCardActionLabel()).toBe("开始第一课");
    expect(resolveWorkbenchCardActionLabel(null)).toBe("开始第一课");
    expect(resolveWorkbenchCardActionLabel({})).toBe("开始第一课");
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 0, completedCourses: 0, progress: 0 }),
    ).toBe("开始第一课");
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: Number.NaN, progress: Number.NaN }),
    ).toBe("开始第一课");
    // 课数拿不到 (字符串) 且没有进度 → 开始第一课
    expect(resolveWorkbenchCardActionLabel({ totalCourses: "abc", progress: 0 } as never)).toBe(
      "开始第一课",
    );
    // 课数拿不到, 但进度明摆着是 50% → 学过, 继续游戏 (第二行会退化成课程包描述)
    expect(resolveWorkbenchCardActionLabel({ totalCourses: "abc", progress: 50 } as never)).toBe(
      "继续游戏",
    );
  });

  /**
   * 实测踩过的缺陷: 判定写成「第二行文案非空」→ 只要课程包有课程, 第二行就非空
   * (原来是「第 1 课 · 0%」) → **全新账号也显示「继续游戏」**。
   * RC 上真实数据: 零基础学英语 55 课 / mrdun 完成 0 课 → 必须显示「开始第一课」。
   */
  it("没学过 (完成 0 课且进度 0) → 开始第一课, 不是继续游戏", () => {
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 55, completedCourses: 0, progress: 0 }),
    ).toBe("开始第一课");
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 12, completedCourses: 0, progress: 0 }),
    ).toBe("开始第一课");
    // 唯一算「学过」的情况: 完成过至少一课, 或进度百分比大于 0
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 4, completedCourses: 1, progress: 25 }),
    ).toBe("继续游戏");
    expect(
      resolveWorkbenchCardActionLabel({ totalCourses: 4, completedCourses: 0, progress: 5 }),
    ).toBe("继续游戏");
  });

  it("按钮文案与第二行同理: 第二行说「还没开始」时, 按钮必须是「开始第一课」", () => {
    for (const progress of [
      { totalCourses: 55, completedCourses: 0, progress: 0 },
      { totalCourses: 12, completedCourses: 0, progress: 0 },
      { totalCourses: 2, completedCourses: 0, progress: -30 },
    ]) {
      expect(formatCoursePackProgressLine(progress)).toContain("还没开始");
      expect(resolveWorkbenchCardActionLabel(progress)).toBe("开始第一课");
    }
  });

  it("这个文案**永不**出现「开通会员解锁 / 立即开始学习」这类权限话术", () => {
    for (const progress of [
      undefined,
      null,
      {},
      { totalCourses: 4, completedCourses: 1, progress: 25 },
      { totalCourses: 0, progress: 0 },
    ]) {
      const label = resolveWorkbenchCardActionLabel(progress);

      expect(label).not.toContain("开通会员");
      expect(label).not.toContain("解锁");
      expect(label).not.toContain("立即开始学习");
      expect(["继续游戏", "开始第一课"]).toContain(label);
    }
  });

  it("卡片源码: 工作台按钮渲染 workbenchActionLabel, 且它由 resolveWorkbenchCardActionLabel 派生", () => {
    expect(cardSource).toContain("{{ workbenchActionLabel }}");
    expect(cardSource).toContain("resolveWorkbenchCardActionLabel(props.progress)");
    // import 是多行花括号写法, 不按单行字面量断言
    expect(cardSource).toMatch(/resolveWorkbenchCardActionLabel,/);
    expect(cardSource).toContain('from "~/utils/coursePackCard"');
  });

  it("默认形态不受影响: actions 槽仍用权限派生的 actionLabel", () => {
    // 课程广场/学习路线等场景照旧 —— 只有工作台形态换文案
    expect(cardSource).toContain("{{ actionLabel }}");
    expect(cardSource).toContain("resolveCoursePackCardActionLabel(props.coursePack)");
  });
});

/**
 * P2 修复: 工作台封面高度对齐设计稿的 72px 细色条。
 * `.hermes/design/home-appshell.html` 的 `.course .cover { height: 72px; font-size: 24px }`。
 * 改回 `aspect-video` → 变红。
 */
describe("P2: 工作台封面是 72px 细色条, 不是 16:9 大图", () => {
  it("样式里有固定 height: 72px 且不含 aspect-video", () => {
    const start = cardSource.indexOf(".wb-cover {");
    expect(start, "找不到 .wb-cover 样式块").toBeGreaterThan(-1);

    const block = cardSource.slice(start, cardSource.indexOf("}", start));

    expect(block).toContain("height: 72px");
    expect(block).not.toContain("aspect-video");
  });

  it("图标字号与设计稿一致 (24px, 不是 34px)", () => {
    const start = cardSource.indexOf(".wb-cover__icon {");
    expect(start).toBeGreaterThan(-1);

    const block = cardSource.slice(start, cardSource.indexOf("}", start));

    expect(block).toContain("font-size: 24px");
    expect(block).not.toContain("34px");
  });
});
