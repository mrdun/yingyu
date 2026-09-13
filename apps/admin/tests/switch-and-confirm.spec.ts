// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import AppSwitch from "../components/form/AppSwitch.vue";
import AppConfirmDialog from "../components/ui/AppConfirmDialog.vue";

/**
 * 挂载型回归测试 (真实组件 + 真实 DOM)。
 *
 * 既有测试都是 readFileSync + 断言源码文本, 抓不到「DOM 与 props 不一致」这种运行时行为,
 * 而这类缺陷会一直骗用户: 支付渠道开关点「停用」→ 二次确认点「取消」→ 开关看起来还是停用的。
 * 这里只覆盖组件契约, 不改动页面调用方:
 *  1. 开关的可视状态永远等于 props.modelValue (父组件拒绝变更时也必须立刻回到真实值);
 *  2. 父组件接受变更 (v-model) 时, DOM 与 prop 一起切到新值;
 *  3. disabled / loading 时不响应点击, 也不 emit;
 *  4. 二次确认点「取消」只关闭对话框, 不触发 confirm。
 */

/** 原生 checkbox 被点击时的真实行为: 先自己翻转 checked, 再触发 change */
async function userClickSwitch(input: HTMLInputElement): Promise<void> {
  input.checked = !input.checked;
  input.dispatchEvent(new Event("change"));
  await nextTick();
}

/** 按文案点真实按钮 (对话框内容被 Teleport 渲染到 body, 所以从 document 里找) */
function clickButton(label: string): void {
  const buttons = Array.from(document.querySelectorAll("button"));
  const button = buttons.find((item) => item.textContent?.trim() === label);
  if (!button) {
    const labels = buttons.map((item) => item.textContent?.trim()).join(" / ");
    throw new Error(`找不到文案为「${label}」的按钮, 当前按钮: ${labels}`);
  }
  button.dispatchEvent(new Event("click", { bubbles: true }));
}

afterEach(() => {
  // 对话框通过 Teleport 挂在 body 上, 用例之间清理干净, 避免互相干扰
  document.body.innerHTML = "";
});

describe("AppSwitch: prop 是唯一真相, DOM 不许撒谎", () => {
  it("父组件不接受变更时 (用户点了取消), DOM 立刻回到 props.modelValue", async () => {
    const received: boolean[] = [];
    const RejectingParent = defineComponent({
      name: "RejectingParent",
      setup() {
        const accepted = ref(false);
        const renders = ref(0);
        return () =>
          h(
            "div",
            { "data-renders": String(renders.value) },
            h(AppSwitch, {
              modelValue: accepted.value,
              "onUpdate:modelValue": (next: boolean) => {
                // 刻意不更新 accepted: 代表「确认之前绝不落库」的父组件 (payment-channels 的 askToggle),
                // 同时让父组件重渲染一次 —— 正是这次重渲染里 Vue 会跳过 checked 的写入
                received.push(next);
                renders.value += 1;
              },
            }),
          );
      },
    });

    const wrapper = mount(RejectingParent);
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.checked).toBe(false);

    await userClickSwitch(input);

    // 点击被识别: 事件确实发出去了, 只是父组件拒绝
    expect(received).toEqual([true]);
    expect(wrapper.findComponent(AppSwitch).emitted("update:modelValue")).toEqual([[true]]);
    // 父组件确实重渲染过 (线上是 askToggle 打开确认框), 只是 prop 没变
    expect(wrapper.find("div").attributes("data-renders")).toBe("1");
    // 核心断言: prop 没变 → 开关必须还是「已停用」
    expect(wrapper.findComponent(AppSwitch).props("modelValue")).toBe(false);
    expect(input.checked).toBe(false);
  });

  it("父组件接受变更时 (v-model), DOM 与 prop 一起变为新值", async () => {
    const AcceptingParent = defineComponent({
      name: "AcceptingParent",
      setup() {
        const accepted = ref(false);
        return () =>
          h(AppSwitch, {
            modelValue: accepted.value,
            "onUpdate:modelValue": (next: boolean) => {
              accepted.value = next;
            },
          });
      },
    });

    const wrapper = mount(AcceptingParent);
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.checked).toBe(false);

    await userClickSwitch(input);

    expect(wrapper.findComponent(AppSwitch).props("modelValue")).toBe(true);
    expect(input.checked).toBe(true);
  });

  it("disabled 时不响应点击, 也不 emit (DOM 同样不许留在被改动的位置)", async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: false, disabled: true } });
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.disabled).toBe(true);

    // 真实浏览器不会给 disabled 控件派发 change, 这里按最坏情况直接派发,
    // 验证组件自己不会留下与 prop 不一致的可视状态
    await userClickSwitch(input);

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(input.checked).toBe(false);
  });

  it("loading 时不响应点击, 也不 emit", async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: true, loading: true } });
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.checked).toBe(true);

    await userClickSwitch(input);

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(input.checked).toBe(true);
  });

  it("外部改回 prop (确认后落库 / 异步失败回滚), DOM 跟着回去", async () => {
    const wrapper = mount(AppSwitch, { props: { modelValue: true } });
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.checked).toBe(true);

    await wrapper.setProps({ modelValue: false });

    expect(input.checked).toBe(false);
  });
});

