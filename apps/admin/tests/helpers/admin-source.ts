import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 测试辅助: 读取 apps/admin 的源码文本。
 *
 * 与 apps/client 的测试约定一致: .vue 不能被 import, 因此用 readFileSync 做源码级断言。
 * 这样断言针对的就是"真正会被构建的源码", 而不是某个被 mock 过的替身。
 */

export const ADMIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SKIP_DIRS = new Set(["node_modules", ".nuxt", ".output", "dist", "tests", "coverage"]);
const SOURCE_EXTENSIONS = [".ts", ".vue", ".js", ".mjs"];

export function readSource(relativePath: string): string {
  return readFileSync(resolve(ADMIN_ROOT, relativePath), "utf8");
}

export function fileExists(relativePath: string): boolean {
  try {
    return statSync(resolve(ADMIN_ROOT, relativePath)).isFile();
  } catch {
    return false;
  }
}

function walk(currentDir: string, collected: string[]): void {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    const full = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, collected);
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      collected.push(relative(ADMIN_ROOT, full).split("\\").join("/"));
    }
  }
}

/** apps/admin 下所有源码文件 (相对路径, 已排除 node_modules/构建产物/tests) */
export function listSourceFiles(): string[] {
  const collected: string[] = [];
  walk(ADMIN_ROOT, collected);
  return collected.sort();
}

/** O-01 批次交付的 4 个页面 */
export const BATCH1_PAGE_FILES = [
  "pages/dashboard.vue",
  "pages/plans.vue",
  "pages/payment-channels.vue",
  "pages/system/health.vue",
];

/** O-02 批次交付的 7 个业务模块页面 */
export const BATCH2_PAGE_FILES = [
  "pages/users.vue",
  "pages/orders.vue",
  "pages/memberships.vue",
  "pages/partners.vue",
  "pages/commissions.vue",
  "pages/commission-rules.vue",
  "pages/settings/business.vue",
];

/** O-03 批次交付的课程中心 4 个页面 (课程包列表 / 详情 / 语句编辑器 / AI 生成) */
export const BATCH3_PAGE_FILES = [
  "pages/courses/index.vue",
  "pages/courses/[id].vue",
  "pages/courses/[id]/courses/[courseId].vue",
  "pages/courses/ai.vue",
];

/** O-04 批次交付的学习路线页面 (路线列表 + 条目编排, 把上面 12 项之外的最后一个占位补上) */
export const BATCH4_PAGE_FILES = ["pages/learning-paths.vue"];

/** 当前已交付的全部页面 (公共断言都跑在这上面) */
export const PAGE_FILES = [
  ...BATCH1_PAGE_FILES,
  ...BATCH2_PAGE_FILES,
  ...BATCH3_PAGE_FILES,
  ...BATCH4_PAGE_FILES,
];

export const SERVICE_FILES = [
  "services/admin-api.ts",
  "services/dashboard.service.ts",
  "services/plans.service.ts",
  "services/paymentChannels.service.ts",
  "services/system.service.ts",
  "services/users.service.ts",
  "services/orders.service.ts",
  "services/memberships.service.ts",
  "services/partners.service.ts",
  "services/commissions.service.ts",
  "services/commissionRules.service.ts",
  "services/businessSettings.service.ts",
  "services/courses.service.ts",
  "services/aiContent.service.ts",
  "services/learningPaths.service.ts",
];

export function countOccurrences(source: string, needle: string | RegExp): number {
  if (typeof needle === "string") {
    return source.split(needle).length - 1;
  }
  return (
    source.match(
      new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`),
    )?.length ?? 0
  );
}
