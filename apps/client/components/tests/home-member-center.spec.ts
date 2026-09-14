import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  coursePackCardVariantClass,
  coursePackCoverGradient,
  coursePackCoverIcon,
  formatCoursePackProgressLine,
  resolveCoursePackCardMetaLine,
  resolveCoursePackCardVariant,
} from "../../utils/coursePackCard";
import {
  barPercent,
  clampPercent,
  formatCount,
  formatDuration,
  formatPercent,
  greetingForHour,
  progressWidth,
  resolveWeekDayState,
  safeNumber,
  secondsToMinutes,
  SENTENCE_GOAL,
} from "../../utils/memberCenter";

/**
 * 会员中心主页 (登录后 `/`) 守卫 (源码级 + 纯函数级)。
 *
 * 覆盖阶段 2 的验收点:
 *   1. 7 个区块按 DESIGN.md `## Layout` 第 3 节的顺序出现;
 *   2. 会员转化横幅是条件渲染 (非会员才出);
 *   3. 打卡周历三态语义 (已完成 ✓ / 今天实心 / 未来虚线);
 *   4. 千句进度目标是 1000;
 *   5. 反例守卫: 工作台页面不得混入落地页(米黄)那一套色值;
 *   6. 空态守卫: 全 0 数据不得出现 NaN / 空进度条 (源码层 + 纯函数层)。
 *
 * 为什么不做挂载测试: 与仓库其它源码级守卫一致 —— tsconfig 继承 .nuxt/tsconfig.json,
 * spec 里 import .vue 会得到 TS2307; 真实渲染由 RC 手工巡检验证。
 * 用 process.cwd() 定位源码: npm script 以 apps/client 为 cwd 运行。
 */
const readSource = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

const homeSource = readSource("components/Home/index.vue");
const overviewSource = readSource("components/Home/UserOverviewBar.vue");
const upsellSource = readSource("components/Home/MembershipUpsell.vue");
const statsSource = readSource("components/Home/LearningStatsRow.vue");
const checkInSource = readSource("components/CheckInCard.vue");
const tasksSource = readSource("components/DailyTasksCard.vue");
const coursesSource = readSource("components/courses/RecentCoursePack.vue");
const heatmapSource = readSource("components/Home/CalendarGraph.vue");
const weekChartSource = readSource("components/Home/WeeklyStudyChart.vue");
const goalSource = readSource("components/Home/SentenceGoalCard.vue");
const memberCenterUtils = readSource("utils/memberCenter.ts");
const coursePackCardUtils = readSource("utils/coursePackCard.ts");
const cardSource = readSource("components/courses/CoursePackCard.vue");

/**
 * 会员中心的全部源文件 (阶段 2 新增/改动)。
 * 两套调色板不得混用 —— 这些文件一律走 wb-* (见 DESIGN.md `## Colors` 「工作台外壳调色板」)。
 *
 * 落地页那一套 (米黄底 / 旧蓝) 出现在这里就是回归:
 *   #FBF7E8 米黄底 · #F0EADA 米黄边 · #2F6FE8 + #2563EB 落地页按钮蓝 · #5B6B80 落地页次要文字
 */
const marketingPalette = ["#FBF7E8", "#F0EADA", "#2F6FE8", "#2563EB", "#5B6B80", "#F8FAFC"];

/** #4D96FF 白字只有 2.95:1, 工作台里一个都不许出现 */
const unreadableBlue = "#4D96FF";

const memberCenterFiles: { path: string; source: string }[] = [
  { path: "components/Home/index.vue", source: homeSource },
  { path: "components/Home/UserOverviewBar.vue", source: overviewSource },
  { path: "components/Home/MembershipUpsell.vue", source: upsellSource },
  { path: "components/Home/LearningStatsRow.vue", source: statsSource },
  { path: "components/Home/WeeklyStudyChart.vue", source: weekChartSource },
  { path: "components/Home/SentenceGoalCard.vue", source: goalSource },
  { path: "components/Home/CalendarGraph.vue", source: heatmapSource },
  { path: "components/CheckInCard.vue", source: checkInSource },
  { path: "components/CheckInCalendar.vue", source: readSource("components/CheckInCalendar.vue") },
  { path: "components/DailyTasksCard.vue", source: tasksSource },
  { path: "components/courses/RecentCoursePack.vue", source: coursesSource },
  { path: "components/courses/CoursePackCard.vue", source: cardSource },
];