describe("AppConfirmDialog: 取消只是取消", () => {
  function mountDialog() {
    return mount(AppConfirmDialog, {
      props: {
        modelValue: true,
        title: "停用该渠道",
        message: "停用后用户将无法使用该渠道付款。确认停用?",
      },
      attachTo: document.body,
    });
  }

  it("点「取消」: 不触发 confirm, 只 emit update:modelValue(false) 关闭对话框", async () => {
    const wrapper = mountDialog();

    clickButton("取消");
    await nextTick();

    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(wrapper.emitted("update:modelValue")).toEqual([[false]]);

    wrapper.unmount();
  });

  it("点「确认」: 触发 confirm (对照组, 证明按钮确实被点到)", async () => {
    const wrapper = mountDialog();

    clickButton("确认");
    await nextTick();

    expect(wrapper.emitted("confirm")).toHaveLength(1);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();

    wrapper.unmount();
  });
});

describe("支付渠道开关 + 二次确认 (复刻 payment-channels.vue 的流程)", () => {
  const ChannelRow = defineComponent({
    name: "ChannelRow",
    setup() {
      const enabled = ref(false);
      const confirmOpen = ref(false);
      let pending: boolean | null = null;

      // 与页面里的 askToggle / runPendingAction 同构: 点「确认」之前绝不改 enabled
      function askToggle(next: boolean): void {
        pending = next;
        confirmOpen.value = true;
      }

      function confirm(): void {
        if (pending === null) return;
        enabled.value = pending;
        pending = null;
        confirmOpen.value = false;
      }

      return () =>
        h("div", [
          h(AppSwitch, { modelValue: enabled.value, "onUpdate:modelValue": askToggle }),
          h(AppConfirmDialog, {
            modelValue: confirmOpen.value,
            title: "启用该渠道",
            message: "启用后用户可以选择该渠道付款。确认启用?",
            "onUpdate:modelValue": (open: boolean) => {
              confirmOpen.value = open;
            },
            onConfirm: confirm,
          }),
        ]);
    },
  });

  it("点开关 → 点「取消」: 开关回到原位, 不会假装已切换", async () => {
    const wrapper = mount(ChannelRow, { attachTo: document.body });
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.checked).toBe(false);

    await userClickSwitch(input);

    // 二次确认已弹出, 但真实状态还没变 → 开关不能显示成「已启用」
    expect(wrapper.findComponent(AppConfirmDialog).props("modelValue")).toBe(true);
    expect(input.checked).toBe(false);

    clickButton("取消");
    await nextTick();

    expect(wrapper.findComponent(AppConfirmDialog).props("modelValue")).toBe(false);
    expect(wrapper.findComponent(AppSwitch).props("modelValue")).toBe(false);
    expect(input.checked).toBe(false);

    wrapper.unmount();
  });

  it("点开关 → 点「确认」: 这时候开关才真正切到新值", async () => {
    const wrapper = mount(ChannelRow, { attachTo: document.body });
    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.checked).toBe(false);

    await userClickSwitch(input);
    expect(input.checked).toBe(false);

    clickButton("确认");
    await nextTick();

    expect(wrapper.findComponent(AppSwitch).props("modelValue")).toBe(true);
    expect(input.checked).toBe(true);

    wrapper.unmount();
  });
});
