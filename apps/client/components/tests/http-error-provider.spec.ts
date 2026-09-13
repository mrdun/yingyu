import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HttpErrorProvider from "../HttpErrorProvider.vue";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  toastError: vi.fn(),
  handler: undefined as undefined | ((message: string, statusCode: number) => void),
}));

vi.mock("vue-sonner", () => ({
  toast: { error: mocks.toastError },
}));

vi.mock("~/services/auth", () => ({
  signIn: mocks.signIn,
}));

vi.mock("~/api/http", () => ({
  injectHttpStatusErrorHandler: (handler: typeof mocks.handler) => {
    mocks.handler = handler;
  },
}));

function mountProvider() {
  return mount(HttpErrorProvider, {
    slots: { default: "<div>应用内容</div>" },
  });
}

describe("HttpErrorProvider 的 HTTP 状态码处理", () => {
  beforeEach(() => {
    mocks.signIn.mockClear();
    mocks.toastError.mockClear();
    mocks.handler = undefined;
  });

  it("页面级数据请求 401 不再自动跳转登录页 (游客态可以正常渲染)", () => {
    mountProvider();
    expect(mocks.handler).toBeTypeOf("function");

    mocks.handler?.("Unauthorized", 401);

    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("401 不弹错误提示: 未登录是游客的正常状态", () => {
    mountProvider();

    mocks.handler?.("Unauthorized", 401);

    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("其它状态码仍然提示, 后台权限不足 (403) 不静默", () => {
    mountProvider();

    mocks.handler?.("Insufficient permissions", 403);

    expect(mocks.toastError).toHaveBeenCalledWith("Insufficient permissions");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("仍然包裹应用内容", () => {
    const wrapper = mountProvider();

    expect(wrapper.text()).toContain("应用内容");
  });
});
