import { reactive } from "vue";

/**
 * 轻量 toast 队列 (自建 UI 基元)。
 * 刻意不引入 pinia / vue-sonner: 管理后台只需要一个全局通知队列 + 一个渲染宿主组件。
 */

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface ToastInput {
  title: string;
  tone?: ToastTone;
  description?: string;
  /** 0 表示不自动关闭 */
  durationMs?: number;
}

export interface ToastState {
  items: ToastItem[];
}

const DEFAULT_DURATION_MS = 4000;
const MAX_VISIBLE = 4;

const state = reactive<ToastState>({ items: [] });
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let sequence = 0;

export function pushToast(input: ToastInput): number {
  sequence += 1;
  const id = sequence;
  const item: ToastItem = {
    id,
    tone: input.tone ?? "info",
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
  };

  state.items.push(item);

  // 超出上限时丢弃最旧的一条 (连同它的定时器)
  while (state.items.length > MAX_VISIBLE) {
    const oldest = state.items[0];
    if (!oldest) break;
    dismissToast(oldest.id);
  }

  const duration = input.durationMs ?? DEFAULT_DURATION_MS;
  if (duration > 0) {
    timers.set(
      id,
      setTimeout(() => dismissToast(id), duration),
    );
  }

  return id;
}

export function dismissToast(id: number): void {
  const index = state.items.findIndex((item) => item.id === id);
  if (index >= 0) state.items.splice(index, 1);

  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
}

export function clearToasts(): void {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  state.items.splice(0, state.items.length);
}

export function useToastState(): ToastState {
  return state;
}
