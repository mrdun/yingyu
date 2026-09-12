import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPaymentChannels, updatePaymentChannel } from "../admin";

const { httpMock } = vi.hoisted(() => ({ httpMock: vi.fn() }));

vi.mock("../http", () => ({
  getHttp: () => httpMock,
}));

describe("admin payment channel client", () => {
  beforeEach(() => {
    httpMock.mockReset();
    httpMock.mockResolvedValue([]);
  });

  it("lists channels without any secret payload", async () => {
    const channels = await fetchPaymentChannels();

    expect(httpMock).toHaveBeenCalledWith("/admin/payment-channels", { method: "get" });
    expect(channels).toEqual([]);
  });

  it("toggles a channel by provider name", async () => {
    await updatePaymentChannel("wechat", true);

    expect(httpMock).toHaveBeenCalledWith("/admin/payment-channels/wechat", {
      method: "patch",
      body: { enabled: true },
    });
  });
});
