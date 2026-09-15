/**
 * 听写模式（整句播放）的发音验收。
 *
 * 为什么单独一个脚本：听写模式走的是**另一个 Audio 对象**（`englishSound/sentence.ts`
 * 的 `usePlaySentenceSound`），与普通模式的 `audio.ts` 不是同一处代码；而且它是
 * 「用户点一次才设源并播放」，预加载路径不覆盖它。**它是这次问题里受影响最重的功能**
 * （整句发音，有道读不出的句子最多），所以必须单独验。
 *
 * 断言：
 *   1. 开听写模式后点播放 → 请求自有音频（<当前句 hash>.mp3）
 *   2. 该句若无自有音频 → 请求本地 404 后回退有道
 *   3. 无异常 JS 报错（忽略预期内的媒体报错）
 *
 * 用法: node scripts/tts/tests/verify-dictation-pronunciation.mjs
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";
const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIO_DIR = join(REPO, "var/audio");
const BASE = "http://localhost:3000";
const API = "http://localhost:3001";
const PACK = "kyrtugjl8fa1f1k9kjv7ve9e";
const COURSE = process.env.COURSE_ID || "u9mjpktmnpvbjjkh29fvzwa3";

function fnv1a64(text) {
  const OFFSET = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

const { chromium } = require(PW);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);

const jsErrors = [];
page.on("pageerror", (e) => jsErrors.push(e.message));
const events = [];
page.on("request", (req) => {
  const u = req.url();
  if (u.includes("/audio/")) events.push({ kind: "self", status: "req", url: u });
  else if (u.includes("dict.youdao.com")) events.push({ kind: "youdao", status: "req", url: u });
});
page.on("response", (res) => {
  const u = res.url();
  if (u.includes("/audio/")) events.push({ kind: "self", status: res.status(), url: u });
  else if (u.includes("dict.youdao.com")) {
    events.push({ kind: "youdao", status: res.status(), url: u });
  }
});

await page.goto(`${BASE}/game/${PACK}/${COURSE}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

const statements = await page.evaluate(
  async ({ api, pack, course }) => {
    const r = await fetch(`${api}/course-pack/${pack}/courses/${course}`);
    const d = await r.json();
    return (d.statements || []).map((s) => s.english);
  },
  { api: API, pack: PACK, course: COURSE },
);
const current = statements[0];
const hash = fnv1a64(current);
const hasAudio = existsSync(join(AUDIO_DIR, `${hash}.mp3`));
console.log(`当前句「${current}」· 自有音频 ${hasAudio ? "已有" : "尚未生成"}`);

// 开听写模式（复选框 @change 触发；.check() 会保证状态）
const toggle = page.locator('input[aria-label="听写模式"]').first();
if (!(await toggle.count())) {
  console.log("✗ 找不到听写模式开关，页面结构可能变了");
  await browser.close();
  process.exit(1);
}
await toggle.check({ force: true });
await page.waitForTimeout(1200);

// 听写模式下工具栏出现播放按钮。
// ⚠️ iconify 的类名是 `i-ph:play-circle`（**冒号**，不是连字符），写错就永远找不到。
const playBtn = page.locator('[class*="i-ph:play-circle"]').first();
if (!(await playBtn.count())) {
  console.log("✗ 开听写模式后没出现播放按钮（整句发声入口）");
  await browser.close();
  process.exit(1);
}

const mark = events.length;
await playBtn.click({ force: true });
await page.waitForTimeout(2500);
const batch = events.slice(mark);

const selfReq = batch.filter((e) => e.kind === "self" && e.url.includes(`/${hash}.mp3`));
const youdaoReq = batch.filter((e) => {
  if (e.kind !== "youdao") return false;
  try {
    return decodeURIComponent(new URL(e.url).searchParams.get("audio") ?? "") === current;
  } catch {
    return false;
  }
});
console.log(
  `点播放后 → self=${JSON.stringify(selfReq.map((e) => e.status))} ` +
    `youdao=${JSON.stringify(youdaoReq.map((e) => e.status))}`,
);

const EXPECTED = [
  /user didn't interact with the document first/i,
  /no supported source was found/i,
  /The element has no supported sources/i,
];
const unexpected = jsErrors.filter((m) => !EXPECTED.some((re) => re.test(m)));

const fails = [];
if (hasAudio) {
  if (!selfReq.some((e) => e.status === 200)) {
    fails.push(`听写模式没请求到自有音频: ${JSON.stringify(selfReq.map((e) => e.status))}`);
  }
  if (youdaoReq.length)
    fails.push(`自有音频可用却仍请求有道: ${JSON.stringify(youdaoReq.map((e) => e.status))}`);
} else {
  if (!selfReq.some((e) => e.status === 404)) fails.push("无音频时应先请求自有音频（404）");
  if (!youdaoReq.length) fails.push("自有音频 404 后**没有回退**到有道 → 听写模式会静默无声");
}
if (unexpected.length) fails.push(`非预期 JS 报错: ${unexpected.slice(0, 2).join(" | ")}`);

console.log("\n=== 结果 ===");
for (const f of fails) console.log("  ✗ " + f);
console.log(fails.length ? `\n✗ 未通过（${fails.length} 项）` : "\n✓ 听写模式发音通过");
await browser.close();
process.exit(fails.length ? 1 : 0);
