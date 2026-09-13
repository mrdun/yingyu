import { describe, expect, it, vi } from "vitest";

import type { CoursePackCardModel, CoursePackWithCourses } from "../coursePackEntry";
import {
  resolveCoursePackCardActionLabel,
  resolveCoursePackCardEntryPath,
  resolveCoursePackCardTarget,
  resolveCoursePackFirstLessonPath,
  resolveCoursePackFirstLessonTarget,
  resolveMembershipCta,
} from "../coursePackEntry";

/**
 * 课程广场卡片点击 / 学习路线直达第一课 (行为测试, 纯函数 + 真实对象)。
 *
 * 这里用真实后端返回形状的对象 (GET /course-pack 的每一项) 做输入, 而不是断言源码文本:
 * P0 缺陷是「列表页手工裁剪字段 → 运行时 accessible 变成 undefined」, 文本级断言抓不到。
 */

/** 免费课 (真实响应: isFree=true, accessLevel=free, accessible=true) */
const freePack: CoursePackCardModel = {
  id: "kyrtugjl8fa1f1k9kjv7ve9e",
  title: "星荣零基础学英语",
  description: "最适合零基础入门的课程",
  cover: "https://example.com/xingrong.jpg",
  isFree: true,
  accessLevel: "free",
  accessible: true,
};

/** 会员课且游客无权限 (真实响应: isFree=false, accessLevel=membership, accessible=false) */
const lockedMembershipPack: CoursePackCardModel = {
  id: "membership-pack-1",
  title: "进阶口语训练营",
  description: "会员专享",
  cover: "https://example.com/advanced.jpg",
  isFree: false,
  accessLevel: "membership",
  accessible: false,
};

/**
 * 是否是会员页路由本身 (不能用「路径里含 membership」这种子串判断:
 * 课程包 id 本身就可能带 membership 字样, 例如 /course-pack/membership-pack-1)。
 */
const isMembershipRoute = (path: string): boolean =>
  path === "/membership" || path.startsWith("/membership/") || path.startsWith("/membership?");

describe("课程广场卡片点击目标 (P0 回归)", () => {
  it("accessible === true 的免费课 → 进入课程包详情 (可看到课程列表)", () => {
    const target = resolveCoursePackCardTarget(freePack);

    expect(target.path).toBe("/course-pack/kyrtugjl8fa1f1k9kjv7ve9e");
    expect(target.requiresMembership).toBe(false);
    expect(isMembershipRoute(target.path)).toBe(false);
  });

  it("accessible === false 的会员课 → 仍进入课程包详情页, 不直接跳会员页", () => {
    const target = resolveCoursePackCardTarget(lockedMembershipPack);

    expect(target.path).toBe("/course-pack/membership-pack-1");
    expect(target.requiresMembership).toBe(true);
    expect(isMembershipRoute(target.path)).toBe(false);
  });

  it("accessible 缺失 (字段被裁剪的历史缺陷形态) → 绝不跳 /membership", () => {
    // 缺陷版本: 列表页手工拼对象时漏掉 accessible, 运行时该值为 undefined
    const cropped: CoursePackCardModel = {
      id: freePack.id,
      title: freePack.title,
      description: freePack.description,
      cover: freePack.cover,
      isFree: freePack.isFree,
      accessLevel: freePack.accessLevel,
    };
    expect(cropped.accessible).toBeUndefined();

    const target = resolveCoursePackCardTarget(cropped);

    expect(isMembershipRoute(target.path)).toBe(false);
    expect(target.path).toBe("/course-pack/kyrtugjl8fa1f1k9kjv7ve9e");
  });

  it("任何 accessible 取值 / 缺失 / 空对象都不会把课程点击变成会员页", () => {
    const cases: (CoursePackCardModel | null | undefined)[] = [
      freePack,
      lockedMembershipPack,
      { ...freePack, accessible: undefined },
      { ...lockedMembershipPack, accessible: undefined },
      { ...lockedMembershipPack, isFree: true, accessLevel: "free", accessible: undefined },
      { id: "only-id" },
      null,
      undefined,
    ];

    for (const coursePack of cases) {
      expect(isMembershipRoute(resolveCoursePackCardTarget(coursePack).path)).toBe(false);
    }
  });

  it("卡片动作文案: 免费课「立即开始学习」, 会员课无权「开通会员解锁」", () => {
    expect(resolveCoursePackCardActionLabel(freePack)).toBe("立即开始学习");
    expect(resolveCoursePackCardActionLabel(lockedMembershipPack)).toBe("开通会员解锁");
    // 字段缺失时保守显示解锁文案, 但点击依然进详情页 (上面已断言)
    expect(
      resolveCoursePackCardActionLabel({ ...lockedMembershipPack, accessible: undefined }),
    ).toBe("开通会员解锁");
    expect(resolveCoursePackCardActionLabel({ ...lockedMembershipPack, accessible: true })).toBe(
      "立即开始学习",
    );
  });
});

