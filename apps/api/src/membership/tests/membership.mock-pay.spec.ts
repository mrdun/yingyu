import { NotFoundException } from "@nestjs/common";

import { isProduction } from "../../common/env";
import { MembershipController } from "../membership.controller";

describe("isProduction", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns true for 'prod'", () => {
    process.env.NODE_ENV = "prod";
    expect(isProduction()).toBe(true);
  });

  it("returns true for 'production'", () => {
    process.env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
  });

  it("returns false for dev/test", () => {
    process.env.NODE_ENV = "test";
    expect(isProduction()).toBe(false);
  });
});

describe("MembershipController mockPay", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });

  it("is forbidden in production", async () => {
    process.env.NODE_ENV = "prod";
    const controller = new MembershipController({} as any, {} as any);

    await expect(
      controller.mockPay("mock_order", undefined, {} as any),
    ).rejects.toThrow(NotFoundException);
  });
});