describe("会员中心主页: 7 个区块齐全, 且顺序照 DESIGN.md `## Layout` 第 3 节", () => {
  it("页面组件与 6 个子组件都存在 (第 4 块拆成打卡卡 + 每日任务卡)", () => {
    for (const file of memberCenterFiles) {
      expect(existsSync(join(process.cwd(), file.path))).toBe(true);
    }
  });

  it("区块 1-7 的标记按顺序出现", () => {
    const markers = [
      "<UserOverviewBar", // 1 用户概览条
      "<MembershipUpsell", // 2 会员转化横幅
      "<LearningStatsRow", // 3 学习数据 4 列
      "<CheckInCard", // 4 打卡 + 每日任务
      "<DailyTasksCard",
      "<HomeRecentCoursePack", // 5 我的课程
      "<HomeCalendarGraph", // 6 热力图 + 最近 7 天
      "<WeeklyStudyChart",
      "<SentenceGoalCard", // 7 千句进度
    ];

    const positions = markers.map((marker) => homeSource.indexOf(marker));
    expect(positions.every((index) => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("区块 1: 头像是用户信息, 三个胶囊是金币 / 今日练习 x 句 / 连续打卡", () => {
    expect(homeSource).toContain("userStore.user?.avatar");
    expect(homeSource).toContain("userStore.user?.username");
    expect(overviewSource).toContain("props.avatar");
    expect(overviewSource).toContain("金币余额");
    expect(overviewSource).toContain("今日练习");
    expect(overviewSource).toContain("连续打卡");
  });

  it("区块 1: 右侧圆按钮只有 设置 / 会员 / 退出 —— 不渲染深色切换 (工作台被强制浅色)", () => {
    // 布局刻意移除了 html.dark, 一个点了没反应的切换按钮比没有更糟;
    // 这个折中只在「深浅色两个按钮同时出现」时才会重新评估。
    expect(overviewSource).toContain('aria-label="设置"');
    expect(overviewSource).toContain('aria-label="会员"');
    expect(overviewSource).toContain('aria-label="退出"');
    expect(overviewSource).not.toContain("主题");
    expect(overviewSource).not.toContain("toggleDarkMode");
    expect(overviewSource).not.toContain("useDarkMode");
  });

  it("区块 3: 四列分别是 今日练习时长 / 今日练习 / 累计练习 / 连续天数", () => {
    for (const label of ["今日练习时长", "今日练习", "累计练习", "连续天数"]) {
      expect(statsSource).toContain(label);
    }
    expect(statsSource).toContain("repeat(4, 1fr)");
    // 四个数字都经过 formatCount (非法值 → 0)
    expect(statsSource).toContain("formatCount(");
  });

  it("区块 5: 4 列栅格 + 最后一格虚线「+ 添加课程」→ /course-pack", () => {
    expect(homeSource).toContain(':member-center="true"');
    expect(coursesSource).toContain("sm:grid-cols-2 lg:grid-cols-4");
    expect(coursesSource).toContain("+ 添加课程");
    expect(coursesSource).toContain('to="/course-pack"');
    expect(coursesSource).toMatch(/\.add-course[\s\S]*border: 1px dashed/);
  });

  it("区块 6: 热力图沿用 CalendarGraph + learningDailyTime, 柱状图用 fetchStatsDaily(7)", () => {
    expect(homeSource).toContain("useLearningDailyTime()");
    expect(heatmapSource).toContain("useCalendarGraph(emits");
    expect(homeSource).toContain("fetchStatsDaily(7)");
    expect(weekChartSource).toContain("每天练习的句子数");
  });

  it("区块 7: 千句进度的目标是 1000 (不是 5000, 那是 DESIGN.md 里没改干净的一处)", () => {
    expect(SENTENCE_GOAL).toBe(1000);
    expect(memberCenterUtils).toContain("export const SENTENCE_GOAL = 1000");
    expect(goalSource).toContain("用你的注意力填满");
    expect(goalSource).toContain("SENTENCE_GOAL");
    expect(goalSource).not.toContain("5000");
  });
});

describe("会员转化横幅: 条件渲染 + 会员判定", () => {
  it('横幅整体挂在 v-if="!isMember" 上 (会员看不到)', () => {
    expect(homeSource).toContain('<MembershipUpsell v-if="!isMember"');
  });

  it("会员判定读 useUserStore 的创始人标记与 /user 的 membership.isMember, 且没有被反转", () => {
    const start = homeSource.indexOf("const isMember = computed(");
    expect(start).toBeGreaterThan(-1);
    const declaration = homeSource.slice(start, homeSource.indexOf(");", start));

    expect(declaration).toContain("isFounderMembership()");
    expect(declaration).toContain("membership?.isMember");
    // 反转 (例如 `!userStore...` / `=== false`) 会让上面两条里的语义变味, 这里直接钉住
    expect(declaration).not.toMatch(/!\s*\(?\s*userStore/);
    expect(declaration).not.toContain("=== false");
  });

  it("横幅的 CTA 指向 /membership, 文案是「了解会员权益」", () => {
    expect(upsellSource).toContain("了解会员权益");
    expect(upsellSource).toContain('to="/membership"');
    // 橙底 + 深棕字 + 蓝色 CTA (橙底白字只有 2.20:1, 不达标)
    expect(upsellSource).toContain("#fff4e0");
    expect(upsellSource).toContain("#8a4b00");
    expect(upsellSource).toContain("#2c5af4");
  });
});

describe("打卡周历: 已完成 / 今天 / 未来 三态可辨识", () => {
  it("三个状态各自有独立类名与样式 (未来是虚线空框, 不是小圆点)", () => {
    expect(checkInSource).toContain("ci__day-box--done");
    expect(checkInSource).toContain("ci__day-box--today");
    expect(checkInSource).toContain("ci__day-box--future");
    // 已完成 = 浅蓝底 + ✓ / 今天 = 蓝底实心 / 未来 = 虚线透明底
    expect(checkInSource).toMatch(/\.ci__day-box--done[\s\S]*background: #eff6ff/);
    expect(checkInSource).toMatch(/\.ci__day-box--today[\s\S]*background: #2c5af4/);
    expect(checkInSource).toMatch(/\.ci__day-box--future[\s\S]*border-style: dashed/);
    expect(checkInSource).toContain('state === "done" ? "✓"');
  });

  it("三态判定走纯函数 (今天优先于未来, 已打卡优先于今天)", () => {
    expect(checkInSource).toContain("resolveWeekDayState(");

    // 已打卡的历史日 → done
    expect(resolveWeekDayState("2026-09-10", "2026-09-14", ["2026-09-10"])).toBe("done");
    // 今天 (还没打卡) → today
    expect(resolveWeekDayState("2026-09-14", "2026-09-14", [])).toBe("today");
    // 今天且已打卡 → done (✓ 优先)
    expect(resolveWeekDayState("2026-09-14", "2026-09-14", ["2026-09-14"])).toBe("done");
    // 未来日 → future
    expect(resolveWeekDayState("2026-09-15", "2026-09-14", [])).toBe("future");
    // 过去但漏打的日 → missing (中性格, 不冒充未来)
    expect(resolveWeekDayState("2026-09-13", "2026-09-14", [])).toBe("missing");
    // 空的历史 (当前账号就是这样) 不报错
    expect(resolveWeekDayState("2026-09-13", "2026-09-14")).toBe("missing");
  });
});

describe("反例守卫: 会员中心不得混入落地页(米黄)调色板", () => {
  it("每个文件都不含米黄/旧蓝, 也不含不可读的 #4D96FF", () => {
    for (const file of memberCenterFiles) {
      const source = file.source.toLowerCase();
      for (const color of marketingPalette) {
        expect(source).not.toContain(color.toLowerCase());
      }
      expect(source).not.toContain(unreadableBlue.toLowerCase());
    }
  });

  it("用的是工作台调色板: 主色 #2C5AF4 + 卡片边 #E5E7EB", () => {
    const allSources = memberCenterFiles
      .map((file) => file.source)
      .join("\n")
      .toLowerCase();
    expect(allSources).toContain("#2c5af4");
    expect(allSources).toContain("#e5e7eb");
    // 激活/浅蓝底与次要文字
    expect(allSources).toContain("#eff6ff");
    expect(allSources).toContain("#666666");
  });
});

describe("空态守卫: 全 0 数据显示 0, 不出现 NaN / 空进度条", () => {
  it("组件源码里不做裸除法, 也不自己 toFixed (全部交给 utils/memberCenter.ts)", () => {
    for (const file of memberCenterFiles) {
      expect(file.source).not.toMatch(/toFixed\(/);
      expect(file.source).not.toContain("NaN");
    }
  });

  it("兜底逻辑集中在 memberCenter.ts (Number.isFinite 收敛所有非法值)", () => {
    expect(memberCenterUtils).toContain("Number.isFinite");
    // 缺失值走 `??`, 转不动/非有限的值走 fallback
    expect(memberCenterUtils).toContain("?? fallback");
    // 页面里所有接口值都先过 safeNumber
    expect(homeSource).toContain("safeNumber(");
  });

  it("0 值: 百分比 / 进度条 / 计数 / 时长 都是合法的 0, 不是 NaN 或空串", () => {
    expect(formatPercent(0, SENTENCE_GOAL)).toBe("0%");
    expect(formatPercent(undefined, SENTENCE_GOAL)).toBe("0%");
    expect(formatPercent(null, SENTENCE_GOAL)).toBe("0%");
    expect(formatPercent(Number.NaN, SENTENCE_GOAL)).toBe("0%");
    expect(formatPercent(1, 0)).toBe("0%");
    expect(progressWidth(0, SENTENCE_GOAL)).toBe("0%");
    expect(progressWidth(Number.NaN, Number.NaN)).toBe("0%");
    expect(clampPercent(0, 0)).toBe(0);
    expect(clampPercent(-5, 10)).toBe(0);
    expect(clampPercent(50, 10)).toBe(100);
    // 有数据时仍然正常
    expect(formatPercent(264, SENTENCE_GOAL)).toBe("26.4%");
    expect(formatPercent(SENTENCE_GOAL, SENTENCE_GOAL)).toBe("100%");

    expect(formatCount(0)).toBe("0");
    expect(formatCount(undefined)).toBe("0");
    expect(formatCount(1284)).toBe("1,284");

    expect(secondsToMinutes(0)).toBe(0);
    expect(secondsToMinutes(undefined)).toBe(0);
    expect(secondsToMinutes(600)).toBe(10);
    expect(formatDuration(0)).toBe("0 分钟");
    expect(formatDuration(undefined)).toBe("0 分钟");
    expect(formatDuration(7260)).toBe("2 小时 1 分");

    expect(safeNumber(undefined)).toBe(0);
    expect(safeNumber(Number.NaN)).toBe(0);
    expect(safeNumber("12")).toBe(12);
    expect(safeNumber(undefined, 10)).toBe(10);
  });

  it("柱状图空态: 峰值 0 时每根柱子高度是 0% (而不是 -Infinity 或 NaN)", () => {
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(undefined, undefined)).toBe(0);
    expect(barPercent(3, 6)).toBe(50);
    expect(barPercent(9, 6)).toBe(100);
    // 空数组也不能崩 (组件里用 reduce 从 0 起算, 不用 Math.max(...[]))
    expect(weekChartSource).toContain(
      "reduce((max, item) => Math.max(max, safeNumber(item.statements)), 0)",
    );
  });

  it("问候语拿不到小时数时退化成中性文案, 不是 undefined (空态之一)", () => {
    expect(greetingForHour(undefined)).toBe("夜深了");
    expect(greetingForHour(8)).toBe("早上好");
    expect(greetingForHour(13)).toBe("中午好");
    expect(greetingForHour(16)).toBe("下午好");
    expect(greetingForHour(21)).toBe("晚上好");
  });
});

/** 取某个 CSS 规则块 (选择器 → 第一个右花括号), 避免被别的形态的样式串味 */
function cssRule(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start === -1) throw new Error(`未找到样式: ${selector}`);

  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);

  return source.slice(start, close === -1 ? source.length : close);
}

/** 取工作台封面的模板片段 (v-if="isWorkbench" → 该 figure 的结束标签): 远程封面图与徽章都不许出现在这里 */
function workbenchCoverBlock(source: string): string {
  const start = source.indexOf('v-if="isWorkbench"');
  if (start === -1) throw new Error("未找到工作台封面的 v-if 分支");

  const end = source.indexOf("</figure>", start);

  return source.slice(start, end === -1 ? source.length : end);
}

describe("区块 5: 课程卡的工作台形态 (variant) —— 课程广场形态不受影响", () => {
  it("CoursePackCard 有 variant 概念: 缺省 default, 形态类由纯函数解析", () => {
    expect(cardSource).toContain("variant?: CoursePackCardVariant");
    expect(cardSource).toMatch(/variant:\s*"default"/);
    expect(coursePackCardUtils).toContain(
      'export type CoursePackCardVariant = "default" | "workbench"',
    );
    // 模板根节点的形态类来自纯函数, 组件里不内联形态判断
    expect(cardSource).toContain(':class="variantClass"');
    expect(cardSource).toContain("coursePackCardVariantClass(props.variant)");

    expect(resolveCoursePackCardVariant("workbench")).toBe("workbench");
    expect(resolveCoursePackCardVariant(undefined)).toBe("default");
  });

  it("default 形态保留课程广场的关键类 (rounded-2xl / shadow-soft), 且缺省就是 default", () => {
    const defaultRule = cssRule(cardSource, ".course-pack-card--default");

    expect(defaultRule).toContain("rounded-2xl");
    expect(defaultRule).toContain("shadow-soft");
    // 缺省形态 = 课程广场形态: 解析结果必须是 --default (拼错/大小写不符也不许跑到工作台)
    expect(coursePackCardVariantClass(undefined)).toBe("course-pack-card--default");
    expect(coursePackCardVariantClass("default")).toBe("course-pack-card--default");
    expect(coursePackCardVariantClass("Workbench")).toBe("course-pack-card--default");
  });

  it("workbench 形态: 白卡 + 1px #E5E7EB 边 + 圆角 12px + 无阴影 (靠色差分层)", () => {
    const rule = cssRule(cardSource, ".course-pack-card--wb").toLowerCase();

    expect(rule).toContain("border: 1px solid #e5e7eb");
    expect(rule).toContain("border-radius: 12px");
    expect(rule).toContain("background: #fff");
    expect(rule).toContain("box-shadow: none");
    expect(rule).not.toContain("shadow-soft");
    // hover 也不上浮 / 不投影 (那是营销形态的做法)
    expect(cssRule(cardSource, ".course-pack-card--wb:hover")).toContain("transform: none");
    expect(coursePackCardVariantClass("workbench")).toBe("course-pack-card--wb");
  });

  it("workbench 封面: 渐变色块 + 居中图标, 没有绿色「免费」徽章, 也不加载远程封面图", () => {
    const cover = workbenchCoverBlock(cardSource);

    expect(cover).toContain("coverGradient");
    expect(cover).toContain("coverIcon");
    expect(cover).not.toContain("bg-green-500");
    expect(cover).not.toContain("免费");
    expect(cover).not.toContain("NuxtImg");
    // 渐变按课程包 id 稳定取 (同一个包 = 同一张封面), 且是 wb 系渐变
    expect(coursePackCoverGradient("pack-a")).toContain("linear-gradient(");
    expect(coursePackCoverGradient("pack-a")).toBe(coursePackCoverGradient("pack-a"));
    expect(coursePackCoverIcon("pack-a")).not.toBe("");
    // 封面是**固定 72px 的细色条**(对齐设计稿 `.course .cover { height: 72px }`), 不是 16:9 大图
    expect(cssRule(cardSource, ".wb-cover")).toContain("height: 72px");
    expect(cssRule(cardSource, ".wb-cover")).not.toContain("aspect-video");
  });

  it("workbench 按钮: 整宽 + 圆角 8px + 单一主色 #2C5AF4 + 白字, 文案沿用 actions 纯函数", () => {
    const rule = cssRule(cardSource, ".wb-btn").toLowerCase();

    expect(rule).toContain("width: 100%");
    expect(rule).toContain("border-radius: 8px");
    expect(rule).toContain("background: #2c5af4");
    expect(rule).toContain("color: #fff");
    // 文案不许自己发明
    expect(cardSource).toContain("resolveCoursePackCardActionLabel");
    expect(cardSource).toContain("{{ actionLabel }}");
  });

  it("memberCenter 形态把卡片接到 workbench variant, 默认形态仍走 default", () => {
    expect(coursesSource).toMatch(
      /variant="memberCenter\s*\?\s*['"]workbench['"]\s*:\s*['"]default['"]"/,
    );
    // 不许无条件写死 workbench (那会把 /my-courses 的卡片也变成工作台样子)
    expect(coursesSource).not.toMatch(/variant="workbench"/);
    // 最后一格虚线「+ 添加课程」→ 课程广场 仍在
    expect(coursesSource).toContain("+ 添加课程");
    expect(coursesSource).toContain('to="/course-pack"');
  });

  it("反例守卫: 工作台形态不得出现落地页 (米黄 / 旧蓝) 那一套色值", () => {
    const workbenchSources =
      `${cardSource}\n${coursesSource}\n${coursePackCardUtils}`.toLowerCase();

    for (const color of ["#FBF7E8", "#2F6FE8", "#2563EB", "#5B6B80"]) {
      expect(workbenchSources).not.toContain(color.toLowerCase());
    }
  });

  it("工作台进度: 有真实进度显示 `第 N 课 · xx%`, 拿不到退化成课程包描述 (不编数字)", () => {
    expect(
      formatCoursePackProgressLine({ totalCourses: 4, completedCourses: 1, progress: 25 }),
    ).toBe("第 2 课 · 25%");
    // 空包 / 没有数据 → 空串
    expect(formatCoursePackProgressLine()).toBe("");
    expect(formatCoursePackProgressLine({ totalCourses: 0 })).toBe("");
    // 退化路径: 第二行回到课程包描述
    expect(resolveCoursePackCardMetaLine("日常英语口语 100 句")).toBe("日常英语口语 100 句");
    expect(
      resolveCoursePackCardMetaLine("日常英语口语 100 句", {
        totalCourses: 0,
        completedCourses: 0,
        progress: 0,
      }),
    ).toBe("日常英语口语 100 句");
    // 进度取自既有接口, 取数在 RecentCoursePack, 卡片只接 prop
    expect(coursesSource).toContain("fetchCoursePackProgress");
    expect(cardSource).toContain("resolveCoursePackCardMetaLine");
  });

  it("过期的首页巡检脚本 (含只服务它的 playwright 配置) 都不在了", () => {
    for (const stale of [
      "tests/verify-home-layout.sh",
      "tests/home-layout.e2e.ts",
      "tests/playwright.config.ts",
    ]) {
      expect(existsSync(join(process.cwd(), stale))).toBe(false);
    }
  });
});
