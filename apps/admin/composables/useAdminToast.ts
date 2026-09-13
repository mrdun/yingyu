import type { ToastInput } from "~/stores/toast";
import { clearToasts, dismissToast, pushToast, useToastState } from "~/stores/toast";
import { PLACEHOLDER_NOTICE } from "~/utils/nav";

/** toast 的语义化入口 (UI 基元配套) */
export function useAdminToast() {
  const state = useToastState();

  return {
    toasts: state.items,
    push: pushToast,
    dismiss: dismissToast,
    clear: clearToasts,
    success: (title: string, description?: string) =>
      pushToast({ tone: "success", title, ...(description ? { description } : {}) }),
    error: (title: string, description?: string) =>
      pushToast({
        tone: "error",
        title,
        ...(description ? { description } : {}),
        durationMs: 6000,
      }),
    warning: (title: string, description?: string) =>
      pushToast({ tone: "warning", title, ...(description ? { description } : {}) }),
    info: (title: string, description?: string) =>
      pushToast({ tone: "info", title, ...(description ? { description } : {}) }),
    custom: (input: ToastInput) => pushToast(input),
    /** 未实现模块的占位提示 ("后续批次") */
    placeholder: (moduleLabel: string) =>
      pushToast({
        tone: "info",
        title: PLACEHOLDER_NOTICE,
        description: `「${moduleLabel}」将在后续批次实现`,
      }),
  };
}
