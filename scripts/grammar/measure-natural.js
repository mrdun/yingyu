/**
 * 量出每条句子的自然单行宽度（配合 measure-probe.py 生成的页面）。
 *
 * 用法: node measure-natural.js <html> --json <out.json>
 *
 * 输出每条: {key, words, groups, naturalW}。rowGap 是成分组之间的间隔,
 * 换算任意面板宽时用它算「最坏情况下要占几行」的近似。
 */
const path = require("path");
const fs = require("fs");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";

(async () => {
  const file = process.argv[2];
  const i = process.argv.indexOf("--json");
  const jsonOut = i > -1 ? process.argv[i + 1] : null;
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 4200, height: 1000 } });
  page.setDefaultTimeout(240000);
  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  await page.waitForTimeout(800);

  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".probe").forEach((p) => {
      const sentRows = Array.from(p.querySelectorAll(".rows > .sent"));
      let natural = 0,
        totalGroups = 0,
        words = 0;
      sentRows.forEach((r) => {
        const grps = Array.from(r.querySelectorAll(":scope > .grp"));
        totalGroups += grps.length;
        words += r.querySelectorAll(".w").length;
        // 该行排成一行需要的宽度 = 各行内成分组宽度之和 + 组间间隔
        const sum = grps.reduce((a, g) => a + g.getBoundingClientRect().width, 0);
        const gaps = Math.max(0, grps.length - 1) * 16;
        natural = Math.max(natural, sum + gaps);
      });
      out.push({
        key: p.dataset.key,
        words,
        groups: totalGroups,
        rows: sentRows.length,
        naturalW: Math.round(natural),
      });
    });
    return out;
  });
  await browser.close();
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows), "utf-8");
  console.log(
    `量到 ${rows.length} 条; 自然宽 min=${Math.min(...rows.map((r) => r.naturalW))} ` +
      `max=${Math.max(...rows.map((r) => r.naturalW))}; 行数>1 的 ${rows.filter((r) => r.rows > 1).length} 条`,
  );
  process.exit(0);
})();
