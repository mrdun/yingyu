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

/** 本批次交付的 4 个页面 */
export const PAGE_FILES = [
  "pages/dashboard.vue",
  "pages/plans.vue",
  "pages/payment-channels.vue",
  "pages/system/health.vue",
];

export const SERVICE_FILES = [
  "services/admin-api.ts",
  "services/dashboard.service.ts",
  "services/plans.service.ts",
  "services/paymentChannels.service.ts",
  "services/system.service.ts",
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
