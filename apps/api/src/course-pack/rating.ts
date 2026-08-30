/**
 * 评级规则(纯函数, 便于单测):
 * - scoreRate = 一次性答对题数 / 总题数 * 100 (重答/提示不计入 correct)
 * - grade 映射: >=95 SSS, >=90 SS, >=80 S, >=70 A, >=60 B, <60 C
 * - 同一课程重复刷取取最高分 (按 scoreRate max 更新)
 */

export type Grade = "C" | "B" | "A" | "S" | "SS" | "SSS";

export function calcScoreRate(correct: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  if (correct < 0) {
    correct = 0;
  }
  if (correct > total) {
    correct = total;
  }
  return Math.round((correct / total) * 10000) / 100;
}

export function calcGrade(scoreRate: number): Grade {
  if (scoreRate >= 95) return "SSS";
  if (scoreRate >= 90) return "SS";
  if (scoreRate >= 80) return "S";
  if (scoreRate >= 70) return "A";
  if (scoreRate >= 60) return "B";
  return "C";
}

/**
 * 取历史最高分: 若新分数更高则更新, 返回是否刷新个人最佳
 */
export function isBetterScore(newScore: number, oldScore: number | undefined | null): boolean {
  return oldScore == null || newScore > oldScore;
}
