/** UI 基元的公共类型 (独立文件: <script setup> 内不允许 ES module 导出) */

import type { AdminPlanPayload } from "~/types/admin";

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
