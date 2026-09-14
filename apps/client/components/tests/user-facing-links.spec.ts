import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 用户端「第三方可点击外链 + 对外品牌名」守卫 (源码级)。
 *
 * 这一轮要做三件事, 每件都必须能被倒回去时立刻变红:
 *   1. 删掉创始会员邀请函横幅 (整组件 + 布局里的引用);
 *   2. 清掉用户端所有指向第三方/上游的可点击入口 (建议反馈 / 帮助文档 / 文档 / B 站视频),
 *      连带把只服务它们的 `helpDocsURL` 配置一并摘干净;
 *   3. 用户可见文案里的 "Earthworm" 改成「学以致用」。
 *
 * 为什么不做挂载测试: 与仓库其它源码级守卫一致 —— tsconfig 继承 .nuxt/tsconfig.json,
 * spec 里 import .vue 会得到 TS2307; 真实渲染由 RC 手工巡检验证。
 * 用 process.cwd() 定位源码: vitest 的 nuxt environment 下 import.meta.url 会触发
 * ERR_INVALID_URL_SCHEME, npm script 以 apps/client 为 cwd 运行。
 */
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const sourceExists = (relativePath: string): boolean =>
  existsSync(join(process.cwd(), relativePath));

describe("创始会员邀请函横幅已下线", () => {
  it("FoundingMemberNotice.vue 组件文件已删除", () => {
    expect(sourceExists("components/FoundingMemberNotice.vue")).toBe(false);
  });

  it("默认布局不再引用 FoundingMemberNotice (无残留标签/import)", () => {
    const layout = readSource("layouts/default.vue");

    expect(layout).not.toContain("FoundingMemberNotice");
    // 删除时不能把相邻的 <Navbar /> 一起带走
    expect(layout).toContain("<Navbar />");
    expect(layout).toContain("<Footer></Footer>");
  });

  it("「创始会员」作为会员类型与徽章保留 (本轮只删横幅)", () => {
    expect(sourceExists("components/MembershipBadge.vue")).toBe(true);
    expect(readSource("components/MembershipBadge.vue")).toContain("isFounderMembership");
  });
});

describe("用户菜单不再有第三方入口", () => {
  const userMenu = readSource("components/UserMenu.vue");

  it("上游反馈板 (txc.qq.com) 入口已删除", () => {
    expect(userMenu).not.toContain("txc.qq.com");
  });

  it("「建议反馈」与「帮助文档」两个菜单项及其 handler 已删除", () => {
    expect(userMenu).not.toContain("建议反馈");
    expect(userMenu).not.toContain("帮助文档");
    expect(userMenu).not.toContain("handleFeedback");
    expect(userMenu).not.toContain("handleHelpDocs");
    // 只删外链, 菜单本体与其它项必须还在
    expect(userMenu).toContain("会员");
    expect(userMenu).toContain("设置");
    expect(userMenu).toContain("掌握列表");
    expect(userMenu).toContain("主题切换");
    expect(userMenu).toContain("登出");
  });

  it("两个 handler 是 runtimeConfig 的唯一使用者, 因此 runtimeConfig 也必须一并清除", () => {
    expect(userMenu).not.toContain("runtimeConfig");
    expect(userMenu).not.toContain("useRuntimeConfig");
  });
});

