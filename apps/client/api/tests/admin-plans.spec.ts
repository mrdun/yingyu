import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAdminPlan,
  deleteAdminPlan,
  fetchAdminPlans,
  fetchBusinessSettings,
  updateAdminPlan,
  updateBusinessSetting,
} from "../admin";

const { httpMock } = vi.hoisted(() => ({ httpMock: vi.fn() }));

vi.mock("../http", () => ({
  getHttp: () => httpMock,
}));

describe("admin plan / business settings API client", () => {
  beforeEach(() => {
    httpMock.mockReset();
    httpMock.mockResolvedValue([]);
  });

  it("lists plans from the admin endpoint", async () => {
    await fetchAdminPlans();
    expect(httpMock).toHaveBeenCalledWith("/admin/plans", { method: "get" });
  });

  it("creates a plan with the database price payload", async () => {
    const payload = { id: "promo", name: "体验", priceFen: 990, durationDays: 7 };
    await createAdminPlan(payload);
    expect(httpMock).toHaveBeenCalledWith("/admin/plans", { method: "post", body: payload });
  });

  it("updates a plan by id", async () => {
    await updateAdminPlan("monthly", { priceFen: 2000 });
    expect(httpMock).toHaveBeenCalledWith("/admin/plans/monthly", {
      method: "patch",
      body: { priceFen: 2000 },
    });
  });

  it("deletes a plan by id", async () => {
    await deleteAdminPlan("promo");
    expect(httpMock).toHaveBeenCalledWith("/admin/plans/promo", { method: "delete" });
  });

  it("reads and writes business settings", async () => {
    await fetchBusinessSettings();
    expect(httpMock).toHaveBeenCalledWith("/admin/business-settings", { method: "get" });

    await updateBusinessSetting("refund_window_hours", "48");
    expect(httpMock).toHaveBeenCalledWith("/admin/business-settings/refund_window_hours", {
      method: "patch",
      body: { value: "48" },
    });
  });
});
