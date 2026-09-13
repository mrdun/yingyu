import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function readPage(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

const membershipPage = readPage("../membership.vue");
const partnerPage = readPage("../partner.vue");
const indexPage = readPage("../index.vue");

describe("商业化页面不硬编码商业数据 (task 七)", () => {
  it("membership page has no hardcoded price", () => {
    // 只允许 "¥{{ formatYuan(...) }}" 这类由 API 数据渲染的价格
    expect(membershipPage).not.toMatch(/¥\s*\d/);
    expect(membershipPage).toContain("formatYuan");
    expect(membershipPage).toContain("fetchPlans");
  });

  it("partner page has no hardcoded commission rate", () => {
    // 禁止 40% / 30% 这类写死的比例
    expect(partnerPage).not.toMatch(/\d+\s*%/);
    expect(partnerPage).toContain("commissionHeadline");
    expect(partnerPage).toContain("commissionExampleFen");
  });

  it("partner page has no hardcoded commission amount", () => {
    expect(partnerPage).not.toMatch(/¥\s*\d/);
  });

  it("membership page renders plans from API with adaptive layout", () => {
    // 自适应列数: 后台新增方案不会撑破布局
    expect(membershipPage).toContain("repeat(auto-fit, minmax(220px, 1fr))");
    expect(membershipPage).toContain('v-for="plan in plans"');
  });

  it("membership page handles every payment stage", () => {
    for (const stage of ["waiting", "success", "failed", "expired"]) {
      expect(membershipPage).toContain(`paymentStage === '${stage}'`);
    }
  });

  it("membership page explains lifetime without exaggeration", () => {
    expect(membershipPage).toContain("一次购买, 永久有效");
    // 不承诺"终身免费更新"等未定义权益
    expect(membershipPage).not.toContain("终身免费更新");
  });

  it("membership page never shows the raw legacy membership.type to users", () => {
    // 后端 type 取值是 legacy 的 regular/founder, 直接展示会让用户看到英文枚举
    expect(membershipPage).not.toContain("status.type");
    expect(membershipPage).toContain("currentPlanName");
  });
});

describe("首页核心学习入口 (TASK-002-N-01)", () => {
  it("开始学习直接进入默认课程的练习, 不再先进课程商城", () => {
    expect(indexPage).toContain("fetchDefaultLearningEntry");
    expect(indexPage).toContain("resolveStartLearningTarget");
    // 不应再把首页按钮固定指向课程商城
    expect(indexPage).not.toContain('push("/course-pack")');
    expect(indexPage).not.toContain("push('/course-pack')");
  });

  it("使用后端返回的默认入口地址 (无硬编码课程 ID)", () => {
    expect(indexPage).toContain("router.push(resolveStartLearningTarget(entry).path)");
    // 页面里不应出现任何写死的课程包/课程 ID
    expect(indexPage).not.toMatch(/coursePackId\s*=|courseId\s*=\s*"/);
  });
});
