/**
 * 跨语言哈希一致性守护：Python 生成端 与 TS 播放端 必须算出同一个文件名。
 *
 * 为什么需要它：客户端是**自己算地址**的（`apps/client/utils/pronunciationAudio.ts`），
 * 生成端在 Python（`scripts/tts/generate-audio.py`）。两边算法一旦漂移，症状是
 * **全库回退到有道 → 用户又听不到声**，且不会有任何报错 —— 极难排查。
 *
 * 做法：直接拿生成端写出的 `var/audio/manifest.json`（key = Python 算的哈希）当真值，
 * 用 JS 重算每一条并对撞，同时确认对应 mp3 文件真的存在。
 *
 * 用法: node scripts/tts/tests/hash-parity.mjs
 * 退出码 0 = 一致（或缺 manifest 跳过）；1 = 不一致。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const AUDIO_DIR = join(REPO, "var/audio");
const MANIFEST = join(AUDIO_DIR, "manifest.json");

/** 与 apps/client/utils/pronunciationAudio.ts 的 fnv1a64 保持同一算法。 */
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

// 先自证算法没走样：FNV-1a 64 官方标准向量
const VECTORS = [
  ["", "cbf29ce484222325"],
  ["a", "af63dc4c8601ec8c"],
  ["foobar", "85944171f73967e8"],
];
for (const [text, expected] of VECTORS) {
  const got = fnv1a64(text);
  if (got !== expected) {
    console.error(
      `✗ 本脚本的 fnv1a64 自身不对: ${JSON.stringify(text)} → ${got}（应 ${expected}）`,
    );
    process.exit(1);
  }
}
console.log(`✓ 标准向量通过（${VECTORS.length} 条）`);

if (!existsSync(MANIFEST)) {
  console.log(`⚠ 未找到 ${MANIFEST} —— 尚未生成音频，跳过跨语言对拍（CI 属正常情况）`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf-8"));
const files = new Set(readdirSync(AUDIO_DIR).filter((f) => f.endsWith(".mp3")));
const entries = Object.entries(manifest);
console.log(`对拍 ${entries.length} 条（目录内 mp3 ${files.size} 个）`);

const hashMismatch = [];
const fileMissing = [];
for (const [hash, text] of entries) {
  const mine = fnv1a64(text);
  if (mine !== hash) hashMismatch.push({ text, python: hash, js: mine });
  if (!files.has(`${hash}.mp3`)) fileMissing.push({ text, hash });
}

const orphan = [...files].filter((f) => !manifest[f.replace(/\.mp3$/, "")]);

let ok = true;
if (hashMismatch.length) {
  ok = false;
  console.error(`\n✗ 哈希不一致 ${hashMismatch.length} 条 —— 播放端会算错地址，全部回退到有道：`);
  for (const m of hashMismatch.slice(5)) {
    console.error(`   ${JSON.stringify(m.text)}: python=${m.python} js=${m.js}`);
  }
} else {
  console.log("✓ 全部哈希一致（播放端算出的地址能对上生成的文件）");
}

if (fileMissing.length) {
  ok = false;
  console.error(`\n✗ manifest 里有记录但文件不存在 ${fileMissing.length} 条（上传时会漏掉）:`);
  for (const m of fileMissing.slice(5))
    console.error(`   ${m.hash}.mp3 ← ${JSON.stringify(m.text)}`);
} else {
  console.log("✓ manifest 每条记录都有对应 mp3");
}

if (orphan.length) {
  console.log(`⚠ 有 ${orphan.length} 个 mp3 不在 manifest 里（可能是旧语速版本残留，占体积）`);
  for (const o of orphan.slice(5)) console.log(`   ${o}`);
} else {
  console.log("✓ 目录内没有游离文件");
}

process.exit(ok ? 0 : 1);
