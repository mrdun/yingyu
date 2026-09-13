import type { CoursePackAccessLevel } from "./course-pack";

export type LearningPathSummary = {
  id: string;
  title: string;
  description: string;
  cover?: string | null;
  order: number;
  coursePackCount: number;
};

export type LearningPathDetailItem = {
  stage: string;
  order: number;
  coursePack: {
    id: string;
    title: string;
    description: string;
    isFree: boolean | null;
    cover: string | null;
    /** 后端返回的权限字段: 不裁剪, 供卡片文案 / 跳转决策使用 */
    accessLevel?: CoursePackAccessLevel | null;
    accessible?: boolean;
  };
};

export type LearningPathDetail = {
  id: string;
  title: string;
  description: string;
  cover?: string | null;
  items: LearningPathDetailItem[];
};