describe("游客落地页导航不含第三方链接", () => {
  const navbar = readSource("components/Navbar.vue");

  it("Navbar 不再引用 helpDocsURL", () => {
    expect(navbar).not.toContain("helpDocsURL");
    expect(navbar).not.toContain("HELP_DOCS_URL");
    expect(navbar).not.toContain("useRuntimeConfig");
  });

  it("HEADER_OPTIONS 里没有任何外站 href (残留注释里的文档链接不算)", () => {
    expect(navbar).not.toMatch(/href:\s*[`"']https?:/);
  });
});

describe("落地页「快速上手」说明不再外链到视频站", () => {
  const introduce = readSource("components/Landing/Introduce.vue");

  it("bilibili 外链已删除, 段落仍保留对底部提示面板的说明", () => {
    expect(introduce).not.toContain("bilibili");
    expect(introduce).not.toMatch(/https?:\/\//);
    // 删掉链接后句子必须仍然完整 (不能只剩半句话)
    expect(introduce).toContain("底部提示面板");
    expect(introduce).toContain("答题小技巧");
  });
});

describe("helpDocsURL / HELP_DOCS_URL 已彻底清理", () => {
  it("nuxt.config.ts 不再声明 helpDocsURL, 也不再读 HELP_DOCS_URL", () => {
    const nuxtConfig = readSource("nuxt.config.ts");

    expect(nuxtConfig).not.toContain("helpDocsURL");
    expect(nuxtConfig).not.toContain("HELP_DOCS_URL");
    // 门禁清单里本来就没有它, 移除后构建门禁不受影响 —— 顺手钉住这一点
    expect(nuxtConfig).toContain("REQUIRED_BUILD_ENV");
    expect(nuxtConfig.split("REQUIRED_BUILD_ENV")[1].split("] as const")[0]).not.toContain(
      "HELP_DOCS_URL",
    );
  });

  it(".env.example 不再有 HELP_DOCS_URL", () => {
    expect(readSource(".env.example")).not.toContain("HELP_DOCS_URL");
  });
});

describe("用户可见文案改用「学以致用」", () => {
  it("用户评价 (comments.json) 里不再出现旧品牌名, 且已换成学以致用", () => {
    const comments = readSource("assets/comments.json");

    expect(comments).not.toMatch(/\bEarthworm\b/);
    expect(comments).not.toContain("earthworm.cuixueshe.com");
    expect(comments).toContain("学以致用");
  });

  it("分享图模板 (tpl_1) 的 alt 与版权字样已换成学以致用", () => {
    const tpl1 = readSource("composables/main/shareImage/imageTemplates/tpl_1.ts");

    expect(tpl1).not.toMatch(/\bEarthworm\b/);
    expect(tpl1).not.toContain("earthworm.cuixueshe.com");
    expect(tpl1).toContain('alt: "学以致用 logo"');
    expect(tpl1).toContain('children: "© 学以致用"');
  });
});

describe("反例守卫: 发音接口不是「第三方外链」", () => {
  it("pronunciation.ts 仍用有道发音接口 —— 清外链时误删会让单词朗读直接失效", () => {
    const pronunciation = readSource("composables/user/pronunciation.ts");

    expect(pronunciation).toContain("getPronunciationUrl");
    // 不能只断言"文件里出现过 dict.youdao.com": 它同时也写在文件头的注释里,
    // 那样把真正请求的地址改掉也测不出来。这里钉死会被实际请求的那一行。
    expect(pronunciation).toMatch(
      /return `https:\/\/dict\.youdao\.com\/dictvoice\?type=\$\{getPronunciationType\(\)\}&audio=\$\{english\}`;/,
    );
  });
});

// ---------------------------------------------------------------------------
// 全量兜底扫描: 上面每条断言都盯一个具体文件, 这里再按"整棵源码树"扫一遍,
// 防止外链从别的组件 (例如新加的营销区块) 溜回来。
// 只扫用户端真正会打包进产物的目录; tests/ 与 *.spec.ts 里出现这些字符串是
// 断言本身, 不是用户可见内容, 因此排除。
// ---------------------------------------------------------------------------
const SCAN_ROOTS = [
  "components",
  "pages",
  "layouts",
  "assets",
  "composables",
  "store",
  "services",
  "utils",
  "plugins",
  "middleware",
  "api",
];
const SCAN_EXTENSIONS = [".vue", ".ts", ".json"];
const SKIP_DIRECTORIES = new Set([
  ".nuxt",
  ".output",
  "dist",
  "node_modules",
  "test-results",
  "tests",
]);

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRECTORIES.has(entry.name) ? [] : collectSourceFiles(fullPath);
    }
    if (entry.name.endsWith(".spec.ts")) return [];
    return SCAN_EXTENSIONS.some((extension) => entry.name.endsWith(extension)) ? [fullPath] : [];
  });
}

const FORBIDDEN_MARKERS: { label: string; pattern: RegExp }[] = [
  { label: "上游反馈板 (txc.qq.com)", pattern: /txc\.qq\.com/ },
  { label: "上游帮助站 (earthworm-docs.cuixueshe.com)", pattern: /earthworm-docs\.cuixueshe\.com/ },
  { label: "上游站点 (earthworm.cuixueshe.com)", pattern: /earthworm\.cuixueshe\.com/ },
  { label: "已下线的 helpDocsURL / HELP_DOCS_URL 配置", pattern: /helpDocsURL|HELP_DOCS_URL/ },
  { label: "旧对外品牌名 Earthworm", pattern: /\bEarthworm\b/ },
  { label: "介绍页 B 站视频外链", pattern: /bilibili\.com/ },
];

describe("全量兜底: 用户端源码树里一个第三方外链/旧品牌名都不能剩", () => {
  const files = SCAN_ROOTS.filter(sourceExists).flatMap((root) =>
    collectSourceFiles(join(process.cwd(), root)),
  );

  it("扫描面不为空 (helper 失效时不能静默通过)", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("没有任何命中", () => {
    const hits: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const { label, pattern } of FORBIDDEN_MARKERS) {
        if (pattern.test(content)) {
          hits.push(
            `${file.replace(`${process.cwd()}\\`, "").replace(`${process.cwd()}/`, "")} → ${label}`,
          );
        }
      }
    }

    expect(hits).toEqual([]);
  });
});
