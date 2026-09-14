import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ofetch 的 onResponseError 只是被 stub 掉, 其余导出保持真实
 * (http.ts 只用 ofetch.create, 其它模块仍可正常 import ofetch)。
 */
const mocks = vi.hoisted(() => ({
  httpOptions: undefined as undefined | Record<string, any>,
}));

vi.mock("ofetch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ofetch")>();
  return {
    ...actual,
    ofetch: {
      ...actual.ofetch,
      create: (options: Record<string, any>) => {
        mocks.httpOptions = options;
        return vi.fn();
      },
    },
  };
});

vi.mock("#app", () => ({
  useRuntimeConfig: () => ({ public: { apiBase: "http://localhost:3001" } }),
}));

vi.mock("~/services/auth", () => ({
  getToken: vi.fn().mockResolvedValue("token"),
}));

/** 每个用例都重新加载模块, 绕开 setupHttp 的 `if (http) return http` 单例 */
async function loadHttp() {
  vi.resetModules();
  const mod = await import("../http");
  mod.setupHttp();
  return mod;
}

function getOptions() {
  if (!mocks.httpOptions) throw new Error("ofetch.create 未被调用");
  return mocks.httpOptions;
}

/** 复现 ofetch 的行为: onResponseError 的 reject 原样冒泡到 $fetch 调用方 */
async function rejectedFrom(response: { status: number; _data: unknown }) {
  let caught: any;
  try {
    await getOptions().onResponseError({ response });
  } catch (error) {
    caught = error;
  }
  return caught;
}

describe("HTTP 层的错误对象约定", () => {
  beforeEach(() => {
    mocks.httpOptions = undefined;
  });

  it("401 时 reject 出的错误对象带 status / statusCode", async () => {
    await loadHttp();

    const error = await rejectedFrom({ status: 401, _data: { data: {}, message: "Unauthorized" } });

    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(401);
    expect(error.statusCode).toBe(401);
    // 页面写法 (membership.vue): 游客态终于能命中, 而不是落到「加载失败」
    expect(error?.status === 401 || error?.statusCode === 401).toBe(true);
  });

  it("后端 message 仍可通过 e.message / e.data.message 取到", async () => {
    await loadHttp();

    const error = await rejectedFrom({
      status: 400,
      _data: { data: {}, message: "当前支付方式不可用" },
    });

    expect(error.message).toBe("当前支付方式不可用");
    expect(error.data.message).toBe("当前支付方式不可用");
    // 页面里常见的写法: error?.data?.message || error?.message
    expect(error?.data?.message || error?.message).toBe("当前支付方式不可用");
  });

  it("状态码处理器仍在同一时机收到 (message, statusCode)", async () => {
    const { injectHttpStatusErrorHandler } = await loadHttp();
    const handler = vi.fn();
    injectHttpStatusErrorHandler(handler);

    await rejectedFrom({ status: 401, _data: { data: {}, message: "Unauthorized" } });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("Unauthorized", 401);
  });

  it("校验错误的 message 数组仍逐个回调, 且 e.message 是可读字符串", async () => {
    const { injectHttpStatusErrorHandler } = await loadHttp();
    const handler = vi.fn();
    injectHttpStatusErrorHandler(handler);

    const error = await rejectedFrom({
      status: 422,
      _data: { data: {}, message: ["价格不合法", "时长不合法"] },
    });

    expect(handler).toHaveBeenNthCalledWith(1, "价格不合法", 422);
    expect(handler).toHaveBeenNthCalledWith(2, "时长不合法", 422);
    expect(error.status).toBe(422);
    expect(error.message).toBe("价格不合法, 时长不合法");
  });

  it("响应体为空时也不炸, 错误对象仍带状态码", async () => {
    const { injectHttpStatusErrorHandler } = await loadHttp();
    const handler = vi.fn();
    injectHttpStatusErrorHandler(handler);

    const error = await rejectedFrom({ status: 500, _data: undefined });

    expect(error.status).toBe(500);
    expect(error.message).toBe("请求失败 (HTTP 500)");
    // 处理器拿到的 message 永远是可读字符串 (不会 toast 出空内容)
    expect(handler).toHaveBeenCalledWith("请求失败 (HTTP 500)", 500);
  });

  it("retry / retryDelay 配置保持不变", async () => {
    await loadHttp();

    expect(getOptions().retry).toBe(3);
    expect(getOptions().retryDelay).toBe(1000);
  });
});
