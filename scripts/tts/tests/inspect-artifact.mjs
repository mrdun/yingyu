/**
 * 从产物里抠出「我的新代码」编译后的片段，用于判断：
 *   ① 算法常量是否真的被打进去；
 *   ② `useRuntimeConfig` 有没有被解析成 import（本仓 autoImport:false，
 *      没显式 import 的话会编译成裸标识符 → 运行期 ReferenceError）。
 *
 * 用法: node scripts/tts/tests/inspect-artifact.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PUB =
  "C:/Users/mrdun/Documents/codex/2026-08-27/qin/work/earthworm/apps/client/.output/public/_nuxt";
const NEEDLES = ["cbf29ce484222325", "speechSynthesis", "audioBase"];

let hits = 0;
for (const file of readdirSync(PUB).filter((f) => f.endsWith(".js"))) {
  const src = readFileSync(join(PUB, file), "utf-8");
  for (const needle of NEEDLES) {
    let idx = src.indexOf(needle);
    while (idx !== -1) {
      hits += 1;
      const from = Math.max(0, idx - 220);
      const to = Math.min(src.length, idx + 260);
      console.log(`\n=== ${file} · "${needle}" @${idx} ===`);
      console.log(src.slice(from, to).replace(/\n/g, " "));
      if (hits > 6) process.exit(0);
      idx = src.indexOf(needle, idx + 1);
    }
  }
}
if (!hits) console.log("产物里没找到这些标记 —— 新代码没进构建");
