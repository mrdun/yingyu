/** UI 基元的公共类型 (独立文件: <script setup> 内不允许 ES module 导出) */

import type {
  AdminCoursePackWritePayload,
  AdminCourseWritePayload,
  AdminLearningPathItemWritePayload,
  AdminLearningPathWritePayload,
  AdminPlanPayload,
  AdminStatementWritePayload,
} from "~/types/admin";

export interface TableColumn {
  key: string;
  label: string;
  /** 右对齐 (金额/数量列) */
  align?: "left" | "right" | "center";
  /** 列宽类名 (Tailwind) */
  widthClass?: string;
}

/** 会员方案表单提交结果 (价格已换算为「分」) */
export interface PlanFormSubmit {
  mode: "create" | "edit";
  id: string;
  payload: AdminPlanPayload;
}

/** 课程包表单提交结果 (编辑时提交 order —— 与课程/语句排序共用同一条单条 PATCH) */
export interface CoursePackFormSubmit {
  mode: "create" | "edit";
  /** edit 时为课程包 id; create 时为空字符串 */
  id: string;
  payload: AdminCoursePackWritePayload & { title: string };
}

/** 课程表单提交结果 (order 是课程 DTO 的合法字段, 排序与编辑走同一条 PATCH) */
export interface CourseFormSubmit {
  mode: "create" | "edit";
  /** edit 时为课程 id; create 时为空字符串 */
  courseId: string;
  payload: AdminCourseWritePayload & { title: string };
}

/** 语句表单提交结果 (chinese/english 已由表单校验保证非空) */
export interface StatementFormSubmit {
  mode: "create" | "edit";
  /** edit 时为语句 id; create 时为空字符串 */
  statementId: string;
  payload: AdminStatementWritePayload & { chinese: string; english: string };
}

/** 学习路线表单提交结果 (order 是 DTO 的合法字段; 发布状态只能走 publish 端点) */
export interface LearningPathFormSubmit {
  mode: "create" | "edit";
  /** edit 时为路线 id; create 时为空字符串 */
  id: string;
  payload: AdminLearningPathWritePayload & { title: string };
}

/** 路线条目表单提交结果 (coursePackId 已由表单校验保证非空) */
export interface LearningPathItemFormSubmit {
  mode: "create" | "edit";
  /** edit 时为条目 id; create 时为空字符串 */
  itemId: string;
  payload: AdminLearningPathItemWritePayload & { coursePackId: string };
}
