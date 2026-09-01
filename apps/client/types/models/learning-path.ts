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
  };
};

export type LearningPathDetail = {
  id: string;
  title: string;
  description: string;
  cover?: string | null;
  items: LearningPathDetailItem[];
};
