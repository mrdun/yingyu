import { describe, expect, it } from "vitest";

import {
  coursePackCardVariantClass,
  coursePackCoverGradient,
  coursePackCoverIcon,
  formatCoursePackProgressLine,
  resolveCoursePackCardMetaLine,
  resolveCoursePackCardVariant,
  WORKBENCH_COVER_GRADIENTS,
  WORKBENCH_COVER_ICONS,
} from "../coursePackCard";

/**
 * 课程卡的工作台形态 (variant) 与工作台封面/进度文案 (纯函数级)。
 *
 * 关键约束 (P1 风险点): 卡片是课程广场与会员中心共用的组件 ——
 * 「给会员中心加工作台外观」最危险的失手是**把课程广场也改成工作台样子**。
 * 所以形态归一化必须是「只有显式 workbench 才切换」, 其余一律 default。
 */
describe("卡片形态: 只有显式 workbench 才切工作台外观", () => {
  it("workbench 原样通过, 其余全部回落 default", () => {
    expect(resolveCoursePackCardVariant("workbench")).toBe("workbench");
    expect(resolveCoursePackCardVariant("default")).toBe("default");
    expect(resolveCoursePackCardVariant(undefined)).toBe("default");
    expect(resolveCoursePackCardVariant(null)).toBe("default");
    expect(resolveCoursePackCardVariant("")).toBe("default");
    // 拼错 / 大小写不符 / 别名 → default (宁可少一次工作台样式)
    expect(resolveCoursePackCardVariant("Workbench")).toBe("default");
    expect(resolveCoursePackCardVariant("wb")).toBe("default");
  });

  it("形态类: default 是营销外观, workbench 是工作台外观", () => {
    expect(coursePackCardVariantClass(undefined)).toBe("course-pack-card--default");
    expect(coursePackCardVariantClass("default")).toBe("course-pack-card--default");
    expect(coursePackCardVariantClass("workbench")).toBe("course-pack-card--wb");
  });
});

describe("工作台封面: 按课程包 id 稳定取 (不是随机)", () => {
  it("同一个 id 每次都拿到同一个渐变与图标", () => {
    expect(coursePackCoverGradient("pack-1")).toBe(coursePackCoverGradient("pack-1"));
    expect(coursePackCoverIcon("pack-1")).toBe(coursePackCoverIcon("pack-1"));
  });

  it("取值只来自工作台封面集合 (空 id / 超长 id 也不越界)", () => {
    for (const id of ["", "a", "pack-1", "kyrtugjl8fa1f1k9kjv7ve9e", "x".repeat(500)]) {
      expect(WORKBENCH_COVER_GRADIENTS).toContain(coursePackCoverGradient(id));
      expect(WORKBENCH_COVER_ICONS).toContain(coursePackCoverIcon(id));
    }
    expect(coursePackCoverGradient(undefined)).toBe(WORKBENCH_COVER_GRADIENTS[0]);
    expect(coursePackCoverIcon(undefined)).toBe(WORKBENCH_COVER_ICONS[0]);
  });

  it("不同课程包至少能取到两种封面 (否则「按 id 取色」没有意义)", () => {
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const gradients = new Set(ids.map((id) => coursePackCoverGradient(id)));
    const icons = new Set(ids.map((id) => coursePackCoverIcon(id)));

    expect(gradients.size).toBeGreaterThan(1);
    expect(icons.size).toBeGreaterThan(1);
  });

  it("渐变都是工作台冷色系: 不含落地页米黄 / 旧蓝 / 不可读的 #4D96FF", () => {
    for (const gradient of WORKBENCH_COVER_GRADIENTS) {
      expect(gradient).toContain("linear-gradient(");

      for (const marketing of ["#fbf7e8", "#f0eada", "#2f6fe8", "#2563eb", "#5b6b80", "#4d96ff"]) {
        expect(gradient.toLowerCase()).not.toContain(marketing);
      }
    }
  });
});

describe("工作台进度文案: 第 N 课 · xx% (拿不到就退化, 不编数字)", () => {
  it("有真实进度 → 第 N 课 · xx%", () => {
    expect(
      formatCoursePackProgressLine({ totalCourses: 4, completedCourses: 1, progress: 25 }),
    ).toBe("第 2 课 · 25%");
    expect(
      formatCoursePackProgressLine({ totalCourses: 3, completedCourses: 3, progress: 100 }),
    ).toBe("第 3 课 · 100%");
  });

  /**
   * 设计稿 (`.hermes/design/home-appshell.html`) 对**未开始**的课写的是
   * 「第 1 课 · 还没开始」, 不是「第 1 课 · 0%」—— 0% 读起来像「学过了但没进展」。
   * 实测踩过: RC 上 mrdun 的全新课包 (55 课 / 完成 0) 显示「第 1 课 · 0%」。
   */
  it("未开始 (完成 0 课且进度 0) → 第 N 课 · 还没开始, 不说 0%", () => {
    expect(
      formatCoursePackProgressLine({ totalCourses: 12, completedCourses: 0, progress: 0 }),
    ).toBe("第 1 课 · 还没开始");
    // 运行时真实数据: 零基础学英语 = 55 课, 全新账号完成 0
    expect(
      formatCoursePackProgressLine({ totalCourses: 55, completedCourses: 0, progress: 0 }),
    ).toBe("第 1 课 · 还没开始");
    // 进度被夹到 0 的非法负值同样算「还没开始」
    expect(
      formatCoursePackProgressLine({ totalCourses: 2, completedCourses: 0, progress: -30 }),
    ).toBe("第 1 课 · 还没开始");
  });

  it("课号封顶在总课数, 进度收敛到 0–100", () => {
    expect(
      formatCoursePackProgressLine({ totalCourses: 2, completedCourses: 99, progress: 100 }),
    ).toBe("第 2 课 · 100%");
    expect(
      formatCoursePackProgressLine({ totalCourses: 2, completedCourses: -5, progress: 100 }),
    ).toBe("第 1 课 · 100%");
    expect(
      formatCoursePackProgressLine({ totalCourses: 2, completedCourses: 0, progress: 180 }),
    ).toBe("第 1 课 · 100%");
  });

  it("拿不到进度 (无数据 / 空包 / 非法值 / 字符串) → 空串", () => {
    expect(formatCoursePackProgressLine()).toBe("");
    expect(formatCoursePackProgressLine(null)).toBe("");
    expect(formatCoursePackProgressLine({})).toBe("");
    expect(
      formatCoursePackProgressLine({ totalCourses: 0, completedCourses: 0, progress: 0 }),
    ).toBe("");
    expect(formatCoursePackProgressLine({ totalCourses: Number.NaN, progress: Number.NaN })).toBe(
      "",
    );
    expect(formatCoursePackProgressLine({ totalCourses: "abc", progress: 50 } as never)).toBe("");
    expect(formatCoursePackProgressLine({ totalCourses: null, progress: null })).toBe("");
  });

  it("卡片第二行: 有进度优先进度, 拿不到退化成课程包描述", () => {
    expect(
      resolveCoursePackCardMetaLine("日常英语口语 100 句", {
        totalCourses: 4,
        completedCourses: 2,
        progress: 50,
      }),
    ).toBe("第 3 课 · 50%");
    expect(resolveCoursePackCardMetaLine("日常英语口语 100 句")).toBe("日常英语口语 100 句");
    expect(resolveCoursePackCardMetaLine("日常英语口语 100 句", {})).toBe("日常英语口语 100 句");
    expect(resolveCoursePackCardMetaLine(null)).toBe("");
    expect(resolveCoursePackCardMetaLine(undefined)).toBe("");
  });
});
