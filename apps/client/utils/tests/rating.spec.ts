import { describe, expect, it } from "vitest";

import { calcGrade, calcScoreRate, gradeColorClass } from "../rating";

describe("rating utils", () => {
  it("calcScoreRate = firstTryCorrect / total * 100", () => {
    expect(calcScoreRate(10, 10)).toBe(100);
    expect(calcScoreRate(9, 10)).toBe(90);
    expect(calcScoreRate(2, 3)).toBe(66.67);
  });

  describe("calcGrade - six grade boundaries", () => {
    it("95 -> SSS", () => expect(calcGrade(95)).toBe("SSS"));
    it("94.99 -> SS, 90 -> SS", () => {
      expect(calcGrade(94.99)).toBe("SS");
      expect(calcGrade(90)).toBe("SS");
    });
    it("89.99 -> S, 80 -> S", () => {
      expect(calcGrade(89.99)).toBe("S");
      expect(calcGrade(80)).toBe("S");
    });
    it("79.99 -> A, 70 -> A", () => {
      expect(calcGrade(79.99)).toBe("A");
      expect(calcGrade(70)).toBe("A");
    });
    it("69.99 -> B, 60 -> B", () => {
      expect(calcGrade(69.99)).toBe("B");
      expect(calcGrade(60)).toBe("B");
    });
    it("59.99 -> C", () => expect(calcGrade(59.99)).toBe("C"));
  });

  it("gradeColorClass maps each grade", () => {
    expect(gradeColorClass("SSS")).toContain("from-yellow");
    expect(gradeColorClass("SS")).toBe("text-purple-500");
    expect(gradeColorClass("S")).toBe("text-blue-500");
    expect(gradeColorClass("A")).toBe("text-green-500");
    expect(gradeColorClass("B")).toBe("text-yellow-500");
    expect(gradeColorClass("C")).toBe("text-gray-500");
  });
});
