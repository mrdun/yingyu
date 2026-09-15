/**
 * 诊断：听写模式的开关与播放按钮，在真实 DOM 里长什么样。
 * 用法: node scripts/tts/tests/debug-dictation.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";
const { chromium } = require(PW);

const BASE = "http://localhost:3000";
const PACK = "kyrtugjl8fa1f1k9kjv7ve9e";
const COURSE = "u9mjpktmnpvbjjkh29fvzwa3";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
page.setDefaultTimeout(15000);
await page.goto(`${BASE}/game/${PACK}/${COURSE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const before = await page.evaluate(() => ({
  mode: localStorage.getItem("gamePlayMode"),
  toggles: Array.from(document.querySelectorAll("input[type=checkbox]")).map((i) => ({
    label: i.getAttribute("aria-label"),
    checked: i.checked,
    cls: i.className,
  })),
}));
console.log("切换前:", JSON.stringify(before, null, 1));

const toggle = page.locator('input[aria-label="听写模式"]').first();
console.log("找到听写开关:", await toggle.count());
await toggle
  .check({ force: true })
  .catch((e) => console.log("check 失败:", e.message.slice(0, 80)));
await page.waitForTimeout(1500);

const after = await page.evaluate(() => {
  const icons = Array.from(document.querySelectorAll('[class*="ph-"]')).map((e) => e.className);
  // 工具栏文本（含"听写模式"那一块）与所有可点元素
  const clickables = Array.from(
    document.querySelectorAll("[class*='clickable'], [class*='cursor']"),
  )
    .slice(0, 12)
    .map((e) => ({
      tag: e.tagName,
      cls: e.className.slice(0, 70),
      title: e.getAttribute("title"),
    }));
  return {
    mode: localStorage.getItem("gamePlayMode"),
    checked: Array.from(document.querySelectorAll("input[type=checkbox]")).map((i) => i.checked),
    phIconClasses: [...new Set(icons)].slice(0, 20),
    clickables,
    bodySnippet: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
  };
});
console.log("\n切换后:", JSON.stringify(after, null, 1));
await browser.close();
