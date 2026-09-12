import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Course, CoursePack } from "~/types";
import { fetchCourseHistory } from "~/api/course-history";
import { fetchCoursePack, fetchCoursePackProgress } from "~/api/course-pack";
import { isAuthenticated } from "~/services/auth";
import { useCoursePackStore } from "../coursePack";

vi.mock("~/api/course-pack");
vi.mock("~/api/course-history");
vi.mock("~/services/auth");

describe("course pack store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("should ", async () => {
    const coursePack: CoursePack = {
      id: "coursePackId",
      title: "课程包1",
      description: "这是一个课程包",
      isFree: true,
      courses: [],
      cover: "",
    };

    const firstCourse: Course = {
      id: "1",
      title: "第一课",
      description: "",
      video: "",
      order: 1,
      coursePackId: coursePack.id,
      completionCount: 0,
      statementIndex: 0,
      statements: [
        { id: "1", order: 1, english: "I", chinese: "我", soundmark: "/aɪ/", isMastered: false },
        {
          id: "2",
          order: 2,
          english: "like",
          chinese: "喜欢",
          soundmark: "/laɪk/",
          isMastered: false,
        },
      ],
    };

    const secondCourse: Course = {
      id: "2",
      title: "第二课",
      order: 2,
      description: "",
      video: "",
      coursePackId: coursePack.id,
      completionCount: 0,
      statementIndex: 0,
      statements: [
        { id: "1", order: 1, english: "I", chinese: "我", soundmark: "/aɪ/", isMastered: false },
        {
          id: "2",
          order: 2,
          english: "like",
          chinese: "喜欢",
          soundmark: "/laɪk/",
          isMastered: false,
        },
      ],
    };

    coursePack.courses = [firstCourse, secondCourse];

    vi.mocked(fetchCoursePack).mockImplementation(async () => coursePack);

    vi.mocked(fetchCourseHistory).mockImplementation(async () => {
      return [
        {
          id: 1,
          completionCount: 5,
          courseId: firstCourse.id,
          coursePackId: coursePack.id,
        },
      ];
    });

    const coursePackStore = useCoursePackStore();

    await coursePackStore.setupCoursePack(coursePack.id);

    await coursePackStore.updateCoursesCompleteCount(coursePack.id);

    expect(coursePackStore.currentCoursePack?.courses[0].completionCount).toBe(5);
    expect(coursePackStore.currentCoursePack?.courses[1].completionCount).toBe(0);
  });

  it("loads course pack progress for an authenticated user", async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    vi.mocked(fetchCoursePackProgress).mockResolvedValue({
      totalCourses: 10,
      completedCourses: 3,
      progress: 30,
      lastCourseId: "course-1",
      lastStatementIndex: 2,
    });

    const coursePackStore = useCoursePackStore();
    await coursePackStore.setupCoursePackProgress("coursePackId");

    expect(coursePackStore.currentProgress).toEqual({
      totalCourses: 10,
      completedCourses: 3,
      progress: 30,
      lastCourseId: "course-1",
      lastStatementIndex: 2,
    });
  });
});
