import type { CoursePackAction } from "~/utils/courseStatus";

import { ref } from "vue";

import { useAdminToast } from "~/composables/useAdminToast";
import { getErrorMessage } from "~/services/admin-api";
import {
  archiveCoursePack,
  publishCoursePack,
  rejectCoursePackReview,
  restoreCoursePack,
  setCoursePackAccessLevel,
  submitCoursePackReview,
  toggleCoursePackFree,
} from "~/services/courses.service";
import { availableCoursePackActions } from "~/utils/courseStatus";

/**
 * 课程包的状态操作 / 访问级别操作 (列表页与详情页共用)。
 *
 * 三条硬约束:
 *  1. 状态动作只调用后端那 5 个既有端点, 前端**不**做第二套状态转换判断;
 *  2. 不做乐观更新: 成功后以后端返回结果重新拉取, 失败时不改任何本地状态;
 *  3. 后端拒绝时把错误原文展示出来 (toast 里直接显示 getErrorMessage(error)),
 *     并且照样重新对齐一次后端状态 —— 不允许"看起来成功其实没生效"。
 *
 * 破坏性/影响面大的动作 (发布/归档/改免费) 与普通动作一样都必须二次确认。
 */

export interface CoursePackActionTarget {
  id: string;
  title: string;
  status: string;
  accessLevel: string;
  isFree: boolean;
}

export interface CoursePackActionsOptions {
  /** 动作结束后刷新页面数据 (无论成功失败都调用, 让界面与后端一致) */
  onSuccess: () => Promise<void> | void;
}

/** 状态动作 → 既有端点 (没有第 6 个动作, 也没有批量端点) */
const ACTION_HANDLERS: Record<CoursePackAction, (id: string) => Promise<unknown>> = {
  "submit-review": submitCoursePackReview,
  reject: rejectCoursePackReview,
  publish: publishCoursePack,
  archive: archiveCoursePack,
  restore: restoreCoursePack,
};

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  tone: "danger" | "primary";
  successMessage: string;
  action: () => Promise<void>;
}

function accessLevelLabel(accessLevel: string): string {
  if (accessLevel === "free") return "免费";
  if (accessLevel === "membership") return "会员";
  return accessLevel || "未知";
}

export function useCoursePackActions(options: CoursePackActionsOptions) {
  const toast = useAdminToast();

  const confirmOpen = ref(false);
  const confirmLoading = ref(false);
  const confirmTitle = ref("确认操作");
  const confirmMessage = ref("");
  const confirmLabel = ref("确认");
  const confirmTone = ref<"danger" | "primary">("danger");

  let pendingAction: (() => Promise<void>) | null = null;
  let pendingSuccessMessage = "操作成功";

  function askConfirm(input: ConfirmOptions): void {
    confirmTitle.value = input.title;
    confirmMessage.value = input.message;
    confirmLabel.value = input.confirmLabel;
    confirmTone.value = input.tone;
    pendingSuccessMessage = input.successMessage;
    pendingAction = input.action;
    confirmOpen.value = true;
  }

  async function runPendingAction(): Promise<void> {
    if (!pendingAction || confirmLoading.value) return;
    confirmLoading.value = true;

    try {
      await pendingAction();
      toast.success(pendingSuccessMessage);
    } catch (error) {
      // 后端是唯一权威: 拒绝原因原样展示, 不做任何本地状态改写
      toast.error("操作未生效 (后端拒绝)", getErrorMessage(error));
    } finally {
      confirmLoading.value = false;
      confirmOpen.value = false;
      pendingAction = null;
      await options.onSuccess();
    }
  }

  /** 状态机动作: 只按当前状态挑出按钮, 合法性交给后端 */
  function askStatusAction(target: CoursePackActionTarget, action: CoursePackAction): void {
    const meta = availableCoursePackActions(target.status).find((item) => item.key === action);
    const handler = ACTION_HANDLERS[action];

    askConfirm({
      title: meta ? `${meta.label}课程包` : "切换课程包状态",
      message: meta
        ? meta.confirmMessage(target.title)
        : `确认对「${target.title}」执行「${action}」? 是否允许由后端状态机判定。`,
      confirmLabel: meta ? meta.label : "确认",
      tone: meta ? meta.confirmTone : "danger",
      successMessage: meta ? `已${meta.label}` : "已提交",
      action: async () => {
        await handler(target.id);
      },
    });
  }

  /** 访问级别切换 (PATCH /admin/course-packs/:id/access-level) */
  function askAccessLevel(target: CoursePackActionTarget): void {
    const next = target.accessLevel === "free" ? "membership" : "free";
    const nextLabel = accessLevelLabel(next);

    askConfirm({
      title: `切换为${nextLabel}`,
      message:
        `将「${target.title}」的访问级别从 ${accessLevelLabel(target.accessLevel)} 改为 ${nextLabel}? ` +
        (next === "free"
          ? "改为免费后所有用户都能学习该课程包 (不再校验会员)。"
          : "改为会员后只有有效会员能学习该课程包。") +
        " 该操作只改访问级别, 不影响状态机。",
      confirmLabel: `改为${nextLabel}`,
      tone: next === "free" ? "danger" : "primary",
      successMessage: `已改为${nextLabel}`,
      action: async () => {
        await setCoursePackAccessLevel(target.id, next);
      },
    });
  }

  /**
   * 免费/收费切换 (PATCH /admin/course-packs/:id/toggle-free)。
   * 该端点的语义是"取反后端当前值", 因此文案说明以当前显示值为准, 最终以后端返回值为准。
   */
  function askToggleFree(target: CoursePackActionTarget): void {
    const goingFree = target.accessLevel !== "free";
    const resultLabel = goingFree ? "免费" : "会员";

    askConfirm({
      title: "免费 / 收费切换",
      message:
        `对「${target.title}」执行免费/收费切换? 当前显示为 ${accessLevelLabel(target.accessLevel)}, ` +
        `切换后为 ${resultLabel} (后端按当前值取反)。` +
        (goingFree
          ? " 改为免费后所有用户都能学习该课程包。"
          : " 改为会员后只有有效会员能学习该课程包。"),
      confirmLabel: `切换为${resultLabel}`,
      tone: goingFree ? "danger" : "primary",
      successMessage: `已切换为${resultLabel}`,
      action: async () => {
        await toggleCoursePackFree(target.id);
      },
    });
  }

  return {
    confirmOpen,
    confirmLoading,
    confirmTitle,
    confirmMessage,
    confirmLabel,
    confirmTone,
    askConfirm,
    runPendingAction,
    askStatusAction,
    askAccessLevel,
    askToggleFree,
  };
}
