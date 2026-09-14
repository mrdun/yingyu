import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 游客「开启学习」入口回归测试 (源码级)。
 *
 * 为什么不做挂载测试: 本项目 tsconfig 继承 .nuxt/tsconfig.json, 不包含 .vue 模块声明,
 * 在 spec 里 import .vue 会得到 TS2307 (仓库内也没有先例)。真实点击行为由手工巡检
 * 巡检覆盖 (游客点「开启学习 →」→ 必须落到 /game/<pack>/<course>)。
 *
 * 为什么不用 fileURLToPath: vitest 的 nuxt environment 下 import.meta.url 会触发
 * ERR_INVALID_URL_SCHEME; npm script 以 apps/client 为 cwd 运行, 故用 process.cwd() 定位。
 *
 * 这一组断言针对的是 TASK-002-N-01 漏掉的真实游客入口:
 * 上一轮只改了 pages/index.vue, 而游客看到的是 components/Landing/index.vue,
 * 那里的 startEarthworm 写死了 router.push(`/course-pack`), 所以点按钮进商城、
 * 按 Enter 才进练习。下面每一条都能在把缺陷倒回去时变红。
 */
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const landingIndex = readSource("components/Landing/index.vue");
const landingBanner = readSource("components/Landing/Banner.vue");
const homeIndexPage = readSource("pages/index.vue");
const startLearningComposable = readSource("composables/useStartLearning.ts");

function countOccurrences(source: string, needle: string): number {
  return source.split(needle).length - 1;
}

describe("游客落地页「开启学习」必须直达默认课程练习 (TASK-002-N-02)", () => {
  it("按钮入口就是 LandingBanner 的 start-earthworm 事件", () => {
    // 先确认测试盯的是真实游客入口, 不是登录态首页
    expect(landingBanner).toContain('emit("start-earthworm")');
    expect(landingIndex).toContain('@start-earthworm="startLearning"');
  });

  it("落地页复用共用的默认学习入口实现, 不再自己写跳转", () => {
    expect(landingIndex).toContain(
      'import { useStartLearning } from "~/composables/useStartLearning"',
    );
    expect(landingIndex).toContain("const { startLearning } = useStartLearning()");
  });

  it("落地页不再把课程商城当作主动作 (上一轮的真实缺陷)", () => {
    // 缺陷形态: router.push(`/course-pack`) / router.push("/course-pack")
    expect(landingIndex).not.toMatch(/push\(\s*[`'"]\/course-pack/);
    expect(landingIndex).not.toContain("startEarthworm");
  });

  it("取数/解析不在这里再写一份 (单一来源)", () => {
    expect(landingIndex).not.toContain("fetchDefaultLearningEntry");
    expect(landingIndex).not.toContain("resolveStartLearningTarget");
    expect(landingIndex).not.toContain("useRouter");
  });

  it("Enter 快捷键只在一处注册: 落地页不注册, 首页注册一次", () => {
    expect(landingIndex).not.toContain("registerShortcut");
    expect(countOccurrences(homeIndexPage, 'registerShortcut("enter"')).toBe(1);
    // 两处合计仍然只有一处注册, 保证游客按 Enter 与点按钮同源
    expect(
      countOccurrences(landingIndex, 'registerShortcut("enter"') +
        countOccurrences(homeIndexPage, 'registerShortcut("enter"'),
    ).toBe(1);
  });

  it("共用实现真的走后端默认入口并带兜底 (不是空壳)", () => {
    expect(startLearningComposable).toContain("fetchDefaultLearningEntry");
    expect(startLearningComposable).toContain("resolveStartLearningPath");
    // 不硬编码课程/单元 ID: 目标地址只来自后端返回
    expect(startLearningComposable).not.toMatch(/\/game\/[a-z0-9]/i);
    expect(startLearningComposable).not.toContain('"/course-pack"');
  });
});
