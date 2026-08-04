import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import path from "node:path";
import { test, expect, model, uploadStep, expectWebGl, clickVisibleFace } from "./fixtures";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("01 upload real STEP and render real WebGL viewer", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"));
  await expectWebGl(page);
  await expect(page.getByTestId("cad-summary-total-area")).toBeVisible();
  await page.screenshot({ path: "artifacts/e2e/viewer-through-hole.png", fullPage: true });
});

test("02 Viewer raycast selects the same face row and properties", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"));
  await expectWebGl(page);
  const faceId = await clickVisibleFace(page);
  const row = page.locator(`[data-testid="cad-face-table"] [data-face-id="${faceId}"]`);
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(row).toBeInViewport();
  await expect(page.getByTestId("cad-selected-face-properties")).toHaveAttribute("data-face-id", faceId);
  expect(Number(await page.getByTestId("cad-selected-face-properties").getAttribute("data-area-mm2"))).toBeGreaterThan(0);
});

test("03 face table selection changes the real Three material state", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"));
  await expectWebGl(page);
  await page.getByText("Грани и ручное исключение").click();
  const row = page.getByTestId("cad-face-table").locator("tbody tr").first();
  const faceId = await row.getAttribute("data-face-id");
  await row.click();
  await expect(page.getByTestId("cad-viewer")).toHaveAttribute("data-selected-face-id", faceId!);
  const materials = JSON.parse(await page.getByTestId("cad-viewer-state").getAttribute("data-material-state") ?? "[]");
  expect(materials.find((entry: { faceId: string }) => entry.faceId === faceId)?.selected).toBe(true);
});

test("04 multi-face feature selection and decision update viewer categories", async ({ page, request }) => {
  const jobId = await uploadStep(page, model("stepped_hole.step"));
  await expectWebGl(page);
  const row = page.getByTestId("cad-feature-table").locator("tbody tr").first();
  const featureId = await row.getAttribute("data-feature-id");
  const faceIds = (await row.getAttribute("data-face-id"))!.split(",");
  expect(faceIds.length).toBeGreaterThan(1);
  await row.click();
  const api = await (await request.get(`/api/cad/report/${jobId}/features`)).json();
  expect(api.features.find((entry: { featureId: string }) => entry.featureId === featureId).faceIds).toEqual(faceIds);
  const action = row.getByRole("button", { name: /Отклонить|Подтвердить исключение/ }).first();
  await action.click();
  await expect(row).toHaveAttribute("data-status", /manually_|confirmed|rejected/);
  const materials = JSON.parse(await page.getByTestId("cad-viewer-state").getAttribute("data-material-state") ?? "[]");
  expect(materials.filter((entry: { faceId: string }) => faceIds.includes(entry.faceId)).length).toBe(faceIds.length);
});

test("05 partial contact is a separate patch and does not recolor the whole face", async ({ page, request }) => {
  const jobId = await uploadStep(page, model("two_plates_partial_overlap.step", "contacts"));
  await expectWebGl(page);
  const state = page.getByTestId("cad-viewer-state");
  expect(Number(await state.getAttribute("data-patch-count"))).toBeGreaterThan(0);
  const mesh = await (await request.get(`/api/cad/report/${jobId}/viewer-mesh`)).json();
  const patch = mesh.mesh.patches[0];
  expect(patch.areaMm2).toBeGreaterThan(0);
  expect(mesh.mesh.faces.filter((face: { faceId: string; category: string }) => patch.faceIds.includes(face.faceId)).every((face: { category: string }) => face.category !== "contact_excluded")).toBe(true);
  const contact = (await (await request.get(`/api/cad/report/${jobId}/contacts`)).json()).contacts[0];
  expect(patch.category).toBe(contact.status === "confirmed" ? "contact_excluded" : contact.status);
  await page.screenshot({ path: "artifacts/e2e/partial-contact.png", fullPage: true });
});

