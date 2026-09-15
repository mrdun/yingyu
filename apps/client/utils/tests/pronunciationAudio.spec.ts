import { describe, expect, it, vi } from "vitest";

import {
  buildPronunciationCandidates,
  fnv1a64,
  resetAudioBaseCacheForTest,
  selfAudioUrl,
  setPronunciationSource,
  speakWithBrowser,
} from "../pronunciationAudio";

/**
 * 发音音频寻址与回退的行为测试。
 *
 * 为什么必须测行为而不是读源码文本：这一层的作用是「某句没有自有音频时不要静默无声」，
 * 而那件事只有在**运行期**（error 事件推进候选链）才看得出来。
 */

const YUDAO = "https://dict.youdao.com/dictvoice?type=2&audio=I%20like%20the%20food";

/** 最小可用的 <audio> 替身：只实现被测代码实际用到的接口。 */
function fakeAudio() {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    src: "",
    paused: true,
    load: vi.fn(),
    play: vi.fn(() => ({ catch: () => {} })),
    addEventListener: vi.fn((type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    }),
    removeEventListener: vi.fn((type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    }),
    /** 模拟浏览器加载失败（自有音频缺失 / 有道 500）。 */
    fireError() {
      [...(listeners.error ?? [])].forEach((f) => f());
    },
    errorListenerCount() {
      return (listeners.error ?? []).length;
    },
  } as unknown as HTMLAudioElement & {
    fireError: () => void;
    errorListenerCount: () => number;
  };
}

describe("fnv1a64（必须与生成端 Python 一致）", () => {
  // 前三个是 FNV-1a 64 位的**官方标准向量**：对上就说明算法没走样
  it.each([
    ["", "cbf29ce484222325"],
    ["a", "af63dc4c8601ec8c"],
    ["foobar", "85944171f73967e8"],
  ])("标准向量 %j → %s", (text, expected) => {
    expect(fnv1a64(text)).toBe(expected);
  });

  it("真实课程句子的哈希固定（改算法会让全库音频全部对不上）", () => {
    expect(fnv1a64("I like the food")).toBe("5927fe7541e21760");
    expect(fnv1a64("don't like")).toBe("1253a76752af6d04");
    expect(fnv1a64("English-speaking environment")).toBe("3fe85f682e610c05");
    expect(fnv1a64("I need to know if I am important")).toBe("4cdc4079f56b72d8");
  });

  it("非 ASCII 走 UTF-8 字节（与 Python 的 encode('utf-8') 一致）", () => {
    expect(fnv1a64("英语")).toBe("7a9d86db461fbb19");
  });

  it("输出恒为 16 位小写十六进制", () => {
    for (const s of ["x", "I", "the food now", "a".repeat(500)]) {
      expect(fnv1a64(s)).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});

describe("候选地址的优先级", () => {
  it("配了基址 → 自有音频排第一，有道排第二", () => {
    const list = buildPronunciationCandidates("I like the food", YUDAO, "https://cdn.example/a");
    expect(list).toHaveLength(2);
    expect(list[0]).toBe("https://cdn.example/a/5927fe7541e21760.mp3");
    expect(list[1]).toBe(YUDAO);
  });

  it("基址结尾多余斜杠会被规整（否则会拼出 //xxx.mp3）", () => {
    expect(selfAudioUrl("I like the food", "https://cdn.example/a/")).toBe(
      "https://cdn.example/a/5927fe7541e21760.mp3",
    );
  });

  it("没配基址 → 只剩有道（等价于改动前的行为，不会更糟）", () => {
    expect(buildPronunciationCandidates("I like the food", YUDAO, "")).toEqual([YUDAO]);
  });

  it("句子为空 → 不产生自有音频候选", () => {
    expect(selfAudioUrl(undefined, "https://cdn.example/a")).toBeNull();
    expect(buildPronunciationCandidates(undefined, YUDAO, "https://cdn.example/a")).toEqual([
      YUDAO,
    ]);
  });
});

describe("setPronunciationSource 的回退链", () => {
  it("先用自有音频", () => {
    const audio = fakeAudio();
    const used = setPronunciationSource(audio, "I like the food", YUDAO, {
      audioBase: "https://cdn.example/a",
    });
    expect(used).toBe("https://cdn.example/a/5927fe7541e21760.mp3");
    expect(audio.src).toBe(used);
    expect(audio.load).toHaveBeenCalled();
  });

  it("自有音频失败 → 自动回退到有道（这是本轮修复的核心）", () => {
    const audio = fakeAudio();
    setPronunciationSource(audio, "I like the food", YUDAO, { audioBase: "https://cdn.example/a" });
    audio.fireError();
    expect(audio.src).toBe(YUDAO);
    expect(audio.load).toHaveBeenCalledTimes(2);
  });

  it("两级都失败 → 用浏览器朗读兜底（只在本来就在播的时候）", () => {
    const audio = fakeAudio();
    (audio as { paused: boolean }).paused = false; // 模拟用户点了播放
    const speak = vi.fn();
    setPronunciationSource(audio, "I like the food", YUDAO, {
      audioBase: "https://cdn.example/a",
      onSpeakFallback: speak,
    });
    audio.fireError(); // → 有道
    audio.fireError(); // → 浏览器朗读
    expect(speak).toHaveBeenCalledWith("I like the food");
  });

  it("预加载失败时**不得**突然出声（paused 状态不触发朗读）", () => {
    const audio = fakeAudio();
    (audio as { paused: boolean }).paused = true;
    const speak = vi.fn();
    setPronunciationSource(audio, "I like the food", YUDAO, {
      audioBase: "https://cdn.example/a",
      onSpeakFallback: speak,
    });
    audio.fireError();
    audio.fireError();
    expect(speak).not.toHaveBeenCalled();
  });

  it("反复设置源不会累积 error 监听（否则回退链会重复推进、跳过候选）", () => {
    const audio = fakeAudio();
    for (let i = 0; i < 5; i += 1) {
      setPronunciationSource(audio, `sentence ${i}`, YUDAO, { audioBase: "https://cdn.example/a" });
    }
    expect(audio.errorListenerCount()).toBe(1);
  });

  it("全部候选失败后，再失败不会抛异常", () => {
    const audio = fakeAudio();
    setPronunciationSource(audio, "x", YUDAO, { audioBase: "https://cdn.example/a" });
    audio.fireError();
    audio.fireError();
    expect(() => audio.fireError()).not.toThrow();
  });
});

describe("speakWithBrowser", () => {
  it("没有 speechSynthesis 时返回 false（不抛错）", () => {
    const original = (globalThis as { speechSynthesis?: unknown }).speechSynthesis;
    // @ts-expect-error 测试里故意抹掉
    delete (globalThis as { speechSynthesis?: unknown }).speechSynthesis;
    expect(speakWithBrowser("hi")).toBe(false);
    if (original) (globalThis as { speechSynthesis?: unknown }).speechSynthesis = original;
  });
});

describe("基址缓存", () => {
  it("resetAudioBaseCacheForTest 后可重新读取配置", () => {
    resetAudioBaseCacheForTest();
    expect(() => resetAudioBaseCacheForTest()).not.toThrow();
  });
});
