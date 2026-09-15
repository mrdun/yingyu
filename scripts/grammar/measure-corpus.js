/**
 * 用**真实效果页**跑全库宽度测量（替代早先那套按旧版几何的合成测量）。
 *
 * 用法: node measure-corpus.js <effect-page.html> [--json out.json]
 *
 * 为什么必须重测: 版式改了（成分组间距 16→46px、新增「成分名」一行、胶囊里装词），
 * 早先记在 COURSE_CREATION_FORMAT.md §10 的宽度数字基于旧几何，已失效。
 *
 * 输出: 每个面板宽下的「不换行」比例、最多折行数、以及最长的几条句子。
 */
const path = require("path");
const fs = require("fs");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";
const WIDTHS = [680, 820, 960, 1100, 1280, 1440];

(async () => {
  const file = process.argv[2];
  const i = process.argv.indexOf("--json");
  const jsonOut = i > -1 ? process.argv[i + 1] : null;
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(180000);
  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), {
    waitUntil: "load",
    timeout: 180000,
  });
  await page.waitForTimeout(400);

  const n = await page.evaluate(() => window.__grammarPage.count());
  const all = [];

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(200);
    const rows = await page.evaluate((count) => {
      const out = [];
      for (let k = 0; k < count; k++) {
        const it = window.__grammarPage.raw(k);
        if (!it.s) continue; // 只量完整句（碎片没有成分胶囊）
        window.__grammarPage.goto(k);
        const rowsEl = document.getElementById("rows");
        const sentRows = Array.from(rowsEl.querySelectorAll(":scope > .sent"));
        let natural = 0,
          wrap = 0;
        for (const sr of sentRows) {
          const grps = Array.from(sr.querySelectorAll(":scope > .grp"));
          const sum = grps.reduce((a, g) => a + g.getBoundingClientRect().width, 0);
          natural = Math.max(natural, Math.round(sum + Math.max(0, grps.length - 1) * 46));
          const tops = new Set(grps.map((g) => Math.round(g.getBoundingClientRect().top)));
          wrap += Math.max(0, tops.size - 1);
        }
        out.push({
          o: it.o,
          words: it.w.length,
          en: it.en,
          natural,
          clauseRows: sentRows.length,
          wrap,
          avail: Math.round(rowsEl.getBoundingClientRect().width),
        });
      }
      return out;
    }, n);
    rows.forEach((r) => all.push({ ...r, width: w }));
    const nowrap = rows.filter((r) => r.wrap === 0).length;
    const worst = rows.slice().sort((a, b) => b.natural - a.natural)[0];
    console.log(
      `${String(w).padStart(4)}px: 完整句 ${rows.length} 条 · 不折行 ${nowrap} ` +
        `(${((100 * nowrap) / rows.length).toFixed(1)}%) · 最多折行 ${Math.max(...rows.map((r) => r.wrap))} · ` +
        `最大单行需 ${worst.natural}px（${worst.words} 词）`,
    );
  }

  // 各面板宽下「折行」的句子（就是真正需要关注的）
  console.log("\n折行句（按 960px 面板宽）:");
  const at960 = all
    .filter((r) => r.width === 960 && r.wrap > 0)
    .sort((a, b) => b.natural - a.natural);
  if (!at960.length) console.log("  无 —— 960px 下所有完整句都不折行 ✓");
  else
    at960
      .slice(0, 12)
      .forEach((r) =>
        console.log(
          `  [${r.o}] ${r.words} 词 · 单行需 ${r.natural}px · 折行 ${r.wrap} 次 · ${r.en}`,
        ),
      );

  // 按词数看不折行率（960px）
  console.log("\n按词数看不折行率（960px）:");
  const byW = {};
  all.filter((r) => r.width === 960).forEach((r) => (byW[r.words] = byW[r.words] || []).push(r));
  Object.keys(byW)
    .map(Number)
    .sort((a, b) => a - b)
    .forEach((k) => {
      const s = byW[k],
        okN = s.filter((r) => r.wrap === 0).length;
      if (k <= 16)
        console.log(
          `  ${String(k).padStart(2)} 词: ${s.length} 条 · 不折行 ${((100 * okN) / s.length).toFixed(0)}%`,
        );
    });

  await browser.close();
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(all), "utf-8");
  const bad = all.filter((r) => r.wrap > 0 && r.width === 960).length;
  console.log(`\n960px 下折行的句子: ${bad} 条`);
  process.exit(0);
})();
