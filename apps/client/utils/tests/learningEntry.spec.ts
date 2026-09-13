import { describe, expect, it } from "vitest";

import type { DefaultLearningEntry } from "../learningEntry";
import { resolveStartLearningTarget } from "../learningEntry";

function entry(overrides: Partial<DefaultLearningEntry> = {}): DefaultLearningEntry {
  return {
    id: "pack-1",
    title: "星荣零基础学英语",
    accessLevel: "free",
    accessible: true,
    requiresMembership: false,
    firstCourse: { id: "course-1", title: "第一课" },
    entryUrl: "/game/pack-1/course-1",
    ...overrides,
  };
}

describe("首页「开始学习」目标 (核心学习入口)", () => {
  it("免费默认课程: 直接进入练习, 不经过课程商城", () => {
    const target = resolveStartLearningTarget(entry());

    expect(target.path).toBe("/game/pack-1/course-1");
    expect(target.directPractice).toBe(true);
    expect(target.requiresMembership).toBe(false);
  });

  it("没有可学单元时不进入练习, 但也不直接抛会员墙", () => {
    const target = resolveStartLearningTarget(
      entry({
        accessLevel: "membership",
        accessible: false,
        requiresMembership: true,
        firstCourse: null,
        entryUrl: null,
      }),
    );

    expect(target.path).toBe("/course-pack/pack-1");
    expect(target.directPractice).toBe(false);
    expect(target.requiresMembership).toBe(true);
  });

  it("接口不可用时兜底课程商城 (用户不会卡在首页)", () => {
    const target = resolveStartLearningTarget(null);

    expect(target.path).toBe("/course-pack");
    expect(target.directPractice).toBe(false);
  });

  it("使用后端返回的课程与单元 ID, 前端不硬编码", () => {
    const target = resolveStartLearningTarget(
      entry({ id: "abc", firstCourse: { id: "xyz", title: "任意" }, entryUrl: "/game/abc/xyz" }),
    );

    expect(target.path).toBe("/game/abc/xyz");
  });
});
