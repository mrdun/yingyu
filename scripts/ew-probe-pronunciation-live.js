/**
 * 只做一件事：把练习页发出的每一次有声发音请求，连同**请求文本**和**响应码**原样打印。
 * 不做任何推断或配对逻辑 —— 上一版就是被自己的配对逻辑误导的。
 * 用法: node ew-probe-audio-raw.js
 */
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";
const BASE = "http://localhost:3000";
const API = "http://localhost:3001";
const PACK = "kyrtugjl8fa1f1k9kjv7ve9e";
const COURSE = process.env.COURSE_ID || "u9mjpktmnpvbjjkh29fvzwa3";

(async () => {
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(5000);

  page.on("response", (res) => {
    const u = res.url();
    if (!u.includes("dict.youdao.com")) return;
    const p = new URL(u).searchParams;
    console.log(
      `RESP ${res.status()} | type=${p.get("type")} | 原始audio=${p.get("audio")} ` +
        `| 解码后=${decodeURIComponent(p.get("audio") || "")}`,
    );
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("dict.youdao.com")) {
      console.log(`FAILED ${req.failure()?.errorText} | ${req.url()}`);
    }
  });

  await page.goto(`${BASE}/game/${PACK}/${COURSE}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const list = await page.evaluate(
    async ({ api, pack, course }) => {
      const r = await fetch(`${api}/course-pack/${pack}/courses/${course}`);
      const d = await r.json();
      return (d.statements || []).map((s) => s.english);
    },
    { api: API, pack: PACK, course: COURSE },
  );

  // 逐题前进；每题打印「页面当前显示的英文」，便于与上面 RESP 行对齐
  for (let i = 0; i < 8; i += 1) {
    console.log(`--- 第 ${i + 1} 题: ${list[i]}`);
    const input = page.locator('input[lang="en"]').first();
    await input.click({ force: true, timeout: 4000 }).catch(() => {});
    await page.keyboard.type(list[i], { delay: 5 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1500);
    const next = page.locator('button:has-text("下一题")').first();
    if (await next.count()) {
      await next.click({ force: true, timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  await browser.close();
  process.exit(0);
})();
