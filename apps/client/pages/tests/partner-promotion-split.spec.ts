import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (relative: string) => readFileSync(resolve(__dirname, relative), "utf8");

const promotionPage = read("../../pages/promotion.vue");
const partnerPage = read("../../pages/partner.vue");
const homeIndex = read("../../components/Home/index.vue");
const statsRow = read("../../components/Home/LearningStatsRow.vue");

/**
 * 对标目标站(juyouenglish.com)的两页拆分:
 *   /partner    = 合伙人招募 (资格 / 申请 / 怎么做)
 *   /promotion  = 推广返利   (我的链接 / 邀请记录 / 佣金)
 *
 * 拆分的目的是「两个入口各司其职」, 最危险的失手是**两页都放同一张申请表**:
 * 用户在两处都能申请, 状态却不一致。所以下面钉住两侧的独占职责。
 */
describe("合伙人招募 / 推广返利 两页职责不重叠", () => {
  it("申请入口只在 /partner (推广返利页不放申请表)", () => {
    expect(partnerPage).toContain("applyPartner");
    expect(partnerPage).toContain("申请成为 Partner");

    // 推广返利页不该出现申请动作, 只能把用户导去 /partner
    expect(promotionPage).not.toContain("applyPartner");
    expect(promotionPage).not.toContain("申请成为 Partner");
    // 用 NuxtLink 而不是 @click="navigateTo('/partner')" (后者会被 tsc 判为不存在的属性)
    expect(promotionPage).toContain('to="/partner"');
    expect(promotionPage).not.toMatch(/@click="navigateTo\(/);
  });

  it("推广链接与邀请记录只在 /promotion (招募页不再拉这两个接口)", () => {
    expect(promotionPage).toContain("referralLink");
    expect(promotionPage).toContain("fetchPartnerReferrals");
    expect(promotionPage).toContain("fetchPartnerCommissions");
    expect(promotionPage).toContain("复制链接");

    expect(partnerPage).not.toContain("fetchPartnerReferrals");
    expect(partnerPage).not.toContain("fetchPartnerCommissions");
    // 已是合伙人时只给去向 (NuxtLink, 不是模板里的 navigateTo 调用)
    expect(partnerPage).toContain('to="/promotion"');
    expect(partnerPage).not.toMatch(/@click="navigateTo\(/);
  });

  it("两页都保留「未登录要去登录」而不是白屏", () => {
    for (const [name, source] of [
      ["partner", partnerPage],
      ["promotion", promotionPage],
    ] as const) {
      expect(source, `${name} 缺少 401 分支`).toContain("needLogin");
      expect(source, `${name} 缺少登录动作`).toContain("signIn");
    }
  });
});

/**
 * 学习数据第三张卡 = 「累计练习」(StatsOverview.totalStatements)。
 * 「累计掌握」(masteredCount) 是掌握句数, 与累计练习不是同一个量 ——
 * 若有人把 prop 换回 mastered, 两个数字会互相顶替, 且没人能从界面上看出来。
 */
describe("学习数据第三张卡用 totalStatements, 不是 masteredCount", () => {
  it("卡片 prop 是 totalStatements 且标签是「累计练习」", () => {
    expect(statsRow).toContain("totalStatements: number");
    expect(statsRow).toContain("累计练习");
    expect(statsRow).toContain("formatCount(props.totalStatements)");
    // 注释里仍会出现「累计掌握」(那句是警告), 所以只钉标签元素本身
    expect(statsRow).toContain('<p class="stats__k">累计练习</p>');
    expect(statsRow).not.toContain('<p class="stats__k">累计掌握</p>');
    expect(statsRow).not.toMatch(/defineProps<\{[^}]*mastered/);
  });

  it("首页把 overview.totalStatements 传下去", () => {
    expect(homeIndex).toContain("overview.value?.totalStatements");
    expect(homeIndex).toContain(':total-statements="totalStatements"');
    // 掌握数仍在千句进度里使用 (不是被删掉, 而是各有其位)
    expect(homeIndex).toContain("masteredCount");
  });

  it("接口类型里确实有 totalStatements (不是前端编的字段)", () => {
    const statsApi = read("../../api/stats.ts");

    expect(statsApi).toContain("totalStatements: number");
  });
});

/**
 * 学习数据区块标题右侧的「+ 添加课程」对标目标站。
 * 它指向课程广场, 与最后一格的虚线「+ 添加课程」是同一目的地的两个入口。
 */
describe("学习数据区块标题带「+ 添加课程」", () => {
  it("标题行有添加课程入口, 指向课程广场", () => {
    expect(homeIndex).toContain("mc__head-add");
    expect(homeIndex).toContain("+ 添加课程");
    expect(homeIndex).toMatch(
      /class="mc__head-add"[\s\S]{0,120}to="\/course-pack"|to="\/course-pack"[\s\S]{0,120}class="mc__head-add"/,
    );
  });

  it("成长报告入口没有被顶掉", () => {
    expect(homeIndex).toContain('to="/stats"');
    expect(homeIndex).toContain("成长报告 →");
  });
});
