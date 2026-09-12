import { defineStore } from "pinia";
import { ref } from "vue";

import type { CoursePack, CoursePackProgress, CoursePacksItem } from "~/types";
import { fetchCourseHistory } from "~/api/course-history";
import { fetchCoursePack, fetchCoursePackProgress, fetchCoursePacks } from "~/api/course-pack";
import { isAuthenticated } from "~/services/auth";

export const useCoursePackStore = defineStore("course-pack", () => {
  const coursePacks = ref<CoursePacksItem[]>([]);
  const currentCoursePack = ref<CoursePack>();
  const currentProgress = ref<CoursePackProgress>();

  async function setupCoursePacks() {
    const res = await fetchCoursePacks();
    coursePacks.value = res;
  }

  async function setupCoursePack(coursePackId: string) {
    if (coursePackId === currentCoursePack.value?.id) return;

    const res = await fetchCoursePack(coursePackId);
    currentCoursePack.value = res;
  }

  async function setupCoursePackProgress(coursePackId: string) {
    if (!isAuthenticated()) {
      currentProgress.value = undefined;
      return;
    }
    try {
      currentProgress.value = await fetchCoursePackProgress(coursePackId);
    } catch {
      currentProgress.value = undefined;
    }
  }

  async function updateCoursesCompleteCount(coursePackId: string) {
    const courseHistory = await fetchCourseHistory(coursePackId);

    const find = (courseId: string) =>
      courseHistory.find((history) => history.courseId === courseId);

    currentCoursePack.value?.courses.forEach((course) => {
      const matchCourseHistory = find(course.id);

      if (matchCourseHistory) {
        course.completionCount = matchCourseHistory.completionCount;
      }
    });
  }

  return {
    setupCoursePack,
    setupCoursePacks,
    setupCoursePackProgress,
    updateCoursesCompleteCount,
    currentCoursePack,
    currentProgress,
    coursePacks,
  };
});
