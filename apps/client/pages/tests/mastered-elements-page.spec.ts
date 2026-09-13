import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readPage(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const page = readPage("../mastered-elements.vue");
const lines = page.split("\n").map((line) => line.trim());

describe("掌握列表页面 (游客态与错误反馈)", () => {
  it("游客 (401) 看到登录提示与登录入口, 而不是毫无说明的空列表", () => {
    expect(page).toContain('v-if="needLogin"');
    expect(page).toContain('@click="signIn()"');
    expect(page).toContain("登录后可查看你的掌握列表");
  });

  it("store 请求都被 await 且有 catch/finally (不再出现未捕获异常)", () => {
    const setupLines = lines.filter((line) => line.includes("masteredElementsStore.setup("));
    const removeLines = lines.filter((line) => line.includes("removeElement("));

    expect(setupLines.length).toBeGreaterThan(0);
    expect(removeLines.length).toBeGreaterThan(0);
    expect([...setupLines, ...removeLines].every((line) => line.startsWith("await "))).toBe(true);
    expect(page).toContain("catch (e: any)");
  });

  it("401 走登录态, 其它错误有可见反馈 (不静默)", () => {
    expect(page).toContain("e?.status === 401 || e?.statusCode === 401");
    expect(page).toContain("加载掌握列表失败");
    expect(page).toContain("删除失败");
  });

  it("已登录用户仍能搜索与删除", () => {
    expect(page).toContain('v-model="searchQuery"');
    expect(page).toContain('v-for="item in filteredItems"');
    expect(page).toContain('@click="removeItem(item)"');
  });
});
