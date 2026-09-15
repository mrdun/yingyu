/**
 * 发音音频寻址与回退。
 *
 * 背景（为什么需要这一层）
 * ----------------------
 * 原来的发音直接取有道「词典发音」接口：`dict.youdao.com/dictvoice?audio=<原文>`。
 * 该接口只返回**词典里已收录词条**的读音，长句/连词/连字符词大量读不出（实测全库
 * 仅 36% 可用，且失败时是 HTTP 500 + 浏览器 ERR_BLOCKED_BY_ORB，**页面静默无声**）。
 *
 * 现在课程音频由我们自己的 TTS（Kokoro）离线生成，作为静态文件托管。
 *
 * 三级回退（缺一不可，否则又会出现「没声音」）
 * -------------------------------------------
 *   1. 自己的音频文件（按句子文本哈希寻址）
 *   2. 有道词典发音（历史行为，兜住任何尚未生成的句子）
 *   3. 浏览器内置朗读（最后兜底，零依赖，代价是音色随设备而异）
 *
 * 为什么用 FNV-1a 64 位哈希做文件名
 * --------------------------------
 * - 客户端要**自己算出地址**，不能依赖后端多返回一个字段（那要改 schema 与 DTO）；
 * - 生成端（Python）与播放端（TS）必须算出**完全一致**的结果，所以两端各实现一份，
 *   并用 `scripts/tts/tests/hash-parity.mjs` 做跨语言一致性守护；
 * - 之所以不用 SHA-256：`crypto.subtle` 是**异步**的，而现有播放链路是同步取 URL。
 *   选同步、无依赖的 FNV-1a 更省事（4753 条句子在 64 位空间下冲突概率约 1e-12，
 *   且生成端会显式检查真实数据里的冲突并报错）。
 */
import { useRuntimeConfig } from "#app";

/** FNV-1a 64 位：对 UTF-8 字节运算，输出 16 位小写十六进制。必须与 Python 端一致。 */
export function fnv1a64(text: string): string {
  const OFFSET = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = OFFSET;
  const bytes = new TextEncoder().encode(text);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** 记录每个 <audio> 元素当前的错误处理函数，避免重复绑定导致回退链重复推进。 */
const errorHandlers = new WeakMap<HTMLAudioElement, () => void>();

/** 读取音频基址（构建期注入的 runtimeConfig.public.audioBase）。 */
let cachedAudioBase: string | null = null;
export function getAudioBase(): string {
  if (cachedAudioBase !== null) return cachedAudioBase;
  try {
    // 动态取，避免在模块加载期就依赖 Nuxt 上下文（本文件可能被模块级调用）
    const config = useRuntimeConfig();
    cachedAudioBase = (config?.public?.audioBase as string | undefined) ?? "";
  } catch {
    cachedAudioBase = "";
  }
  return cachedAudioBase;
}

/** 测试用：重置缓存的基址。 */
export function resetAudioBaseCacheForTest(): void {
  cachedAudioBase = null;
}

/**
 * 拼出「自己托管的音频」地址；未配置基址或没有句子文本时返回 null（表示不可用）。
 */
export function selfAudioUrl(english: string | undefined, audioBase?: string): string | null {
  const base = (audioBase ?? getAudioBase()).replace(/\/+$/, "");
  if (!base || !english) return null;
  return `${base}/${fnv1a64(english)}.mp3`;
}

/**
 * 生成该句子的候选地址列表（按优先级）。至少会返回一个候选（除非 english 为空）。
 */
export function buildPronunciationCandidates(
  english: string | undefined,
  legacyUrl: string | undefined,
  audioBase?: string,
): string[] {
  const list: string[] = [];
  const self = selfAudioUrl(english, audioBase);
  if (self) list.push(self);
  if (legacyUrl) list.push(legacyUrl);
  return list;
}

/**
 * 给 <audio> 设置发音源，失败时自动按候选列表回退；全部失败且当时正在播放则用浏览器朗读。
 *
 * @param audio   目标 audio 元素
 * @param english 句子原文（用于算哈希、以及最后的浏览器朗读）
 * @param legacyUrl 有道地址（回退第二级）
 * @param options.audioBase 覆盖音频基址（测试用）
 * @returns 实际使用的首个候选地址（无候选时返回 null）
 */
export function setPronunciationSource(
  audio: HTMLAudioElement,
  english: string | undefined,
  legacyUrl: string | undefined,
  options: { audioBase?: string; onSpeakFallback?: (text: string) => void } = {},
): string | null {
  const candidates = buildPronunciationCandidates(english, legacyUrl, options.audioBase);
  if (!candidates.length) return null;

  const previous = errorHandlers.get(audio);
  if (previous) audio.removeEventListener("error", previous);

  let index = 0;
  const onError = () => {
    index += 1;
    if (index < candidates.length) {
      audio.src = candidates[index];
      audio.load();
      // 回退到下一级后，如果当时正在播放就继续播（否则用户要再点一次）
      if (!audio.paused) void audio.play()?.catch(() => {});
      return;
    }
    audio.removeEventListener("error", onError);
    errorHandlers.delete(audio);
    // 三级兜底：浏览器朗读。只在「本来就在播」时触发，预加载失败不该突然出声。
    if (english && !audio.paused) {
      if (options.onSpeakFallback) {
        options.onSpeakFallback(english);
      } else {
        speakWithBrowser(english);
      }
    }
  };

  audio.addEventListener("error", onError);
  errorHandlers.set(audio, onError);
  audio.src = candidates[0];
  audio.load();
  return candidates[0];
}

/** 浏览器内置朗读（最后兜底，零依赖）。 */
export function speakWithBrowser(text: string): boolean {
  try {
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") return false;
    synth.cancel();
    synth.speak(new SpeechSynthesisUtterance(text));
    return true;
  } catch {
    return false;
  }
}
