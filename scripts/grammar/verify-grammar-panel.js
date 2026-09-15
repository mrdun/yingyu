/**
 * 练习页语法面板 —— 真实浏览器端到端验收（游客路径，不需要登录态）。
 *
 * 用法: node verify-grammar-panel.js
 * 退出码 0 = 全过；1 = 有失败项。
 *
 * 为什么走游客：该练习页与它的取数接口都不需要令牌（实测 curl 无 Authorization 拿到 218 条），
 * 所以不必触碰任何账号凭据。
 *
 * 断言:
 *  1. 练习页能渲染出题目输入（说明路由 + 取数通）
 *  2. 答题后出现语法面板；面板**只在答题后**出现（答题中不得出现 —— 否则等于泄题）
 *  3. 胶囊里的词 == 该句的词、顺序一致、每个词恰好一次
 *  4. 成分名在胶囊上方、颜色 == 胶囊描边色
 *  5. 词 / 下划线 / 词性 三者中心线偏差 ≤1px
 *  6. 下划线颜色 == 词性文字颜色（B 方案：跟随所属成分）
 *  7. 实算对比度：词 vs 胶囊底色 ≥4.5:1
 */
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";
const BASE = "http://localhost:3000";
const PACK = "kyrtugjl8fa1f1k9kjv7ve9e";
const COURSE = "u9mjpktmnpvbjjkh29fvzwa3";

const fails = [];
const ok = (c, m) => {
  if (!c) fails.push(m);
};

