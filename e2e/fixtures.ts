import { test as base, expect, type Page } from "@playwright/test";
import path from "node:path";

export const model = (name: string, group = "features") => path.join(process.cwd(), "test-models", group, name);

export async function uploadStep(page: Page, filePath: string, { expandDetails = true }: { expandDetails?: boolean } = {}) {
  if (await page.getByTestId("cad-upload-input").count() === 0) {
    await page.getByRole("button", { name: "CAD-расчёт площади" }).click();
  }
  const importResponse = page.waitForResponse((response) => response.url().includes("/api/cad/import") && response.request().method() === "POST");
  await page.getByTestId("cad-upload-input").setInputFiles(filePath);
  await page.getByRole("button", { name: "Импортировать и рассчитать" }).click();
  const response = await importResponse;
  expect(response.status()).toBe(202);
  const payload = await response.json();
  await expect(page.getByTestId("cad-summary-total-area")).toHaveAttribute("data-area-m2", /[1-9]/, { timeout: 120_000 });
  const details = page.getByTestId("cad-details");
  await expect(details).not.toHaveAttribute("open", "");
  if (expandDetails) {
    await details.getByText("Подробнее", { exact: true }).click();
    await expect(page.getByTestId("cad-result-screen")).toBeVisible();
  }
  return String(payload.job.id);
}

export async function expectWebGl(page: Page) {
  const canvas = page.getByTestId("cad-viewer-canvas");
  await expect(canvas).toBeVisible();
  const active = await canvas.evaluate((element: HTMLCanvasElement) => Boolean(element.getContext("webgl2") || element.getContext("webgl")));
  expect(active).toBe(true);
  await expect(page.getByTestId("cad-viewer")).toHaveAttribute("data-renderer-state", "webgl");
  const state = page.getByTestId("cad-viewer-state");
  expect(Number(await state.getAttribute("data-face-count"))).toBeGreaterThan(0);
  expect(Number(await state.getAttribute("data-triangle-count"))).toBeGreaterThan(0);
}

export async function clickVisibleFace(page: Page) {
  const canvas = page.getByTestId("cad-viewer-canvas");
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
    for (const y of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      await page.mouse.click(box!.x + box!.width * x, box!.y + box!.height * y);
      const selected = await page.getByTestId("cad-viewer-state").getAttribute("data-selected-face-id");
      if (selected) return selected;
    }
  }
  throw new Error("Raycasting did not select a visible mesh face");
}

type ErrorLog = string[];
export const test = base.extend<{ browserErrors: ErrorLog }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("requestfailed", (request) => {
      if (request.url().includes("/api/")) errors.push(`requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ""}`);
    });
    page.on("response", (response) => {
      if (response.url().includes("/api/") && response.status() >= 500) errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
    await use(errors);
    expect(errors, errors.join("\n")).toEqual([]);
  }, { auto: true }],
});

export { expect };
