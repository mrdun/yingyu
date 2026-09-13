import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPartner,
  fetchPartnerCommissions,
  fetchPartnerMe,
  fetchPartnerReferrals,
} from "../partner";

const { httpMock } = vi.hoisted(() => ({ httpMock: vi.fn() }));

vi.mock("../http", () => ({
  getHttp: () => httpMock,
}));

describe("partner API client", () => {
  beforeEach(() => {
    httpMock.mockReset();
    httpMock.mockResolvedValue({
      isPartner: true,
      status: "active",
      referralCode: "CODE",
      commission: { rateBps: 4000, percentage: "40%", plans: [] },
    });
  });

  it("reads current commission from the backend (no local rate calculation)", async () => {
    const me = await fetchPartnerMe();

    expect(httpMock).toHaveBeenCalledWith("/partner/me", { method: "get" });
    expect(me.commission.percentage).toBe("40%");
    expect(me.commission.rateBps).toBe(4000);
    // 旧字段不再返回
    expect("commissionRateBps" in me).toBe(false);
  });

  it("applies as partner and returns the same view shape", async () => {
    const me = await applyPartner();

    expect(httpMock).toHaveBeenCalledWith("/partner/apply", { method: "post" });
    expect(me.commission.plans).toEqual([]);
  });

  it("loads referral records from the API", async () => {
    await fetchPartnerReferrals();

    expect(httpMock).toHaveBeenCalledWith("/partner/referrals", { method: "get" });
  });

  it("loads commission summary from the API (statuses are backend-defined)", async () => {
    httpMock.mockResolvedValueOnce({
      totalCommissionFen: 720,
      holdingFen: 720,
      pendingFen: 0,
      payableFen: 0,
      paidFen: 0,
      reversedFen: 0,
      count: 1,
    });

    const summary = await fetchPartnerCommissions();

    expect(httpMock).toHaveBeenCalledWith("/partner/commissions", { method: "get" });
    expect(summary.holdingFen).toBe(720);
  });
});
