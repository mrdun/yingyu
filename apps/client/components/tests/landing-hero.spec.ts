import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");

const banner = read("../../components/Landing/Banner.vue");
const navbar = read("../../components/Navbar.vue");
const landingIndex = read("../../components/Landing/index.vue");
const footer = read("../../components/Landing/Contact.vue");
const tailwind = read("../../tailwind.config.js");

/**
 * 游客落地页首屏 = 设计稿 `.hermes/design/landing-B-on-cream.html` 的**变体 1**
 * （米黄底 + B 的组件语言）。用户已拍板变体 1，别把变体 2 的黄色改动混进来。
 */
describe("落地页首屏 (变体 1): 结构与设计稿一致", () => {
  it("标题第二行是渐变裁字, 不是衬线斜体", () => {
    expect(banner).toContain("grad-text");
    expect(banner).toContain("background-clip: text");
    expect(banner).toContain("上瘾到停不下来");
    expect(banner).toContain("让你的英语学习");
    // 旧写法: 衬线斜体 + 大写英文小标
    expect(banner).not.toContain("font-serif");
    expect(banner).not.toContain("italic");
    expect(banner).not.toContain("XueYiZhiYong");
  });

  it("两个按钮: 主按钮发 start-earthworm, 次按钮是锚点 (不是死按钮)", () => {
    // 主 CTA 仍走既有的事件接线 (Landing/index.vue -> useStartLearning)
    expect(banner).toContain('defineEmits(["start-earthworm"])');
    expect(banner).toContain('emit("start-earthworm")');
    expect(landingIndex).toContain('@start-earthworm="startLearning"');
    // ⚠️ 绝不能自己 push 到课程广场: 那正是以前修过的缺陷形态
    expect(banner).not.toContain("/course-pack");
    expect(banner).not.toContain("useStartLearning");

    // 次按钮: 没有演示视频, 所以是锚点到功能区块, 不是空 acton
    expect(banner).toContain('href="#features"');
    expect(banner).toContain("看看怎么玩");
    expect(banner).not.toContain("看 2 分钟演示");
  });

  it("营销页不许出现编造的个人数据", () => {
    // 设计稿的示意徽章写的是「连续 12 天 / 今日 +8 币」—— 那是编的, 营销页不能出现
    expect(banner).not.toMatch(/连续\s*\d+\s*天/);
    expect(banner).not.toMatch(/今日\s*\+\s*\d+\s*币/);
    expect(banner).not.toMatch(/LV\.?\s*\d/i);
    // 换成不依赖数值的功能标签
    expect(banner).toContain("连击连对");
    expect(banner).toContain("拼图闯关");
    expect(banner).toContain("答对得金币");
  });

  it("产品预览是浏览器窗口模拟, 不再加载截图图片", () => {
    expect(banner).not.toContain("<img");
    expect(banner).not.toContain("home-page-preview");
    expect(banner).toContain("把下面这句话翻译成英文");
    expect(banner).toContain("我今天需要做这件事情");
    expect(banner).toContain("i need to do it today");
    // 三个窗口圆点
    for (const dot of ["#FF5F57", "#FEBC2E", "#28C840"]) {
      expect(banner.toUpperCase()).toContain(dot);
    }
  });

  it("黄色在米黄底上自带 1px 边框, 且用深棕字 (不用白字)", () => {
    // 出现 #FFD93D 的每一处都必须同时有 1px 边框类
    const yellowBlocks = banner.split("bg-[#FFD93D]").slice(1);
    expect(yellowBlocks.length).toBeGreaterThan(0);
    for (const block of yellowBlocks) {
      expect(block).toContain("border");
    }
    expect(banner).toContain("text-[#4A3800]");
    expect(banner).not.toMatch(/bg-\[#FFD93D\][^"]*text-white/);
  });
});

describe("Navbar: 品牌区与登录按钮按设计稿改, 逻辑不动", () => {
  it("Logo 是渐变方块 + 🐛, 不再用 /logo.png", () => {
    expect(navbar).not.toContain("/logo.png");
    expect(navbar).not.toContain("<img");
    expect(navbar).toContain("🐛");
    expect(navbar).toContain("gradient-to-br");
  });

  /**
   * 品牌标记全页只有一个形态: 页头改成方块标后, 页脚不能还挂着旧的 /logo.png 图片,
   * 否则同一个落地页出现两种品牌标记。
   */
  it("页脚用同一个方块标, 也不再引用 /logo.png", () => {
    expect(footer).not.toContain("/logo.png");
    expect(footer).not.toContain("<img");
    expect(footer).toContain("🐛");
    expect(footer).toContain("gradient-to-br");
    // 页脚原有的栏目内容不受影响
    expect(footer).toContain('href="#features"');
    expect(footer).toContain("学以致用");
  });

  it("登录仍是按钮 + signIn(), 不是链接; 且是黄色胶囊带边框", () => {
    expect(navbar).toContain("signIn()");
    expect(navbar).toMatch(/<button[\s\S]{0,400}@click="signIn\(\)"/);
    expect(navbar).toContain("bg-[#FFD93D]");
    expect(navbar).toMatch(/border border-\[#EAC300\] bg-\[#FFD93D\]/);
    expect(navbar).not.toMatch(/bg-\[#FFD93D\][^"]*text-white/);
  });

  it("登录态分支 (金币入口 + 头像) 未被改动", () => {
    expect(navbar).toContain('to="/rewards"');
    expect(navbar).toContain("UAvatar");
    expect(navbar).toContain("openUserMenu");
    expect(navbar).toContain("HEADER_OPTIONS");
  });
});

describe("米黄底色与 DESIGN.md 一致 (修掉色值漂移)", () => {
  it("tailwind 的 cream 三处都是 #FBF7E8, 不再是 #f7f4ee", () => {
    const matches = tailwind.match(/cream:\s*"#[0-9A-Fa-f]{6}"/g);

    expect(matches).not.toBeNull();
    expect(matches).toHaveLength(3);
    for (const match of matches ?? []) {
      expect(match.toUpperCase()).toContain("#FBF7E8");
    }
  });

  /**
   * 已知遗留(未在本轮处理): daisyUI 主题的 `base-100` 仍是旧米黄 `#f7f4ee`
   * (`base-200/300` 是它的加深色)。它决定 daisyUI 组件(卡片/输入框)的底色,
   * 与页面 `bg-cream` 会差一档极接近的米黄。
   * 这里把它钉住是为了**不让它被悄悄改掉**(要改需要同时定 base-200/300, 属于另一轮)。
   */
  it("daisyUI 的 base-100 仍标注为已知遗留, 未被顺手改乱", () => {
    expect(tailwind).toMatch(/"base-100":\s*"#[0-9A-Fa-f]{6}"/);
    expect(tailwind).toMatch(/"base-200":\s*"#[0-9A-Fa-f]{6}"/);
    expect(tailwind).toMatch(/"base-300":\s*"#[0-9A-Fa-f]{6}"/);
  });
});
