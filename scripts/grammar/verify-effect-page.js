/**
 * 效果页的正确性验收 —— 在真实浏览器里逐句断言，不是看截图。
 *
 * 用法: node verify-effect-page.js <effect-page.html>
 * 退出码 0 = 全部通过；1 = 有失败项。
 *
 * 断言内容:
 *  1. **逐句渲染一致性**: 渲染出的每个词 == 源数据的词（顺序与个数都要对）。
 *     这是钉住「短语排序错误导致重复输出词」那类缺陷的唯一手段 ——
 *     页面看着是好的，只有数一遍才发现。
 *  2. 胶囊数 == 能匹配到的成分短语数；碎片必须 0 个胶囊。
 *  3. 「从句断行」关闭/打开：长并列句的行数应 减少（证明开关真的生效）。
 *  4. 测量值不说谎: 页面自报的「实际 N 行」必须等于 DOM 里真实的分行数。
 *  5. 无横向溢出（680 / 960 / 1280px 三档）。
 */
const path = require("path");
const PW = "C:/Users/mrdun/AppData/Local/hermes/node/node_modules/playwright";

(async () => {
  const file = process.argv[2];
  if (!file) {
    console.error("用法: node verify-effect-page.js <html>");
    process.exit(2);
  }
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(120000);
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), {
    waitUntil: "load",
    timeout: 120000,
  });
  await page.waitForTimeout(400);

  const fails = [];
  const n = await page.evaluate(() => window.__grammarPage.count());
  console.log(`效果页共 ${n} 句，逐句核对…`);

  // 源数据（从页面里取，保证与页面用的是同一份）
  const src = await page.evaluate(() => window.__DATA_FOR_TEST || null);

  // ── 断言 1 & 2: 逐句渲染一致性 ─────────────────────
  let checked = 0,
    capsuleTotal = 0;
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate((idx) => {
      window.__grammarPage.goto(idx);
      return window.__grammarPage.text();
    }, i);
    // 源数据由页面暴露的 DATA 计算
    const expect = await page.evaluate((idx) => {
      const it = window.__grammarPage.raw ? window.__grammarPage.raw(idx) : null;
      return it;
    }, i);
    if (!expect) break;
    checked++;
    const expWords = expect.w.map((x) => x.t);
    if (JSON.stringify(r.words) !== JSON.stringify(expWords)) {
      if (fails.length < 6) {
        fails.push(
          `[${expect.o}] 词不一致\n     源=${JSON.stringify(expWords)}\n     页=${JSON.stringify(r.words)}`,
        );
      }
      continue;
    }
    const expCaps = expect.s ? expect.ph.length : 0;
    if (r.caps.length !== expCaps) {
      if (fails.length < 6)
        fails.push(`[${expect.o}] 胶囊数不符: 期望 ${expCaps} 实得 ${r.caps.length}`);
      continue;
    }
    capsuleTotal += r.caps.length;
  }
  console.log(`  已核对 ${checked}/${n} 句；累计胶囊 ${capsuleTotal} 个`);
  if (checked !== n) fails.push(`只核对到 ${checked}/${n} 句（页面 api 需暴露 raw()）`);

  // ── 断言 3: 从句断行开关真的生效 ────────────────────
  const longIdx = await page.evaluate(() => {
    let best = 0;
    for (let i = 0; i < window.__grammarPage.count(); i++) {
      const it = window.__grammarPage.raw(i);
      if (it.w.length > window.__grammarPage.raw(best).w.length) best = i;
    }
    return best;
  });
  const withBreak = await page.evaluate((i) => {
    window.__grammarPage.goto(i);
    return window.__grammarPage.text().rows;
  }, longIdx);
  const noBreak = await page.evaluate((i) => {
    document.querySelector('#toggles button[data-t="clause"]').click();
    window.__grammarPage.goto(i);
    return window.__grammarPage.text().rows;
  }, longIdx);
  const longEn = await page.evaluate((i) => window.__grammarPage.raw(i).en, longIdx);
  console.log(`  最长句「${longEn}」: 从句断行开=${withBreak} 段 / 关=${noBreak} 段`);
  if (!(withBreak > noBreak))
    fails.push(`从句断行开关无效（开 ${withBreak} 段 / 关 ${noBreak} 段）`);
  await page.evaluate(() => document.querySelector('#toggles button[data-t="clause"]').click()); // 还原

  // ── 断言 4: 自报行数 == DOM 真实行数; 断言 5: 无横向溢出 ──
  for (const w of [680, 960, 1280]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(250);
    let bad = 0,
      overflow = 0;
    for (let i = 0; i < n; i++) {
      const r = await page.evaluate((idx) => {
        window.__grammarPage.goto(idx);
        const rowsEl = document.getElementById("rows");
        const sentRows = Array.from(rowsEl.querySelectorAll(":scope > .sent"));
        let wrap = 0;
        for (const sr of sentRows) {
          const tops = new Set(
            Array.from(sr.querySelectorAll(":scope > .grp")).map((g) =>
              Math.round(g.getBoundingClientRect().top),
            ),
          );
          wrap += Math.max(0, tops.size - 1);
        }
        const real = sentRows.length + wrap;
        const claimed = Number(
          (document.getElementById("measure").textContent.match(/实际\s*(\d+)\s*行/) || [])[1],
        );
        return {
          real,
          claimed,
          over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      }, i);
      if (r.claimed !== r.real) bad++;
      if (r.over) overflow++;
    }
    console.log(`  ${w}px: 自报行数与真实不符 ${bad} 句；横向溢出 ${overflow} 句`);
    if (bad) fails.push(`${w}px 下 ${bad} 句的自报行数与 DOM 真实行数不符`);
    if (overflow) fails.push(`${w}px 下 ${overflow} 句横向溢出`);
  }

  await browser.close();
  if (errors.length) fails.push("页面 JS 报错: " + errors.slice(0, 3).join(" | "));
  if (fails.length) {
    console.log(`\n✗ 失败 ${fails.length} 项:`);
    fails.forEach((f) => console.log("   ✗ " + f));
    process.exit(1);
  }
  console.log(
    "\n✓ 全部通过: 渲染逐句一致 / 胶囊数正确 / 开关生效 / 自报行数属实 / 无横向溢出 / 无 JS 报错",
  );
  process.exit(0);
})();