test("06 review-required cavity decision persists after reload and reopen", async ({ page }) => {
  await uploadStep(page, model("open_internal_cavity.step"));
  const feature = page.getByTestId("cad-feature-table").locator('[data-status="review_required"]').first();
  await expect(feature).toBeVisible();
  const featureId = await feature.getAttribute("data-feature-id");
  await feature.click();
  const before = Number(await page.getByTestId("cad-summary-paintable-area").getAttribute("data-area-m2"));
  await feature.getByRole("button", { name: "Подтвердить исключение" }).click();
  await expect(page.getByTestId("cad-feature-table").locator(`[data-feature-id="${featureId}"]`)).toHaveAttribute("data-status", "manually_confirmed");
  const after = Number(await page.getByTestId("cad-summary-paintable-area").getAttribute("data-area-m2"));
  expect(after).toBeLessThan(before);
  await page.getByTestId("cad-save-button").click();
  await expect(page.getByTestId("cad-save-button")).toHaveText("Сохранено");
  await page.reload();
  await page.getByRole("button", { name: "Сохранённые CAD-расчёты" }).click();
  await page.getByTestId("cad-saved-calculations").getByRole("button", { name: "Открыть" }).first().click();
  await expect(page.getByTestId("cad-saved-detail")).toBeVisible();
  await page.getByTestId("cad-saved-details").getByText("Подробнее", { exact: true }).click();
  await expect(page.getByTestId("cad-saved-detail").locator('tr[data-status="manually_confirmed"], tr:has-text("manually_confirmed")').first()).toBeVisible();
});

test("07 manual exclusion created and removed through UI", async ({ page }) => {
  await uploadStep(page, model("no_features.step"));
  await expectWebGl(page);
  await clickVisibleFace(page);
  const before = Number(await page.getByTestId("cad-summary-paintable-area").getAttribute("data-area-m2"));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /Создать ручное исключение \(1\)/ }).click();
  const manual = page.getByTestId("cad-feature-table").locator('tr:has-text("Ручное исключение")');
  await expect(manual).toBeVisible();
  expect(Number(await page.getByTestId("cad-summary-paintable-area").getAttribute("data-area-m2"))).toBeLessThan(before);
  await manual.getByRole("button", { name: "Удалить" }).click();
  await expect(manual).toHaveCount(0);
  expect(Number(await page.getByTestId("cad-summary-paintable-area").getAttribute("data-area-m2"))).toBeCloseTo(before, 8);
});

test("08 saved calculation is readable by a restarted backend process", async ({ page, request }) => {
  await uploadStep(page, model("through_hole.step"));
  await page.getByTestId("cad-save-button").click();
  const reportUrl = await page.getByTestId("cad-report-button").getAttribute("href");
  const calculationId = reportUrl!.split("/").at(-2)!;
  const runtime = path.join(process.cwd(), ".tmp", "e2e-runtime");
  const child = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env: { ...process.env, CAD_API_PORT: "8790", CAD_UPLOAD_DIR: path.join(runtime, "uploads-restarted"), CAD_CALCULATION_STORAGE_PATH: path.join(runtime, "storage"), CAD_DATABASE_PATH: path.join(runtime, "storage", "e2e.sqlite"), NODE_ENV: "test" }, stdio: "pipe" });
  try {
    await expect.poll(async () => {
      try { return (await request.get("http://127.0.0.1:8790/api/cad/config")).status(); }
      catch { return 0; }
    }, { timeout: 15_000 }).toBe(200);
    const reopened = await request.get(`http://127.0.0.1:8790/api/cad/calculations/${calculationId}`);
    expect(reopened.status()).toBe(200);
    const body = await reopened.json();
    expect(body.calculation.calculationId).toBe(calculationId);
    expect(body.calculation.featureSummary.paintableArea.m2).toBeGreaterThan(0);
    const mesh = await request.get(`http://127.0.0.1:8790/api/cad/calculations/${calculationId}/viewer-mesh`);
    expect((await mesh.json()).mesh.faces.length).toBeGreaterThan(0);
  } finally { child.kill("SIGTERM"); }
});

