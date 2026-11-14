// End-to-end tests. They create and delete squads, so they run only against this computer, with the
// website started with NEXT_PUBLIC_DEV_LOGIN=1 and an API on a throwaway copy of the database.
// Chrome is the installed one, launched headless with its own empty profile.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.BASE_URL ?? "http://localhost:3000";
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseURL)) {
  throw new Error(`E2E tests write data and only run on this computer, not ${baseURL}`);
}

export default defineConfig({
  testDir: "./e2e",
  workers: 1,                 // the squad flows share one demo wallet
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    baseURL,
    headless: true,
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome", viewport: { width: 1440, height: 900 } } },
    { name: "phone", use: { ...devices["Pixel 7"], channel: "chrome" } },
  ],
});
