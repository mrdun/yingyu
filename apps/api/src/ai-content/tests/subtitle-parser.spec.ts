import { parseSrt, parseSubtitle, parseVtt, subtitleToText } from "../subtitle-parser";

describe("subtitle-parser", () => {
  describe("parseSrt", () => {
    it("解析标准 SRT 片段", () => {
      const srt = [
        "1",
        "00:00:01,000 --> 00:00:04,000",
        "Hello, how are you?",
        "",
        "2",
        "00:00:04,500 --> 00:00:08,000",
        "I'm doing well, thank you.",
        "",
      ].join("\n");

      const segments = parseSrt(srt);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual({
        start: 1000,
        end: 4000,
        text: "Hello, how are you?",
      });
      expect(segments[1].start).toBe(4500);
      expect(segments[1].text).toBe("I'm doing well, thank you.");
    });

    it("忽略无时间戳的块与内联标签", () => {
      const srt = [
        "1",
        "00:00:01,000 --> 00:00:04,000",
        "Hello <i>world</i>",
        "",
        "garbage block without timestamp",
        "",
      ].join("\n");

      const segments = parseSrt(srt);

      expect(segments).toHaveLength(1);
      expect(segments[0].text).toBe("Hello world");
    });
  });

  describe("parseVtt", () => {
    it("解析 WEBVTT（含头部与 NOTE）", () => {
      const vtt = [
        "WEBVTT",
        "",
        "NOTE this is a comment",
        "",
        "00:00:01.000 --> 00:00:04.000 align:start position:0%",
        "Hello there",
        "",
        "00:00:04.500 --> 00:00:08.000",
        "General Kenobi",
        "",
      ].join("\n");

      const segments = parseVtt(vtt);

      expect(segments).toHaveLength(2);
      expect(segments[0].start).toBe(1000);
      expect(segments[0].end).toBe(4000);
      expect(segments[0].text).toBe("Hello there");
      expect(segments[1].text).toBe("General Kenobi");
    });
  });

  describe("parseSubtitle (自动识别)", () => {
    it("SRT 无 WEBVTT 头时走 SRT 分支", () => {
      const srt = "1\n00:00:00,000 --> 00:00:01,000\nHi\n";
      expect(parseSubtitle(srt)).toHaveLength(1);
    });

    it("VTT 带 WEBVTT 头时走 VTT 分支", () => {
      const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n";
      expect(parseSubtitle(vtt)).toHaveLength(1);
    });

    it("空内容返回空数组", () => {
      expect(parseSubtitle("")).toEqual([]);
    });
  });

  describe("subtitleToText", () => {
    it("把片段文本用空格合并", () => {
      const text = subtitleToText([
        { start: 0, end: 1000, text: "Hello" },
        { start: 1000, end: 2000, text: "world" },
      ]);
      expect(text).toBe("Hello world");
    });
  });
});
