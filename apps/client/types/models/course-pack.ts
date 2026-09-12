import type { Course } from "./course";

export type CoursePackAccessLevel = "free" | "membership";

export type CoursePacksItem = {
  id: string;
  title: string;
  isFree: boolean;
  description: string;
  cover: string;
  accessLevel?: CoursePackAccessLevel;
  accessible?: boolean;
};

export type CoursePack = {
  id: string;
  title: string;
  description: string;
  isFree: boolean;
  cover: string;
  courses: Course[];
  accessLevel?: CoursePackAccessLevel;
  accessible?: boolean;
  requiresMembership?: boolean;
};

export type CoursePackProgress = {
  totalCourses: number;
  completedCourses: number;
  progress: number;
  lastCourseId: string | null;
  lastStatementIndex: number;
};
