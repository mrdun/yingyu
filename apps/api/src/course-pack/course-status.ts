/**
 * 课程状态机 (唯一来源)。
 * 允许的状态转换:
 *   draft -> review
 *   review -> draft
 *   review -> published
 *   published -> archived
 *   archived -> draft
 */
export const COURSE_STATUS = {
  DRAFT: "draft",
  REVIEW: "review",
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const;

export type CourseStatusValue = (typeof COURSE_STATUS)[keyof typeof COURSE_STATUS];

export const COURSE_STATUS_TRANSITIONS: Record<CourseStatusValue, CourseStatusValue[]> = {
  draft: [COURSE_STATUS.REVIEW],
  review: [COURSE_STATUS.DRAFT, COURSE_STATUS.PUBLISHED],
  published: [COURSE_STATUS.ARCHIVED],
  archived: [COURSE_STATUS.DRAFT],
};

export function isLegalCourseStatusTransition(from: string, to: string): boolean {
  const allowed = COURSE_STATUS_TRANSITIONS[from as CourseStatusValue] ?? [];
  return (allowed as string[]).includes(to);
}
