/**
 * 测量「句子在给定宽度下占几行」。
 *
 * 用法: node measure-rows.js <html文件> [--json <输出>]
 *
 * 页面里每个待测句子放在 <div class="probe" data-w="<宽度>" data-key="<标识>"> 内,
 * 内部按 render-preview.py 的 .sent 结构渲染。脚本按 .grp 的 offsetTop 去重得到行数。
 *
 * 为什么这样测: 光看词数估宽度会算错 —— 成分组之间的间隔、长单词、字号都影响。
 * 必须在真实浏览器里量。
 */
const path = require("path");
const fs = require("fs");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: node measure-rows.js <html> [--json out.json]");
    process.exit(2);
  }
  const jsonOut = (() => {
    const i = process.argv.indexOf("--json");
    return i > -1 ? process.argv[i + 1] : null;
  })();
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(180000);
  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(600);

  const rows = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll(".probe").forEach((p) => {
      const sentRows = Array.from(p.querySelectorAll(".rows > .sent"));
      // 注意区分两种「行」:
      //   clauseRows = 按从句边界**有意**分出的行数 (so/and/but 另起一行)
      //   wrapRows   = 因宽度不够而**被迫换行**的额外行数 —— 这才是「太长」的判据
      let wrapRows = 0;
      sentRows.forEach((r) => {
        const tops = [
          ...new Set(
            Array.from(r.querySelectorAll(":scope > .grp")).map((g) =>
              Math.round(g.getBoundingClientRect().top),
            ),
          ),
        ];
        wrapRows += Math.max(0, tops.length - 1);
      });
      out.push({
        key: p.dataset.key,
        w: Number(p.dataset.w),
        words: p.querySelectorAll(".rows .w").length,
        clauseRows: sentRows.length,
        lines: sentRows.length + wrapRows,
        wrapRows,
      });
    });
    return out;
  });
  await browser.close();

  const widths = [...new Set(rows.map((r) => r.w))].sort((a, b) => a - b);
  const summary = [];
  for (const w of widths) {
    const set = rows.filter((r) => r.w === w);
    const noWrap = set.filter((r) => r.wrapRows === 0).length;
    const maxClause = Math.max(...set.map((r) => r.clauseRows));
    const maxWrap = Math.max(...set.map((r) => r.wrapRows));
    summary.push({
      面板宽: w,
      样本: set.length,
      不换行: noWrap,
      不换行占比: +((100 * noWrap) / set.length).toFixed(1),
      单行句: set.filter((r) => r.clauseRows === 1).length,
      最多从句行: maxClause,
      最多额外换行: maxWrap,
    });
  }
  console.table(summary);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary, rows }, null, 1), "utf-8");
  console.log("\n「不换行」= 没有任何一行因宽度不够而折行（从句断行不算折行）");
  process.exit(0);
})();
