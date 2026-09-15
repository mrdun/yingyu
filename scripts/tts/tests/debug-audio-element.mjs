/**
 * 诊断：练习页里的 <audio> 元素到底被设成了什么 src。
 *
 * 为什么要抓元素：静态读代码无法区分「没设置源」「设成了错地址」「设了但被 autoplay 挡住」，
 * 而这三者的表现都是「没有声音」。这里在页面加载前劫持 Audio 构造器，拿到所有实例。
 *
 * 用法: node scripts/tts/tests/debug-audio-element.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";
const { chromium } = require(PW);

const BASE = "http://localhost:3000";
const PACK = "kyrtugjl8fa1f1k9kjv7ve9e";
const COURSE = "u9jmpktmnpvbjjkh29fvzwa3".replace("u9jm", "u9mj");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

// 关键：在页面任何脚本之前劫持 Audio，记录所有实例
await page.addInitScript(() => {
  const Orig = window.Audio;
  window.__audios = [];
  // @ts-expect-error 故意替换构造器
  window.Audio = function Audio(...args) {
    const el = new Orig(...args);
    window.__audios.push(el);
    return el;
  };
  window.Audio.prototype = Orig.prototype;
});

const consoleMsgs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleMsgs.push(`${m.type()}: ${m.text()}`);
});
page.on("pageerror", (e) => consoleMsgs.push(`pageerror: ${e.message}`));

const reqs = [];
page.on("request", (r) => {
  const u = r.url();
  if (u.includes("youdao") || u.includes("/audio/")) reqs.push(u.slice(0, 110));
});

await page.goto(`${BASE}/game/${PACK}/${COURSE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

const dump = async (tag) => {
  const state = await page.evaluate(() =>
    (window.__audios || []).map((a, i) => ({
      i,
      src: a.src,
      paused: a.paused,
      readyState: a.readyState,
      error: a.error ? `${a.error.code}:${a.error.message}` : null,
      preload: a.preload,
    })),
  );
  console.log(`\n=== ${tag} ===`);
  for (const s of state) {
    console.log(
      `  audio#${s.i} readyState=${s.readyState} paused=${s.paused} ` + `preload=${s.preload}`,
    );
    console.log(`     src=${s.src || "(空)"}`);
    if (s.error) console.log(`     error=${s.error}`);
  }
  if (!state.length) console.log("  （页面里没有任何 Audio 实例）");
  console.log(`  已发请求: ${JSON.stringify(reqs.slice(-6), null, 0)}`);
};

await dump("进入页面后（应已预加载当前句发音）");

// 手动触发一次播放
await page.keyboard.press("Control+`").catch(() => {});
await page.waitForTimeout(2000);
await dump("按下播放发音快捷键后");

// 页面内直接验一次自有音频是否可达（证明网络没问题）
const probe = await page.evaluate(async () => {
  const r = await fetch("/audio/5927fe7541e21760.mp3", { method: "GET" });
  return { status: r.status, type: r.headers.get("content-type") };
});
console.log(`\n页面内取自有音频: HTTP ${probe.status} ${probe.type}`);

if (consoleMsgs.length) {
  console.log("\n=== 控制台报错/警告 ===");
  for (const m of consoleMsgs.slice(0, 10)) console.log("  " + m.slice(0, 200));
}
await browser.close();
