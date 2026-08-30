import { calcGrade, calcScoreRate, isBetterScore } from "../rating";

describe("rating rules", () => {
  describe("calcScoreRate", () => {
    it("should be correctCount / totalCount * 100", () => {
      expect(calcScoreRate(9, 10)).toBe(90);
      expect(calcScoreRate(1, 3)).toBe(33.33);
      expect(calcScoreRate(0, 10)).toBe(0);
      expect(calcScoreRate(10, 10)).toBe(100);
    });

    it("should handle edge inputs", () => {
      expect(calcScoreRate(0, 0)).toBe(0);
      expect(calcScoreRate(-1, 10)).toBe(0);
      expect(calcScoreRate(11, 10)).toBe(100);
    });
  });

  describe("calcGrade - six grade boundaries", () => {
    it(">= 95 is SSS", () => {
      expect(calcGrade(95)).toBe("SSS");
      expect(calcGrade(100)).toBe("SSS");
    });

    it(">= 90 and < 95 is SS", () => {
      expect(calcGrade(90)).toBe("SS");
      expect(calcGrade(94.99)).toBe("SS");
    });

    it(">= 80 and < 90 is S", () => {
      expect(calcGrade(80)).toBe("S");
      expect(calcGrade(89.99)).toBe("S");
    });

    it(">= 70 and < 80 is A", () => {
      expect(calcGrade(70)).toBe("A");
      expect(calcGrade(79.99)).toBe("A");
    });

    it(">= 60 and < 70 is B", () => {
      expect(calcGrade(60)).toBe("B");
      expect(calcGrade(69.99)).toBe("B");
    });

    it("< 60 is C", () => {
      expect(calcGrade(59.99)).toBe("C");
      expect(calcGrade(0)).toBe("C");
    });
  });

  describe("isBetterScore - keep the max score across replays", () => {
    it("first attempt is always best", () => {
      expect(isBetterScore(80, undefined)).toBe(true);
      expect(isBetterScore(80, null)).toBe(true);
    });

    it("higher new score refreshes the best", () => {
      expect(isBetterScore(95, 80)).toBe(true);
    });

    it("lower or equal new score does not refresh the best", () => {
      expect(isBetterScore(80, 95)).toBe(false);
      expect(isBetterScore(95, 95)).toBe(false);
    });
  });
});
