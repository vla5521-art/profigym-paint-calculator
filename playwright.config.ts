import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const chromiumArgs = [
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--disable-dev-shm-usage",
  "--enable-unsafe-swiftshader",
  "--no-sandbox",
  "--disable-setuid-sandbox",
];
const chromiumRuntime = path.join(process.cwd(), ".tmp", "chromium-runtime");
const resultFile = process.env.E2E_SUITE === "a11y" ? "artifacts/e2e/a11y-results.json" : "artifacts/e2e/functional-results.json";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }], ["json", { outputFile: resultFile }]],
  outputDir: "test-results",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
  },
  webServer: {
    command: "node e2e/start-e2e-servers.mjs",
    url: "http://127.0.0.1:4173/api/cad/config",
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: path.join(chromiumRuntime, "chromium"), args: chromiumArgs, env: { ...process.env, FONTCONFIG_PATH: path.join(chromiumRuntime, "fonts"), XDG_CACHE_HOME: path.join(chromiumRuntime, "cache"), LD_LIBRARY_PATH: chromiumRuntime } } } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
