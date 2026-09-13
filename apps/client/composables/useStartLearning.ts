import { useRouter } from "vue-router";

import { fetchDefaultLearningEntry } from "~/api/course-pack";
import { resolveStartLearningPath } from "~/utils/learningEntry";

/**
 * 「开始学习」的唯一实现 (单一来源)。
 *
 * 登录态首页 (pages/index.vue)、游客落地页 (components/Landing/index.vue) 与
 * 首页回车快捷键都调用这里的 startLearning, 保证两条路径结果完全一致:
 * 后端默认课程的第一组练习; 只有接口失败时才兜底课程商城。
 *
 * 目标地址与解析规则都在 utils/learningEntry.ts, 本文件只负责注入 HTTP 取数与路由跳转。
 */
export function useStartLearning() {
  const router = useRouter();

  async function startLearning() {
    const target = await resolveStartLearningPath(fetchDefaultLearningEntry);
    await router.push(target.path);
  }

  return { startLearning };
}