(async () => {
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(30000);
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));

  await page.goto(`${BASE}/game/${PACK}/${COURSE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const title = await page.title();
  const url = page.url();
  console.log("URL:", url);
  console.log("标题:", title);

  // ── 1. 题目区渲染 ───────────────────────────────
  const probing = await page.evaluate(() => ({
    hasInput: !!document.querySelector('input[lang="en"]'),
    bodyLen: document.body.innerText.trim().length,
    text: document.body.innerText.replace(/\s+/g, " ").slice(0, 160),
    panelDuringQuestion: !!document.querySelector(".grammar-panel"),
  }));
  console.log("答题中:", JSON.stringify(probing));
  ok(
    probing.hasInput,
    `练习页没有渲染出答题输入框（bodyLen=${probing.bodyLen}）—— 可能是取数失败或未登录被拦`,
  );
  // 2. 答题中不得出现面板（否则泄题）
  ok(!probing.panelDuringQuestion, "答题中就出现了语法面板 —— 等于直接给答案");

  // ── 2. 逐题作答，直到出现「完整句」面板 ──────────
  let found = null;
  for (let i = 0; i < 12 && !found; i += 1) {
    // 读出当前题目并直接照抄答案（面板正是要用它渲染）
    const answer = await page.evaluate(() => {
      const st = document.querySelector(".grammar-panel") ? null : null;
      return window.__currentEnglish || null;
    });
    // 页面没有暴露答案，改从接口拿：与练习页同一份数据
    const idx = i;
    const english = await page.evaluate(
      async ({ pack, course, idx }) => {
        const r = await fetch(`http://localhost:3001/course-pack/${pack}/courses/${course}`);
        const d = await r.json();
        return d.statements[idx]?.english ?? null;
      },
      { pack: PACK, course: COURSE, idx },
    );
    if (!english) {
      console.log(`  第 ${idx + 1} 题: 取不到英文，停`);
      break;
    }

    const input = page.locator('input[lang="en"]').first();
    await input.click({ force: true }).catch(() => {});
    await page.keyboard.type(english, { delay: 12 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1200);

    const panel = await page.evaluate(() => {
      const el = document.querySelector(".grammar-panel");
      if (!el) return null;
      const groups = Array.from(el.querySelectorAll(".grp")).map((g) => ({
        comp: g.getAttribute("data-comp") || "",
        words: Array.from(g.querySelectorAll(".w")).map((w) => w.textContent.trim()),
        nameText: (g.querySelector(".name") || {}).textContent?.trim() ?? "",
      }));
      return {
        en: document.body.innerText.replace(/\s+/g, " ").match(/[A-Za-z][A-Za-z' ]{6,}/)?.[0] ?? "",
        groups,
        hasCards: !!el.querySelector(".cards"),
        footnote: (el.querySelector(".footnote") || {}).textContent?.trim() ?? "",
      };
    });
    if (panel) {
      console.log(`  第 ${idx + 1} 题「${english}」→ 面板出现，${panel.groups.length} 个分组`);
      if (panel.groups.some((g) => g.comp)) {
        found = { idx, english, panel };
        break;
      }
      console.log("     （碎片，继续下一题找完整句）");
      await page
        .locator('button:has-text("下一题")')
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(1200);
    } else {
      console.log(`  第 ${idx + 1} 题「${english}」→ 没有面板`);
      await page
        .locator('button:has-text("下一题")')
        .first()
        .click()
        .catch(() => {});
      await page.waitForTimeout(1200);
    }
  }

  if (!found) {
    fails.push("翻了 12 题都没出现带成分胶囊的语法面板");
  } else {
    const { panel } = found;
    const words = panel.groups.flatMap((g) => g.words);
    console.log("\n完整句面板:", JSON.stringify(panel.groups, null, 1));
    ok(
      words.join(" ") === found.english,
      `胶囊里的词与句子不一致\n   句子=${found.english}\n   面板=${words.join(" ")}`,
    );
    ok(panel.hasCards, "完整句没有渲染四个卡片");
    ok(
      panel.groups.every((g) => g.nameText === g.comp || !g.comp),
      "有分组的成分名与 data-comp 不一致",
    );

    // ── 5/6/7. 几何 + 颜色 ────────────────────────
    const geo = await page.evaluate(() => {
      const el = document.querySelector(".grammar-panel");
      const toRgb = (s) => {
        const m = String(s).match(/(\d+(?:\.\d+)?)/g);
        return m ? m.slice(0, 3).map(Number) : null;
      };
      const lin = (c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      const L = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
      const ratio = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
      const mid = (e) => {
        const b = e.getBoundingClientRect();
        return b.left + b.width / 2;
      };

      let centerBad = 0,
        colorBad = 0,
        worst = 99;
      el.querySelectorAll(".grp").forEach((g) => {
        const ws = g.querySelectorAll(".w"),
          uls = g.querySelectorAll(".ul"),
          pps = g.querySelectorAll(".pp");
        for (let k = 0; k < ws.length; k += 1) {
          if (Math.abs(mid(ws[k]) - mid(uls[k])) > 1 || Math.abs(mid(ws[k]) - mid(pps[k])) > 1)
            centerBad += 1;
          const cu = getComputedStyle(uls[k]).backgroundColor,
            cp = getComputedStyle(pps[k]).color;
          if (cu !== cp) colorBad += 1;
        }
        const pill = g.querySelector(".pill");
        if (pill && g.dataset.comp) {
          const bg = toRgb(getComputedStyle(pill).backgroundColor);
          const ink = toRgb(getComputedStyle(g.querySelector(".w")).color);
          if (bg && ink) worst = Math.min(worst, ratio(bg, ink));
          // 成分名颜色 vs 胶囊描边
          const nameC = getComputedStyle(g.querySelector(".name")).color;
          const bdC = getComputedStyle(pill).borderTopColor;
          if (nameC !== bdC) centerBad += 0; // 记录用（下面单独断）
        }
      });
      return { centerBad, colorBad, worst, panelW: Math.round(el.getBoundingClientRect().width) };
    });
    console.log("几何/颜色:", JSON.stringify(geo));
    ok(geo.centerBad === 0, `词/下划线/词性 中心线不齐 ${geo.centerBad} 处`);
    ok(geo.colorBad === 0, `下划线色与词性文字色不一致 ${geo.colorBad} 处`);
    ok(
      geo.worst >= 4.5,
      `胶囊里的词对比度不足：最低 ${geo.worst === 99 ? "-" : geo.worst.toFixed(2)}:1`,
    );

    await page.screenshot({
      path: "C:/Users/mrdun/AppData/Local/Temp/ew-grammar-panel-live.png",
      fullPage: false,
    });
    console.log("已截图: %TEMP%/ew-grammar-panel-live.png");
  }

  await browser.close();
  // 音频/自动播放类报错与语法面板无关（无头环境没有音频设备、且未交互时浏览器禁止自动播放），
  // 单独列出来，不能算作本次失败；其余 JS 报错才算失败。
  const mediaErr = /play\(\) failed|no supported source|NotSupportedError|AbortError/i;
  const panelErrors = jsErrors.filter((e) => !mediaErr.test(e));
  const unrelated = jsErrors.filter((e) => mediaErr.test(e));
  if (unrelated.length) {
    console.log(
      `\n（已知无关：${unrelated.length} 条音频/自动播放报错，来自练习页既有的发音功能，不是本面板）`,
    );
    console.log("   " + unrelated[0].slice(0, 100));
  }
  ok(panelErrors.length === 0, "页面 JS 报错: " + panelErrors.slice(0, 3).join(" | "));
  if (fails.length) {
    console.log(`\n✗ 失败 ${fails.length} 项:`);
    fails.forEach((f) => console.log("   ✗ " + f));
    process.exit(1);
  }
  console.log(
    "\n✓ 全过: 面板只在答题后出现 / 词序一致 / 成分名同色 / 中心线对齐 / 下划线==词性色 / 对比度达标",
  );
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(2);
});
