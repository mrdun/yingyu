import { beforeEach, describe, expect, it, vi } from "vitest";

import { attributeReferral } from "~/api/partner";
import { isAuthenticated } from "~/services/auth";
import {
  attributePendingReferral,
  clearPendingReferralCode,
  getPendingReferralCode,
  savePendingReferralCode,
} from "../referral";

vi.mock("~/api/partner");
vi.mock("~/services/auth");

describe("referral service", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("saves and reads pending referral code", () => {
    savePendingReferralCode("CODE123");
    expect(getPendingReferralCode()).toBe("CODE123");
  });

  it("clears pending referral code", () => {
    savePendingReferralCode("CODE123");
    clearPendingReferralCode();
    expect(getPendingReferralCode()).toBeNull();
  });

  it("attributes pending code on login and clears it", async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    vi.mocked(attributeReferral).mockResolvedValue({ attributed: true });
    savePendingReferralCode("CODE123");

    await attributePendingReferral();

    expect(attributeReferral).toHaveBeenCalledWith("CODE123");
    expect(getPendingReferralCode()).toBeNull();
  });

  it("does nothing when not authenticated", async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false);
    savePendingReferralCode("CODE123");

    await attributePendingReferral();

    expect(attributeReferral).not.toHaveBeenCalled();
    expect(getPendingReferralCode()).toBe("CODE123");
  });

  it("clears pending code even when attribution fails", async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    vi.mocked(attributeReferral).mockRejectedValue(new Error("network"));
    savePendingReferralCode("CODE123");

    await attributePendingReferral();

    expect(getPendingReferralCode()).toBeNull();
  });
});
