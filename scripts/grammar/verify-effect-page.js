/**
 * 效果页验收 —— 真实浏览器逐句断言，不看截图。退出码 0 = 全过。
 *
 * 断言:
 *  1. **逐句一致性**: 渲染出的词序列 == 源数据词序列（218/218）。钉住「短语排序错误
 *     导致重复输出词」那类缺陷 —— 页面看着是好的，只有数一遍才发现。
 *  2. **胶囊里装的是该成分的词**: 每个成分组的词 == 对应短语的词；
 *     有成分的组数 == 可匹配到的短语数；碎片必须 0 个有成分的组。
 *  3. **成分名在胶囊上方且同色**: `.name` 文本 == 成分名，且其计算颜色 == 胶囊底色。
 *  4. **单词 / 下划线 / 词性文字同一条中心线**: 三者中心 x 坐标差 <= 1px；
 *     且下划线颜色 == 词性文字颜色（用户明确要求「颜色一致」）。
 *  5. **A/B 两套配色真的不同**: 找一个「多词且词性各不相同」的成分 ——
 *     A 方案该组内下划线出现 >=2 种颜色；B 方案该组内下划线只有 1 种且 == 胶囊色。
 *  6. **从句断行开关生效**；四个卡片都在。
 *  7. 无横向溢出（680 / 960 / 1280px），无 JS 报错。
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
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(e.message));

  await page.goto("file:///" + path.resolve(file).replace(/\\/g, "/"), {
    waitUntil: "load",
    timeout: 120000,
  });
  await page.waitForTimeout(400);

  const fails = [];
  const ok = (cond, msg) => {
    if (!cond) fails.push(msg);
  };
  const n = await page.evaluate(() => window.__grammarPage.count());
  console.log(`共 ${n} 句，逐句核对…`);

  // ── 1 & 2 & 3 & 4 ──────────────────────────────
  let checked = 0,
    groupsWithComp = 0,
    centerBad = 0,
    colorBad = 0;
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate((idx) => {
      window.__grammarPage.goto(idx);
      const t = window.__grammarPage.text();
      // 中心线检查: 词 / 下划线 / 词性文字 的 x 中心
      const centers = Array.from(document.querySelectorAll("#rows .grp")).map((g) => {
        const mid = (el) => {
          const b = el.getBoundingClientRect();
          return b.left + b.width / 2;
        };
        return Array.from(g.querySelectorAll(".w")).map((w, k) => ({
          w: mid(w),
          ul: mid(g.querySelectorAll(".ul")[k]),
          pp: mid(g.querySelectorAll(".pp")[k]),
        }));
      });
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return { t, centers, raw: window.__grammarPage.raw(idx) };
    }, i);
    checked++;
    const it = r.raw,
      t = r.t;

    // 1. 词序列一致
    const expWords = it.w.map((x) => x.t);
    if (JSON.stringify(t.words) !== JSON.stringify(expWords)) {
      if (fails.length < 5)
        fails.push(
          `[${it.o}] 词序列不一致\n     源=${JSON.stringify(expWords)}\n     页=${JSON.stringify(t.words)}`,
        );
      continue;
    }
    // 2. 成分组的词 == 短语的词
    const withComp = t.groups.filter((g) => g.comp);
    const expPh = it.s ? it.ph.length : 0;
    if (withComp.length !== expPh) {
      if (fails.length < 5)
        fails.push(`[${it.o}] 有成分的胶囊组数 ${withComp.length} != 短语数 ${expPh}`);
    } else {
      for (const g of withComp) {
        if (!it.ph.some((p) => p.t === g.words.join(" "))) {
          if (fails.length < 5)
            fails.push(`[${it.o}] 胶囊里的词「${g.words.join(" ")}」不在源短语里`);
        }
      }
    }
    groupsWithComp += withComp.length;
    // 3. 成分名 == 成分, 且颜色 == 胶囊色
    for (const g of withComp) {
      if (g.name !== g.comp) {
        if (fails.length < 5) fails.push(`[${it.o}] 成分名「${g.name}」!= 成分「${g.comp}」`);
      }
      if (g.nameColor !== g.pill) colorBad++;
    }
    // 4. 中心线 + 下划线色 == 词性文字色
    for (const grp of r.centers) {
      for (const c of grp) {
        if (Math.abs(c.w - c.ul) > 1 || Math.abs(c.w - c.pp) > 1) centerBad++;
      }
    }
    for (const g of t.groups) {
      for (let k = 0; k < g.uls.length; k++) if (g.uls[k] !== g.ppColors[k]) colorBad++;
    }
  }
  console.log(`  已核对 ${checked}/${n} 句；成分胶囊共 ${groupsWithComp} 个`);
  ok(checked === n, `只核对到 ${checked}/${n} 句`);
  ok(centerBad === 0, `单词/下划线/词性 中心线不齐 ${centerBad} 处`);
  ok(colorBad === 0, `「成分名与胶囊同色」「下划线与词性文字同色」违反 ${colorBad} 处`);

  // ── 5. A/B 两套配色确实不同 ─────────────────────
  const probe = await page.evaluate(() => {
    for (let i = 0; i < window.__grammarPage.count(); i++) {
      const it = window.__grammarPage.raw(i);
      if (!it.s) continue;
      const ws = it.w.map((x) => x.t);
      for (const p of it.ph) {
        const pt = p.t.split(" ");
        if (pt.length < 2) continue;
        for (let s = 0; s + pt.length <= ws.length; s++) {
          if (ws.slice(s, s + pt.length).join(" ") === p.t) {
            const posSet = new Set(it.w.slice(s, s + pt.length).map((x) => x.p));
            if (posSet.size >= 2) return { idx: i, phrase: p.t, pos: [...posSet], role: p.r };
          }
        }
      }
    }
    return null;
  });
  if (!probe) {
    fails.push("找不到「多词且词性不同」的成分，无法验证 A/B 差异");
  } else {
    const read = async (scheme) =>
      page.evaluate(
        ({ i, ph, sch }) => {
          window.__grammarPage.setScheme(sch);
          window.__grammarPage.goto(i);
          const g = window.__grammarPage.text().groups.find((x) => x.words.join(" ") === ph);
          return g
            ? { uls: [...new Set(g.uls)], pp: [...new Set(g.ppColors)], pill: g.pill }
            : null;
        },
        { i: probe.idx, ph: probe.phrase, sch: scheme },
      );
    const A = await read("A"),
      B = await read("B");
    console.log(`  探针成分「${probe.phrase}」词性 ${JSON.stringify(probe.pos)}`);
    console.log(`    A 按词性 : 下划线色 ${JSON.stringify(A.uls)}`);
    console.log(`    B 随成分 : 下划线色 ${JSON.stringify(B.uls)}  (胶囊 ${B.pill})`);
    ok(A.uls.length >= 2, `A 方案下划线应出现 >=2 种颜色（词性不同），实得 ${A.uls.length}`);
    ok(B.uls.length === 1, `B 方案下划线应为 1 种颜色，实得 ${B.uls.length}`);
    ok(B.uls[0] === B.pill, `B 方案下划线色应等于胶囊色（${B.pill}），实得 ${B.uls[0]}`);
    await page.evaluate(() => window.__grammarPage.setScheme("A"));
  }

  // ── 6. 从句断行 + 四个卡片 ──────────────────────
  const longest = await page.evaluate(() => {
    let b = 0;
    for (let i = 0; i < window.__grammarPage.count(); i++)
      if (window.__grammarPage.raw(i).w.length > window.__grammarPage.raw(b).w.length) b = i;
    return b;
  });
  const onRows = await page.evaluate((i) => {
    window.__grammarPage.goto(i);
    return window.__grammarPage.text().rows;
  }, longest);
  const offRows = await page.evaluate((i) => {
    document.getElementById("clause").click();
    window.__grammarPage.goto(i);
    return window.__grammarPage.text().rows;
  }, longest);
  await page.evaluate(() => document.getElementById("clause").click());
  console.log(`  最长句: 从句断行 开=${onRows} 段 / 关=${offRows} 段`);
  ok(onRows > offRows, `从句断行开关无效（开 ${onRows} / 关 ${offRows}）`);

  const cards = await page.evaluate(
    (i) => {
      window.__grammarPage.goto(i);
      return window.__grammarPage.text().cards;
    },
    probe ? probe.idx : 0,
  );
  console.log(`  四个卡片: ${JSON.stringify(cards)}`);
  ok(cards.length === 4, `结构化卡片应为 4 个，实得 ${cards.length}`);

  // ── 7. 无横向溢出 + 自报行数属实 ─────────────────
  for (const w of [680, 960, 1280]) {
    await page.setViewportSize({ width: w, height: 1000 });
    await page.waitForTimeout(250);
    let over = 0,
      mismatch = 0;
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
        const claimed = Number(
          (document.getElementById("measure").textContent.match(/实际\s*(\d+)\s*行/) || [])[1],
        );
        return {
          real: sentRows.length + wrap,
          claimed,
          over: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        };
      }, i);
      if (r.claimed !== r.real) mismatch++;
      if (r.over) over++;
    }
    console.log(`  ${w}px: 自报行数不符 ${mismatch} 句；横向溢出 ${over} 句`);
    ok(mismatch === 0, `${w}px 下 ${mismatch} 句自报行数与 DOM 不符`);
    ok(over === 0, `${w}px 下 ${over} 句横向溢出`);
  }

  await browser.close();
  ok(jsErrors.length === 0, "页面 JS 报错: " + jsErrors.slice(0, 3).join(" | "));

  if (fails.length) {
    console.log(`\n✗ 失败 ${fails.length} 项:`);
    fails.forEach((f) => console.log("   ✗ " + f));
    process.exit(1);
  }
  console.log(
    "\n✓ 全部通过: 词序一致 / 胶囊装词正确 / 成分名同色 / 三者中心对齐 / 下划线色==词性色 / " +
      "A·B 配色有差异 / 断行开关生效 / 四卡片齐全 / 自报行数属实 / 无横向溢出 / 无 JS 报错",
  );
  process.exit(0);
})();
