/**
 * 抓效果页的几种状态图（内部自检用，交付物是页面本身）。
 * 用法: node shot-effect-states.js <html> <输出目录前缀>
 */
const path = require("path");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";

(async () => {
  const file = process.argv[2];
  const out = process.argv[3] || "C:/Users/mrdun/AppData/Local/Temp/ew-effect";
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  async function shot(name, width, prep) {
    const page = await browser.newPage({ viewport: { width, height: 1100 }, deviceScaleFactor: 2 });
    await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), { waitUntil: "load" });
    await page.waitForTimeout(350);
    if (prep) await page.evaluate(prep);
    await page.waitForTimeout(300);
    const p = `${out}-${name}.png`;
    await page.screenshot({ path: p, fullPage: true });
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    console.log(`${name}: ${p}  (${width}x${h})`);
    await page.close();
  }

  const LONG = () => {
    let best = 0;
    for (let i = 0; i < window.__grammarPage.count(); i++) {
      if (window.__grammarPage.raw(i).w.length > window.__grammarPage.raw(best).w.length) best = i;
    }
    window.__grammarPage.goto(best);
  };

  await shot("1-default", 1040, null);
  await shot("2-long-break", 1040, LONG);
  await shot("3-long-nobreak", 1040, () => {
    document.querySelector('#toggles button[data-t="clause"]').click();
    let best = 0;
    for (let i = 0; i < window.__grammarPage.count(); i++) {
      if (window.__grammarPage.raw(i).w.length > window.__grammarPage.raw(best).w.length) best = i;
    }
    window.__grammarPage.goto(best);
  });
  await shot("4-frag", 1040, () => {
    document.querySelector('#filter button[data-f="frag"]').click();
    window.__grammarPage.goto(2);
  });
  await browser.close();
})();
