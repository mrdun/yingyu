/**
 * 抓效果页几种状态图（内部自检用，交付物是页面本身）。
 * 用法: node shot-effect-states.js <html> <输出前缀>
 *
 * ⚠️ prep 函数是**在页面里序列化执行**的，不能引用本文件的 Node 变量/函数
 *   （踩过：`longest is not defined`）。要复用的逻辑必须内联进每个 prep。
 */
const path = require("path");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";

const GO_LONGEST = `
  let b = 0;
  for (let i = 0; i < window.__grammarPage.count(); i++)
    if (window.__grammarPage.raw(i).w.length > window.__grammarPage.raw(b).w.length) b = i;
  window.__grammarPage.goto(b);
`;

(async () => {
  const file = process.argv[2];
  const out = process.argv[3] || "C:/Users/mrdun/AppData/Local/Temp/ew-effect";
  const { chromium } = require(PW);
  const browser = await chromium.launch();

  async function shot(name, prepJs) {
    const page = await browser.newPage({
      viewport: { width: 1080, height: 1300 },
      deviceScaleFactor: 2,
    });
    await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), { waitUntil: "load" });
    await page.waitForTimeout(350);
    if (prepJs) await page.evaluate(prepJs);
    await page.waitForTimeout(300);
    const p = `${out}-${name}.png`;
    await page.screenshot({ path: p, fullPage: true });
    console.log(`${name}: ${p}`);
    await page.close();
  }

  await shot("A-default", null); // A 方案 + 默认短句
  await shot("A-long", GO_LONGEST); // A 方案 + 最长句
  await shot("B-long", `window.__grammarPage.setScheme("B"); ${GO_LONGEST}`); // B 方案 + 最长句
  await shot("A-nobreak", `document.getElementById("clause").click(); ${GO_LONGEST}`);
  await browser.close();
})();