describe("学习路线条目直达第一课练习 (P2)", () => {
  const packWithCourses: CoursePackWithCourses = {
    ...freePack,
    // 故意乱序: 必须按 order 取第一课, 不依赖数组顺序
    courses: [
      { id: "course-3", order: 3 },
      { id: "course-1", order: 1 },
      { id: "course-2", order: 2 },
    ],
  };

  it("按 order 取第一课, 直接进入练习 (不经过课程列表)", () => {
    const target = resolveCoursePackFirstLessonTarget(packWithCourses);

    expect(target.path).toBe(`/game/${freePack.id}/course-1`);
    expect(target.directPractice).toBe(true);
  });

  it("包内没有课程 → 兜底课程包详情页", () => {
    expect(resolveCoursePackFirstLessonTarget({ ...freePack, courses: [] }).path).toBe(
      `/course-pack/${freePack.id}`,
    );
    expect(resolveCoursePackFirstLessonTarget({ ...freePack, courses: undefined }).path).toBe(
      `/course-pack/${freePack.id}`,
    );
    // 会员课无权限时后端不返回 courses (只有基本信息)
    expect(resolveCoursePackFirstLessonTarget(lockedMembershipPack).path).toBe(
      "/course-pack/membership-pack-1",
    );
  });

  it("取课程包成功 → 直达练习", async () => {
    const target = await resolveCoursePackFirstLessonPath(async () => packWithCourses, freePack.id);

    expect(target.path).toBe(`/game/${freePack.id}/course-1`);
    expect(target.directPractice).toBe(true);
  });

  it("请求失败 / 返回空 → 兜底课程包详情页, 不抛异常", async () => {
    const failed = await resolveCoursePackFirstLessonPath(async () => {
      throw new Error("network down");
    }, freePack.id);
    expect(failed.path).toBe(`/course-pack/${freePack.id}`);
    expect(failed.directPractice).toBe(false);

    const empty = await resolveCoursePackFirstLessonPath(async () => null, freePack.id);
    expect(empty.path).toBe(`/course-pack/${freePack.id}`);
  });

  it("取数只发生一次且使用后端课程包 ID (前端不硬编码课程/单元 ID)", async () => {
    const loader = vi.fn(async () => packWithCourses);

    await resolveCoursePackFirstLessonPath(loader, freePack.id);

    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe("课程广场卡片直达第一课练习 (P1: 「立即开始学习」要真的立即开始)", () => {
  const packWithCourses: CoursePackWithCourses = {
    ...freePack,
    courses: [
      { id: "course-3", order: 3 },
      { id: "course-1", order: 1 },
      { id: "course-2", order: 2 },
    ],
  };

  it("accessible === true (免费课) → 直接进入第一课练习, 不再停在课程列表", async () => {
    const target = await resolveCoursePackCardEntryPath(async () => packWithCourses, freePack);

    expect(target.path).toBe(`/game/${freePack.id}/course-1`);
    expect(target.directPractice).toBe(true);
    expect(isMembershipRoute(target.path)).toBe(false);
  });

  it("accessible === true (有权限的会员课) → 同样直达练习", async () => {
    const entitledMemberPack: CoursePackCardModel = {
      ...lockedMembershipPack,
      accessible: true,
    };

    const target = await resolveCoursePackCardEntryPath(
      async () => ({ ...entitledMemberPack, courses: packWithCourses.courses }),
      entitledMemberPack,
    );

    expect(target.path).toBe(`/game/${lockedMembershipPack.id}/course-1`);
    expect(target.directPractice).toBe(true);
    expect(isMembershipRoute(target.path)).toBe(false);
  });

  it("accessible === false (会员课且无权) → 课程包详情页展示会员 CTA, 连取数都不发", async () => {
    const loader = vi.fn(async () => packWithCourses);

    const target = await resolveCoursePackCardEntryPath(loader, lockedMembershipPack);

    expect(target.path).toBe("/course-pack/membership-pack-1");
    expect(target.directPractice).toBe(false);
    expect(target.requiresMembership).toBe(true);
    expect(isMembershipRoute(target.path)).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it("accessible 缺失 (历史缺陷形态) → 详情页兜底, 绝不跳 /membership", async () => {
    // 缺陷版本: 列表页手工拼对象时漏掉 accessible, 运行时该值为 undefined
    const loader = vi.fn(async () => packWithCourses);
    const cropped: CoursePackCardModel = {
      id: freePack.id,
      title: freePack.title,
      description: freePack.description,
      cover: freePack.cover,
      isFree: freePack.isFree,
      accessLevel: freePack.accessLevel,
    };
    expect(cropped.accessible).toBeUndefined();

    const target = await resolveCoursePackCardEntryPath(loader, cropped);

    expect(target.path).toBe(`/course-pack/${freePack.id}`);
    expect(target.directPractice).toBe(false);
    expect(isMembershipRoute(target.path)).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });

  it("取数成功但包内无课程 → 兜底课程包详情页", async () => {
    const target = await resolveCoursePackCardEntryPath(
      async () => ({ ...freePack, courses: [] }),
      freePack,
    );

    expect(target.path).toBe(`/course-pack/${freePack.id}`);
    expect(target.directPractice).toBe(false);
  });

  it("请求异常 / 返回空 → 兜底课程包详情页, 不抛异常也不卡住", async () => {
    const thrown = await resolveCoursePackCardEntryPath(async () => {
      throw new Error("network down");
    }, freePack);
    expect(thrown.path).toBe(`/course-pack/${freePack.id}`);
    expect(thrown.directPractice).toBe(false);
    expect(isMembershipRoute(thrown.path)).toBe(false);

    const empty = await resolveCoursePackCardEntryPath(async () => null, freePack);
    expect(empty.path).toBe(`/course-pack/${freePack.id}`);
  });

  it("兜底不会白屏: 连 id 都没有时退到课程商城", async () => {
    const loader = vi.fn(async () => packWithCourses);

    const target = await resolveCoursePackCardEntryPath(loader, { id: "", accessible: true });

    expect(target.path).toBe("/course-pack");
    expect(isMembershipRoute(target.path)).toBe(false);
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("课程包详情页会员 CTA 按身份区分", () => {
  it("游客 → 登录后解锁 (走 signIn)", () => {
    expect(resolveMembershipCta("guest")).toEqual({ label: "登录后解锁", action: "sign-in" });
  });

  it("已登录非会员 → 开通会员解锁 (去会员页)", () => {
    expect(resolveMembershipCta("non-member")).toEqual({
      label: "开通会员解锁",
      action: "membership",
    });
  });

  it("会员 → 不展示 CTA (直接可学)", () => {
    expect(resolveMembershipCta("member")).toEqual({ label: "", action: "none" });
  });
});
