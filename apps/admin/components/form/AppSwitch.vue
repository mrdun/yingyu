<script setup lang="ts">
import { ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    label?: string;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  { label: "", disabled: false, loading: false },
);

const emit = defineEmits<{ "update:modelValue": [boolean] }>();

const inputRef = ref<HTMLInputElement | null>(null);

/**
 * 受控开关: props.modelValue 是唯一真相, 可视状态必须始终等于它。
 *
 * 为什么只写 `:checked="props.modelValue"` 会撒谎 (线上缺陷):
 * 原生 checkbox 被点击时会先自己翻转 checked, 再触发 change。组件随父组件重渲染时,
 * Vue 的 patchElement 只比较「新旧 vnode 的 prop 值」, 值一样就跳过 patchProp
 * (只有 input 的 value 被特殊处理成「与 DOM 现值比较」, checked 没有这个待遇)。
 * 所以父组件拒绝这次变更时 —— 二次确认点「取消」、表单校验失败、异步 PATCH 失败回滚 ——
 * prop 前后都是 false, 那次重渲染不会把 DOM 写回去, 开关就停在用户点过的位置,
 * 视觉状态与真实状态相反 (支付渠道开关会让管理员误以为渠道已经停用)。
 *
 * 修法: 所有主动写 DOM 的地方, 写的都只能是「当前的 props.modelValue」这一个值,
 * 因此这些写入永远指向真相, 谁先谁后都不影响结果。两条路径互补:
 *  - 用户点了但父组件不接受 → change 里立刻拉回来 (那次 patch 已被 Vue 跳过, 只能靠它);
 *  - 父组件自己改了 prop (确认落库 / 异步失败回滚) → watch 再兜一层。
 * 重置与 Vue 的正常 patch 在同一个微任务里跑完, 用户看不到中间闪烁。
 */
function syncChecked(input: HTMLInputElement | null | undefined): void {
  if (input && input.checked !== props.modelValue) {
    input.checked = props.modelValue;
  }
}

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  // disabled / loading 时不响应点击, 但也不能任由 DOM 停在被改动之后的位置
  if (props.disabled || props.loading) {
    syncChecked(input);
    return;
  }
  emit("update:modelValue", input.checked);
  // 父组件接受时 props 随后就变, 那时 Vue 的 patch 会把开关正常切过去;
  // 父组件拒绝时 props 不变, 这里就是唯一能把 DOM 拉回真相的地方。
  syncChecked(input);
}

watch(
  () => props.modelValue,
  () => syncChecked(inputRef.value),
);
</script>

<template>
  <label class="flex items-center gap-2">
    <input
      ref="inputRef"
      type="checkbox"
      class="toggle toggle-sm"
      :checked="props.modelValue"
      :disabled="props.disabled || props.loading"
      @change="onChange"
    />
    <span
      v-if="props.loading"
      class="loading loading-spinner loading-xs"
    ></span>
    <span
      v-if="props.label"
      class="text-xs text-base-content/70"
    >
      {{ props.label }}
    </span>
  </label>
</template>
