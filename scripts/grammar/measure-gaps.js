/**
 * 量相邻胶囊之间的**实际间隙**（视觉模型说「挤成一团」，用数字判断真假）。
 * 用法: node measure-gaps.js <effect-page.html> [句序号...]
 */
const path = require("path");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";

(async () => {
  const file = process.argv[2];
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1040, height: 1100 } });
  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), { waitUntil: "load" });
  await page.waitForTimeout(300);

  // 默认句 + 最长句
  const targets = [await page.evaluate(() => 0), null];
  const longest = await page.evaluate(() => {
    let b = 0;
    for (let i = 0; i < window.__grammarPage.count(); i++)
      if (window.__grammarPage.raw(i).w.length > window.__grammarPage.raw(b).w.length) b = i;
    return b;
  });

  for (const [label, idx] of [
    ["默认句", "default"],
    ["最长句", longest],
  ]) {
    const r = await page.evaluate((i) => {
      if (i !== "default") window.__grammarPage.goto(i);
      const out = [];
      document.querySelectorAll("#rows > .sent").forEach((sent, ri) => {
        const grps = Array.from(sent.querySelectorAll(":scope > .grp"));
        const gb = grps.map((g) => g.getBoundingClientRect());
        const caps = grps.map((g) => g.querySelector(".cap").getBoundingClientRect());
        const gaps = [],
          capGaps = [];
        for (let k = 1; k < gb.length; k++) {
          gaps.push(Math.round(gb[k].left - gb[k - 1].right));
          capGaps.push(Math.round(caps[k].left - caps[k - 1].right));
        }
        out.push({
          row: ri + 1,
          groups: grps.length,
          组间隙: gaps,
          胶囊间隙: capGaps,
          行宽: Math.round(sent.getBoundingClientRect().width),
          组总宽: Math.round(gb.reduce((a, b) => a + b.width, 0)),
        });
      });
      return out;
    }, idx);
    const en = await page.evaluate(
      (i) =>
        i === "default"
          ? document.getElementById("en").textContent
          : window.__grammarPage.raw(i).en,
      idx,
    );
    console.log(`\n【${label}】${en}`);
    for (const row of r) {
      console.log(
        `  第${row.row}段: ${row.groups} 个成分 · 组间隙 ${JSON.stringify(row.组间隙)} · ` +
          `胶囊间隙 ${JSON.stringify(row.胶囊间隙)}`,
      );
      console.log(
        `         组总宽 ${row.组总宽}px / 行宽 ${row.行宽}px` +
          ` → 剩余留白 ${row.行宽 - row.组总宽}px`,
      );
    }
  }
  await browser.close();
})();
