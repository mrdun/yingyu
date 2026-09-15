/**
 * 真实浏览器验收：练习页播放发音时，是否真的走我们的音频、缺失时是否回退有道。
 *
 * 断言（不看截图，看网络与 DOM）：
 *   1. 有自有音频的句子 → 请求 /audio/<hash>.mp3 且 200；**不得**再请求有道
 *   2. 没有自有音频的句子 → 本地音频 404 后**必须**回退请求有道（这是防「静默无声」的关键）
 *   3. 页面上没有 JS 报错
 *
 * 用法: node scripts/tts/tests/verify-pronunciation-live.mjs
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

// 记录每一次发音相关的请求。
// ⚠️ 用 request 事件而不是 response：浏览器对 <audio> 的跨域媒体请求可能在
// 响应阶段以 ERR_BLOCKED_BY_ORB 等形式出现且**不触发 response**，只看 response 会
// 误判成「根本没发请求」（本文件第一版就踩过，白排查一轮）。
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
page.on("requestfailed", (req) => {
  const u = req.url();
  if (u.includes("dict.youdao.com")) events.push({ kind: "youdao", status: "net-fail", url: u });
  else if (u.includes("/audio/")) events.push({ kind: "self", status: "net-fail", url: u });
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

const hasAudio = statements.map((t) => existsSync(join(AUDIO_DIR, `${fnv1a64(t)}.mp3`)));
console.log(
  `该课 ${statements.length} 句：已有音频 ${hasAudio.filter(Boolean).length} 句，` +
    `待生成 ${hasAudio.filter((x) => !x).length} 句`,
);

// 找出前若干个「有音频」与「无音频」的下标，作为两个受测样本
const withAudio = hasAudio
  .map((v, i) => (v ? i : -1))
  .filter((i) => i >= 0)
  .slice(0, 3);
const withoutAudio = hasAudio
  .map((v, i) => (v ? -1 : i))
  .filter((i) => i >= 0)
  .slice(0, 3);
console.log(
  `受测：有音频下标 ${JSON.stringify(withAudio)} · 无音频下标 ${JSON.stringify(withoutAudio)}`,
);

const results = [];
let cursor = 0;
// ⚠️ 记录窗口必须覆盖「题目切换」那一刻：预加载是在切题时触发的，
// 而按播放键只是复用已加载的音频（readyState=4）**不会再发请求** ——
// 第一版在按播放键之后才开窗口，于是永远看到空数组。
let mark = 0;

for (const idx of [...withAudio, ...withoutAudio].sort((a, b) => a - b)) {
  // 切到目标题（切题会触发该句的发音预加载）
  while (cursor < idx) {
    const input = page.locator('input[lang="en"]').first();
    await input.click({ force: true }).catch(() => {});
    await page.keyboard.type(statements[cursor] ?? "", { delay: 4 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(700);
    const next = page.locator('button:has-text("下一题")').first();
    if (await next.count()) {
      await next.click({ force: true }).catch(() => {});
      await page.waitForTimeout(900);
    }
    cursor += 1;
  }
  await page.waitForTimeout(1200);
  const batch = events.slice(mark);
  mark = events.length;

  const sentence = statements[idx];
  const hash = fnv1a64(sentence);
  const selfReq = batch.filter((e) => e.kind === "self");
  const youdaoReq = batch.filter((e) => e.kind === "youdao");
  results.push({
    idx,
    sentence,
    hash,
    expectedSelf: hasAudio[idx],
    self: selfReq.map((e) => e.status),
    youdao: youdaoReq.map((e) => e.status),
  });
  console.log(
    `  [${idx}] ${hasAudio[idx] ? "应走自有" : "应回退"} 「${sentence.slice(0, 40)}」` +
      ` → self=${JSON.stringify(selfReq.map((e) => e.status))} ` +
      `youdao=${JSON.stringify(youdaoReq.map((e) => e.status))}`,
  );
}

// ---- 判定 ----
/**
 * 预期内的媒体报错，不算缺陷：
 *  - autoplay 策略：无用户手势时 play() 被拒（无头环境必然出现，与发音源无关）
 *  - "no supported source"：**正是回退链被触发时**浏览器对 404 音频的报错，
 *    没有它就不会回退 —— 把它当失败等于要求回退功能不存在
 */
const EXPECTED_MEDIA_ERRORS = [
  /user didn't interact with the document first/i,
  /no supported source was found/i,
  /The element has no supported sources/i,
];
const unexpectedErrors = jsErrors.filter((m) => !EXPECTED_MEDIA_ERRORS.some((re) => re.test(m)));

const fails = [];
if (!withoutAudio.length) {
  console.log(
    "提示：该课所有句子都已有音频，本次未覆盖「404 后回退」分支（该分支由 " +
      "apps/client/utils/tests/pronunciationAudio.spec.ts 的单元测试确定性覆盖）",
  );
}
for (const r of results) {
  if (r.expectedSelf) {
    if (!r.self.includes(200))
      fails.push(`[${r.idx}] 有音频却没请求到自有音频: ${JSON.stringify(r.self)}`);
    if (r.youdao.length) {
      fails.push(
        `[${r.idx}] 自有音频可用却仍请求了有道（应优先自有）: ${JSON.stringify(r.youdao)}`,
      );
    }
  } else {
    if (!r.self.includes(404)) {
      fails.push(`[${r.idx}] 无音频时未请求自有音频（应 404 后回退）: ${JSON.stringify(r.self)}`);
    }
    if (!r.youdao.length) {
      fails.push(`[${r.idx}] 自有音频 404 后**没有回退**到有道 → 会静默无声`);
    }
  }
}
if (unexpectedErrors.length) {
  fails.push(
    `非预期 JS 报错 ${unexpectedErrors.length} 条: ${unexpectedErrors.slice(0, 3).join(" | ")}`,
  );
}

console.log("\n=== 结果 ===");
for (const f of fails) console.log("  ✗ " + f);
console.log(
  fails.length
    ? `\n✗ 未通过（${fails.length} 项）`
    : `\n✓ 全部通过：自有音频优先 / 缺失自动回退 / 无异常 JS 报错` +
        `（已忽略 ${jsErrors.length} 条预期内媒体报错）`,
);
await browser.close();
process.exit(fails.length ? 1 : 0);