test("09 HTML report with preview and without preview matches UI and JSON", async ({ page, request }) => {
  await uploadStep(page, model("through_hole.step"));
  await page.getByTestId("cad-save-button").click();
  await page.getByRole("button", { name: "Снимок для отчёта" }).click();
  const reportHref = await page.getByTestId("cad-report-button").getAttribute("href");
  const calculationId = reportHref!.split("/").at(-2)!;
  const json = await (await request.get(`/api/cad/calculations/${calculationId}/report.json`)).json();
  const [reportPage] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("cad-report-button").click()]);
  await reportPage.waitForLoadState();
  await expect(reportPage.locator("body")).toContainText(calculationId);
  await expect(reportPage.locator("body")).toContainText(json.summary.paintableAreaMm2.toLocaleString("ru-RU"));
  await expect(reportPage.locator("img")).toHaveCount(1);
  await reportPage.close();
  await page.goto("/");
  await uploadStep(page, model("no_features.step"));
  await page.getByTestId("cad-save-button").click();
  const [withoutPreview] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("cad-report-button").click()]);
  await expect(withoutPreview.locator("body")).toContainText(/Изображение модели: не приложено/i);
  await withoutPreview.close();
});

test("10 CAD area transfer populates paint calculator and marks manual override", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"));
  const expected = await page.getByTestId("cad-summary-paintable-area").getAttribute("data-area-m2");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("cad-transfer-paint-button").click();
  await expect.poll(async () => Number(await page.getByTestId("paint-area-input").inputValue())).toBeCloseTo(Number(expected), 9);
  const source = page.getByTestId("paint-area-source");
  await expect(source).toContainText("Источник площади: CAD-расчёт");
  await expect(source).toHaveAttribute("data-source-file", "through_hole.step");
  await page.getByTestId("paint-area-input").fill(String(Number(expected) + 1));
  await expect(source).toHaveAttribute("data-overridden", "true");
});

test("11 review warning is shown before CAD transfer", async ({ page }) => {
  await uploadStep(page, model("open_internal_cavity.step"));
  await expect(page.getByTestId("cad-feature-table").locator('[data-status="review_required"]')).toHaveCount(1);
  let message = "";
  page.once("dialog", async (dialog) => { message = dialog.message(); await dialog.accept(); });
  await page.getByTestId("cad-transfer-paint-button").click();
  await expect(page.getByTestId("paint-area-source")).toBeVisible();
  expect(message).toContain("окрашиваемая площадь");
  await expect(page.getByTestId("paint-area-source")).toContainText(/неподтвержд|провер/i);
});

test("12 WebGL-disabled Chromium shows functional fallback", async () => {
  const executablePath = path.join(process.cwd(), ".tmp", "chromium-runtime", "chromium");
  const browser = await chromium.launch({ executablePath, args: ["--disable-webgl", "--no-sandbox", "--headless"] });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto("http://127.0.0.1:4173/");
    await uploadStep(page, model("open_internal_cavity.step"));
    await expect(page.getByTestId("cad-viewer-fallback")).toBeVisible();
    await expect(page.getByTestId("cad-viewer-canvas")).toHaveCount(0);
    await expect(page.getByTestId("cad-feature-table")).toBeVisible();
    await expect(page.getByTestId("cad-summary-paintable-area")).toBeVisible();
    await expect(page.getByTestId("cad-save-button")).toBeEnabled();
    await expect(page.getByTestId("cad-transfer-paint-button")).toBeEnabled();
  } finally { await browser.close(); }
});

for (const viewport of [
  { name: "1440", width: 1440, height: 900 },
  { name: "1024", width: 1024, height: 768 },
  { name: "768", width: 768, height: 1024 },
]) test(`13 responsive Viewer ${viewport.name}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await uploadStep(page, model("through_hole.step"));
  await expectWebGl(page);
  const viewer = await page.getByTestId("cad-viewer").boundingBox();
  const canvas = await page.getByTestId("cad-viewer-canvas").boundingBox();
  expect(viewer!.width).toBeGreaterThan(0); expect(viewer!.height).toBeGreaterThan(0);
  expect(canvas!.x).toBeGreaterThanOrEqual(viewer!.x - 1);
  expect(canvas!.x + canvas!.width).toBeLessThanOrEqual(viewer!.x + viewer!.width + 1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await expect(page.getByTestId("cad-save-button")).toBeInViewport();
  await page.getByRole("button", { name: "Изометрия" }).click();
  await page.screenshot({ path: `artifacts/e2e/${viewport.name}/viewer.png`, fullPage: true });
});
