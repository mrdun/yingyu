import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMembershipOrder, fetchOrderStatus, fetchPaymentMethods } from "../membership";

const { httpMock } = vi.hoisted(() => ({ httpMock: vi.fn() }));

vi.mock("../http", () => ({
  getHttp: () => httpMock,
}));

describe("membership payment API client", () => {
  beforeEach(() => {
    httpMock.mockReset();
    httpMock.mockResolvedValue({});
  });

  it("reads the payment methods enabled by the server", async () => {
    await fetchPaymentMethods();
    expect(httpMock).toHaveBeenCalledWith("/membership/payment-methods", { method: "get" });
  });

  it("creates an order for the selected plan + payment method", async () => {
    await createMembershipOrder("monthly", "wechat_native", "idem-1");

    expect(httpMock).toHaveBeenCalledWith("/membership/orders", {
      method: "post",
      body: { planId: "monthly", paymentMethod: "wechat_native", idempotencyKey: "idem-1" },
    });
  });

  it("polls the order status endpoint (server is the source of truth)", async () => {
    await fetchOrderStatus("order-1");
    expect(httpMock).toHaveBeenCalledWith("/membership/orders/order-1", { method: "get" });
  });
});
