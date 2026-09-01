import { navigateTo } from "#app";

export function useNavigation() {
  function gotoCourseList(coursePackId: string) {
    navigateTo(`/course-pack/${coursePackId}`);
  }

  function gotoGame(coursePackId: string, courseId: string) {
    navigateTo(`/game/${coursePackId}/${courseId}`);
  }

  function gotoLearningPathDetail(pathId: string) {
    navigateTo(`/learning-path/${pathId}`);
  }

  return {
    gotoCourseList,
    gotoGame,
    gotoLearningPathDetail,
  };
}
