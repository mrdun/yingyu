import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testMatch: ["**/home-layout.e2e.ts"],
  fullyParallel: true,
  retries: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
