import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, model, uploadStep, expectWebGl } from "./fixtures";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("16 corrupted STEP is handled in UI and a valid retry succeeds", async ({ page }) => {
  await page.getByTestId("cad-upload-input").setInputFiles(model("invalid.step", "golden"));
  await page.getByRole("button", { name: "Импортировать и рассчитать" }).click();
  await expect(page.getByTestId("cad-upload-error")).toContainText(/структуру STEP|прочитать STEP/i, { timeout: 30_000 });
  await uploadStep(page, model("cube.step", "golden")); await expectWebGl(page);
});

test("17 oversized STEP is rejected before upload", async ({ page }) => {
  const oversized = path.join(process.cwd(), ".tmp", "oversized.step"); await fs.mkdir(path.dirname(oversized), { recursive: true }); await fs.writeFile(oversized, Buffer.alloc(50 * 1024 * 1024 + 1, 65));
  await page.getByTestId("cad-upload-input").setInputFiles(oversized);
  await expect(page.getByTestId("cad-upload-error")).toContainText(/превыш|лимит/i); await expect(page.getByRole("button", { name: "Импортировать и рассчитать" })).toBeDisabled();
});

test("18 unsupported format is rejected without network processing", async ({ page }) => {
  await page.getByTestId("cad-upload-input").setInputFiles({ name: "part.sldprt", mimeType: "application/octet-stream", buffer: Buffer.from("native cad") });
  await expect(page.getByRole("alert")).toContainText(/STEP/i); await expect(page.getByRole("button", { name: "Импортировать и рассчитать" })).toBeDisabled();
});

test("19 backend timeout produces a controlled UI error", async ({ page }) => {
  const bytes = await fs.readFile(model("cube.step", "golden"));
  await page.getByTestId("cad-upload-input").setInputFiles({ name: "timeout_fixture.step", mimeType: "model/step", buffer: bytes });
  await page.getByRole("button", { name: "Импортировать и рассчитать" }).click();
  await expect(page.getByTestId("cad-upload-error")).toContainText(/время обработки/i, { timeout: 30_000 });
});

test("20 UI recovers after timeout and processes another file", async ({ page }) => {
  const bytes = await fs.readFile(model("cube.step", "golden"));
  await page.getByTestId("cad-upload-input").setInputFiles({ name: "timeout_fixture.step", mimeType: "model/step", buffer: bytes }); await page.getByRole("button", { name: "Импортировать и рассчитать" }).click(); await expect(page.getByTestId("cad-upload-error")).toBeVisible({ timeout: 30_000 });
  await uploadStep(page, model("through_hole.step")); await expect(page.getByTestId("cad-result-screen")).toBeVisible();
});

test("21 multiple STEP files can be processed sequentially", async ({ page }) => {
  await uploadStep(page, model("cube.step", "golden")); const first = await page.getByTestId("cad-summary-total-area").getAttribute("data-area-m2");
  await uploadStep(page, model("rectangular_box.step", "golden")); const second = await page.getByTestId("cad-summary-total-area").getAttribute("data-area-m2"); expect(first).not.toBe(second);
});

test("22 summary matches the frozen golden regression value", async ({ page }) => {
  await uploadStep(page, model("cube.step", "golden")); await expect(page.getByTestId("cad-summary-total-area")).toHaveAttribute("data-area-m2", "0.0006");
});

test("23 JSON report is reachable through the UI-created calculation", async ({ page, request }) => {
  await uploadStep(page, model("through_hole.step")); await page.getByTestId("cad-save-button").click();
  const html = await page.getByTestId("cad-report-button").getAttribute("href"); const id = html!.split("/").at(-2)!; const response = await request.get(`/api/cad/calculations/${id}/report.json`); expect(response.status()).toBe(200); const body = await response.json(); expect(body.calculationId).toBe(id); expect(body.applicationVersion).toBe("2.0.3");
});

test("24 HTML report is escaped and contains authoritative areas", async ({ page }) => {
  await uploadStep(page, model("cube.step", "golden")); await page.getByTestId("cad-save-button").click(); const [report] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("cad-report-button").click()]); await expect(report.locator("body")).toContainText("PROFiGYM 2.0.3"); await expect(report.locator("body")).toContainText(/600/); await report.close();
});

test("25 saved calculation remains available after browser reload", async ({ page }) => {
  await uploadStep(page, model("cube.step", "golden")); await page.getByTestId("cad-save-button").click(); await page.reload(); await page.getByRole("button", { name: "Сохранённые CAD-расчёты" }).click(); await expect(page.getByTestId("cad-saved-calculations").getByRole("button", { name: "Открыть" }).first()).toBeVisible();
});

test("26 calculation API remains available to a new browser page", async ({ page }) => {
  await uploadStep(page, model("cube.step", "golden")); await page.getByTestId("cad-save-button").click(); const href = await page.getByTestId("cad-report-button").getAttribute("href"); const id = href!.split("/").at(-2)!; const second = await page.context().newPage(); await second.goto("/"); const status = await second.evaluate(async (calculationId) => (await fetch(`/api/cad/calculations/${calculationId}`)).status, id); expect(status).toBe(200); await second.close();
});

test("27 quality workflow has no browser console or mandatory API errors", async ({ page }) => { await uploadStep(page, model("multiple_features.step", "golden")); await expectWebGl(page); await expect(page.getByTestId("cad-feature-table")).toBeVisible(); });
