/**
 * 首次导入课程包时的发布状态取值 (无副作用, 可单测)。
 *
 * 课程商城只展示 `status='published'` 的课程包 (TASK-002-D-01/D-02);
 * 若沿用 schema 默认值 `draft`, 导入完成后商城为空 (TASK-002-L-01 RC 验证中发现)。
 * `access_level` 必须与 `is_free` 一致, 否则免费课会被当作会员课拦截。
 */
export function buildCoursePackSeedValues(isFree: boolean) {
  return {
    status: "published" as const,
    source: "manual" as const,
    shareLevel: "public" as const,
    accessLevel: isFree ? ("free" as const) : ("membership" as const),
  };
}
