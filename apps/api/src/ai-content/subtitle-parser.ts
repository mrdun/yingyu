/**
 * SRT / VTT 字幕解析（纯函数，无外部依赖）。
 * 目标：把字幕文件文本解析成带时间戳的片段，再合并为纯文本交给 DeepSeek 拆句/翻译。
 */

export interface SubtitleSegment {
  /** 起始时间（毫秒） */
  start: number;
  /** 结束时间（毫秒） */
  end: number;
  /** 该片段的文本 */
  text: string;
}

/**
 * 自动识别 SRT / VTT 并解析为片段。
 */
export function parseSubtitle(content: string): SubtitleSegment[] {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  if (normalized.startsWith("WEBVTT")) {
    return parseVtt(normalized);
  }
  return parseSrt(normalized);
}

/**
 * 解析 SRT：块之间以空行分隔，时间戳用逗号 `00:00:01,000 --> 00:00:04,000`。
 */
export function parseSrt(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = content.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    const tsLineIndex = lines.findIndex((l) => l.includes("-->"));
    if (tsLineIndex === -1) continue;

    const { start, end } = parseTimestampLine(lines[tsLineIndex]);
    const text = lines
      .slice(tsLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "") // 去掉 <i> 等内联标签
      .trim();

    if (text) {
      segments.push({ start, end, text });
    }
  }

  return segments;
}

/**
 * 解析 VTT：头部 WEBVTT，时间戳用点 `00:00:01.000 --> 00:00:04.000`，可含 NOTE 块与 cue 设置。
 */
export function parseVtt(content: string): SubtitleSegment[] {
  const lines = content.split("\n");
  const headerIndex = lines.findIndex((l) => l.trim() === "WEBVTT");
  const body = lines.slice(headerIndex + 1).join("\n");

  const segments: SubtitleSegment[] = [];
  const blocks = body.split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines[0].startsWith("NOTE")) continue; // 跳过 NOTE 注释块

    const tsLineIndex = lines.findIndex((l) => l.includes("-->"));
    if (tsLineIndex === -1) continue;

    const { start, end } = parseTimestampLine(lines[tsLineIndex]);
    const text = lines
      .slice(tsLineIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (text) {
      segments.push({ start, end, text });
    }
  }

  return segments;
}

/**
 * 把片段合并为纯文本（用空格连接，交给 DeepSeek 做句子切分）。
 */
export function subtitleToText(segments: SubtitleSegment[]): string {
  return segments.map((s) => s.text).join(" ");
}

function parseTimestampLine(line: string): { start: number; end: number } {
  const [startStr, endRaw] = line.split("-->");
  // 取 end 时间戳（忽略 VTT 的 cue 设置如 align:start position:0%）
  const endStr = (endRaw ?? "").trim().split(/\s+/)[0];
  return {
    start: toMs(startStr.trim()),
    end: toMs(endStr ?? ""),
  };
}

function toMs(ts: string): number {
  // 兼容 HH:MM:SS,mmm / HH:MM:SS.mmm / MM:SS.mmm / SS.mmm
  const match = ts.match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
  if (!match) return 0;

  const h = match[1] ? Number(match[1]) : 0;
  const m = Number(match[2]);
  const s = Number(match[3]);
  const ms = Number((match[4] || "0").padEnd(3, "0").slice(0, 3));

  return (h * 3600 + m * 60 + s) * 1000 + ms;
}
