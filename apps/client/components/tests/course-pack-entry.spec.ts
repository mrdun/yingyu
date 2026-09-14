import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 课程广场点击 / 卡片文案 / 学习路线直达练习 (源码级守卫)。
 *
 * 为什么不做挂载测试: 本项目 tsconfig 继承 .nuxt/tsconfig.json, 不包含 .vue 模块声明,
 * 在 spec 里 import .vue 会得到 TS2307 (仓库内也没有先例)。
 * 运行时行为 (accessible 被裁剪后的真实跳转) 由 utils/tests/coursePackEntry.spec.ts
 * 的行为测试 + 真机手工巡检覆盖; 这里只钉住「字段不许被裁剪」的接线。
 *
 * P0 缺陷形态: pages/course-pack/index.vue 把课程包对象手工裁剪成
 * `{ id, title, description, cover, isFree, accessLevel }` 再传给卡片, 丢掉了 accessible,
 * 于是卡片点击一律跳 /membership。下面第一条断言在缺陷倒回时会立刻变红。
 */
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const squarePage = readSource("pages/course-pack/index.vue");
const detailPage = readSource("pages/course-pack/[id].vue");
const cardComponent = readSource("components/courses/CoursePackCard.vue");
const learningPathPage = readSource("pages/learning-path/[id].vue");
const entryUtil = readSource("utils/coursePackEntry.ts");

/** 取某个函数声明的源码片段 (到下一个顶格右括号为止), 避免整文件其它合法 /membership 干扰 */
function functionBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`未找到函数: ${declaration}`);
  const end = source.indexOf("\n}", start);
  return source.slice(start, end === -1 ? source.length : end);
}

/** 取 interface 声明的源码片段 */
function interfaceBody(source: string, declaration: string): string {
  const start = source.indexOf(declaration);
  if (start === -1) throw new Error(`未找到类型: ${declaration}`);
  const end = source.indexOf("\n}", start);
  return source.slice(start, end === -1 ? source.length : end);
}

