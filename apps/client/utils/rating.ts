export type Grade = "C" | "B" | "A" | "S" | "SS" | "SSS";

/**
 * 一次性正确率: 首次作答即正确的题数 / 总题数 * 100 (重答/提示不计)
 */
export function calcScoreRate(correct: number, total: number): number {
  if (total <= 0) return 0;
  const c = Math.min(Math.max(correct, 0), total);
  return Math.round((c / total) * 10000) / 100;
}

/**
 * grade 映射: >=95 SSS, >=90 SS, >=80 S, >=70 A, >=60 B, <60 C
 */
export function calcGrade(scoreRate: number): Grade {
  if (scoreRate >= 95) return "SSS";
  if (scoreRate >= 90) return "SS";
  if (scoreRate >= 80) return "S";
  if (scoreRate >= 70) return "A";
  if (scoreRate >= 60) return "B";
  return "C";
}

export function gradeColorClass(grade: string): string {
  switch (grade) {
    case "SSS":
      // 金色渐变
      return "bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-600 bg-clip-text text-transparent";
    case "SS":
      return "text-purple-500";
    case "S":
      return "text-blue-500";
    case "A":
      return "text-green-500";
    case "B":
      return "text-yellow-500";
    default:
      return "text-gray-500";
  }
}