describe("课程广场卡片 props 必须保留后端返回的完整字段 (P0 回归)", () => {
  it("列表页把完整课程包对象传给卡片, 不再手工裁剪字段", () => {
    expect(squarePage).toContain(':coursePack="coursePack"');
    // 缺陷形态: :coursePack="{ id: ..., title: ... }" (手工裁剪 → accessible 丢失)
    expect(squarePage).not.toContain(':coursePack="{');
    expect(squarePage).not.toContain("accessLevel: coursePack.accessLevel");
  });

  it("卡片接收的类型里保留 accessible (类型扩展而不是丢字段)", () => {
    const model = interfaceBody(entryUtil, "interface CoursePackCardModel");

    expect(model).toContain("accessible?: boolean");
    expect(cardComponent).toMatch(/coursePack:\s*CoursePackCardModel/);
  });

  it("卡片把完整对象原样 emit 出去 (点击决策仍拿到 accessible)", () => {
    expect(cardComponent).toMatch(/\$emit\(['"]cardClick['"],\s*coursePack\)/);
  });
});

describe("课程广场点击决策走纯函数, 且不把课程卡点击变成会员墙", () => {
  it("handleGoToCoursePack 只调用纯函数解析出的目标地址", () => {
    const body = functionBody(squarePage, "function handleGoToCoursePack");

    expect(body).toContain("resolveCoursePackCardEntryPath");
    expect(body).not.toContain("/membership");
    expect(body).not.toContain("gotoCourseList");
  });

  it("卡片点击会取一次课程包详情, 交给同一个编排函数解析第一课 (不是各写一套)", () => {
    const body = functionBody(squarePage, "function handleGoToCoursePack");

    expect(body).toContain("fetchCoursePack(coursePackId)");
    expect(squarePage).toContain("import { fetchCoursePack, fetchCoursePacks }");
  });

  it("决策逻辑在 utils 里且注释掉了「无权限 → 会员页」的老行为", () => {
    expect(squarePage).not.toContain("会员课程但无权限 → 进入会员页");
    expect(entryUtil).toContain("export function resolveCoursePackCardTarget");
  });
});

describe("卡片动作文案 (免费 / 会员)", () => {
  it("两种文案都在实现里, 且卡片用它渲染按钮", () => {
    expect(entryUtil).toContain("立即开始学习");
    expect(entryUtil).toContain("开通会员解锁");
    expect(cardComponent).toContain("resolveCoursePackCardActionLabel");
    expect(cardComponent).toContain("{{ actionLabel }}");
  });
});

describe("卡片动作文案默认展示 (P1 回归)", () => {
  /**
   * 为什么这条只能做源码断言:
   * 缺陷不在渲染逻辑, 而在 **Vue 的运行时 prop 转换** —— 声明为 `boolean` 的 prop,
   * 上层未传 `show-action` 时 props 里会被塞进 `false` (而不是 `undefined`)。
   * 于是 `props.showAction !== false` 恒为假, 兜底槽渲染成 `<!---->`, 页面上
   * 既搜不到「立即开始学习」也搜不到「开通会员解锁」。
   *
   * 这种缺陷: (1) 纯函数测试抓不到 (文案函数返回值正确);
   * (2) 源码文本断言也抓不到 —— 除非直接钉住「默认值写在 withDefaults 里」这个事实;
   * (3) .vue 无法 import (TS2307), 仓库又不能引入挂载测试。
   * 所以这里守住 withDefaults 的默认值本身: 把 `showAction: true` 去掉, 这条立刻变红。
   *
   * 不额外断言「源码里不许出现 props.showAction !== false」: 有了默认值之后那种写法
   * 其实也是对的 (true !== false → 展示; false !== false → 隐藏), 断言它只会误伤正确实现。
   * 真正的防线是默认值本身 + 计算属性直接读 props.showAction。
   */
  it("默认值必须由 withDefaults 提供 showAction: true", () => {
    expect(cardComponent).toMatch(
      /withDefaults\(\s*defineProps<Props>\(\)\s*,\s*\{[^}]*showAction:\s*true/,
    );
    expect(cardComponent).toContain("computed(() => props.showAction)");
  });

  it("学习路线仍显式关闭文案 (那里的数据没有 accessible, 不该显示会员文案)", () => {
    expect(learningPathPage).toContain(':show-action="false"');
  });
});

describe("学习路线条目直达第一课练习 (P2)", () => {
  it("点击时取一次课程包并解析第一课, 不再只跳课程列表", () => {
    const body = functionBody(learningPathPage, "async function handleGoToCoursePack");

    expect(body).toContain("fetchCoursePack(coursePack.id)");
    expect(body).toContain("resolveCoursePackFirstLessonPath");
    expect(body).not.toContain("gotoCourseList");
  });

  it("兜底行为仍在 (取不到 → 课程包详情页), 由纯函数实现", () => {
    const body = interfaceBody(entryUtil, "export async function resolveCoursePackFirstLessonPath");

    expect(body).toContain("/course-pack/${coursePackId}");
    expect(body).toContain("catch");
  });
});

describe("课程包详情页会员 CTA 按身份区分", () => {
  it("CTA 文案/动作来自纯函数, 游客走 signIn 而不是直接跳会员页", () => {
    expect(detailPage).toContain("resolveMembershipCta");
    expect(detailPage).toContain("{{ membershipCta.label }}");

    const body = functionBody(detailPage, "function handleMembershipCta");
    expect(body).toContain("signIn");
    expect(body).toContain("membershipCta.value.action");
  });

  it("会员不显示 CTA (requiresMembership 由后端按身份返回)", () => {
    expect(detailPage).toContain("requiresMembership");
    expect(entryUtil).toContain('if (identity === "member") return { label: "", action: "none" }');
  });
});
