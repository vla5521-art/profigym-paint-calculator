import type { Page } from "@playwright/test";
import { test, expect, model, uploadStep, clickVisibleFace } from "./fixtures";

async function saveAndOpen(page: Page, filePath: string) {
  await uploadStep(page, filePath);
  await page.getByTestId("cad-save-button").click();
  await expect(page.getByTestId("cad-save-button")).toHaveText("Сохранено");
  const reportUrl = await page.getByTestId("cad-report-button").getAttribute("href");
  const calculationId = reportUrl!.split("/").at(-2)!;
  await page.getByRole("button", { name: "Сохранённые CAD-расчёты" }).click();
  const row = page.locator(`tr[data-calculation-id="${calculationId}"]`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Открыть" }).click();
  const detail = page.getByTestId("cad-saved-detail");
  await expect(detail).toHaveAttribute("data-calculation-id", calculationId);
  return { calculationId, detail, row };
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("Stage 7 keeps toolbar, Viewer and two primary areas visible while saved details toggle", async ({ page }) => {
  const { detail } = await saveAndOpen(page, model("through_hole.step"));
  await expect(detail.locator(".cad-result-toolbar")).toBeVisible();
  await expect(detail.getByTestId("cad-viewer")).toBeVisible();
  await expect(detail.getByTestId("cad-saved-summary-total-area")).toBeVisible();
  await expect(detail.getByTestId("cad-saved-summary-paintable-area")).toBeVisible();
  await expect(detail.locator(".cad-primary-metrics > div")).toHaveCount(2);

  const details = detail.getByTestId("cad-saved-details");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(detail.getByTestId("cad-saved-details-content")).toBeHidden();
  await details.getByText("Подробнее", { exact: true }).click();
  await expect(details).toHaveAttribute("open", "");
  await expect(detail.getByText("Уникально исключённая площадь", { exact: true })).toBeVisible();
  await expect(detail.getByText("Правила новой ревизии", { exact: true })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Контакты" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Features и ручные исключения" })).toBeVisible();
  await expect(detail.getByText(/Окрашиваемая площадь = Полная площадь/)).toBeVisible();
  await details.getByText("Подробнее", { exact: true }).click();
  await expect(details).not.toHaveAttribute("open", "");
});

test("Stage 7 keeps review-required indicator and saved warnings visible when closed", async ({ page }) => {
  const reviewResult = await saveAndOpen(page, model("open_internal_cavity.step"));
  await expect(reviewResult.detail.getByTestId("cad-saved-details")).not.toHaveAttribute("open", "");
  await expect(reviewResult.detail.getByTestId("cad-saved-review-required-indicator")).toContainText("Требуют проверки: 1");
  await expect(reviewResult.detail.getByTestId("cad-saved-review-required-indicator")).toBeVisible();

  const warningResult = await saveAndOpen(page, model("multi_body_no_contact.step", "contacts"));
  await expect(warningResult.detail.getByTestId("cad-saved-details")).not.toHaveAttribute("open", "");
  await expect(warningResult.detail.getByTestId("cad-saved-warnings")).toBeVisible();
  await expect(warningResult.detail.getByTestId("cad-saved-warnings")).toContainText("MULTI_BODY_MODEL");
});

test("Stage 7 saved Confirm, Reject and Reset remain operational inside details", async ({ page }) => {
  const { detail } = await saveAndOpen(page, model("open_internal_cavity.step"));
  await detail.getByTestId("cad-saved-details").getByText("Подробнее", { exact: true }).click();
  const features = detail.getByRole("heading", { name: "Features и ручные исключения" }).locator("..");
  let row = features.locator("tbody tr").filter({ hasText: "review_required" }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Подтвердить" }).click();
  row = features.locator("tbody tr").filter({ hasText: "manually_confirmed" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Сбросить" }).click();
  row = features.locator("tbody tr").filter({ hasText: "review_required" }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Отклонить" }).click();
  row = features.locator("tbody tr").filter({ hasText: "manually_rejected" }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Сбросить" }).click();
  await expect(features.locator("tbody tr").filter({ hasText: "review_required" }).first()).toBeVisible();
});

test("Stage 7 saved Manual Feature remains operational inside details", async ({ page }) => {
  const { detail } = await saveAndOpen(page, model("no_features.step"));
  await clickVisibleFace(page);
  await detail.getByTestId("cad-saved-details").getByText("Подробнее", { exact: true }).click();
  const createButton = detail.getByRole("button", { name: "Создать ручное исключение из выбранных граней" });
  await expect(createButton).toBeEnabled();
  page.once("dialog", (dialog) => dialog.accept());
  await createButton.click();
  const manual = detail.locator("tbody tr").filter({ hasText: "manual_feature" }).first();
  await expect(manual).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await manual.getByRole("button", { name: "Удалить" }).click();
  await expect(detail.locator("tbody tr").filter({ hasText: "manual_feature" })).toHaveCount(0);
});

test("Stage 7 saved transfer, report, revisions and calculation management remain operational", async ({ page }) => {
  const { calculationId, detail, row } = await saveAndOpen(page, model("through_hole.step"));
  const expectedArea = await detail.getByTestId("cad-saved-summary-paintable-area").getAttribute("data-area-m2");

  const [reportPage] = await Promise.all([
    page.context().waitForEvent("page"),
    detail.getByTestId("cad-report-button").click(),
  ]);
  await expect(reportPage.locator("body")).toContainText(calculationId);
  await reportPage.close();

  page.once("dialog", (dialog) => dialog.accept());
  await detail.getByTestId("cad-transfer-paint-button").click();
  await expect.poll(async () => Number(await page.getByTestId("paint-area-input").inputValue())).toBeCloseTo(Number(expectedArea), 9);

  await page.getByRole("button", { name: "Сохранённые CAD-расчёты" }).click();
  const original = page.locator(`tr[data-calculation-id="${calculationId}"]`);
  page.once("dialog", (dialog) => dialog.accept("Этап 7 — переименовано"));
  await original.getByRole("button", { name: "Переименовать" }).click();
  await expect(original).toContainText("Этап 7 — переименовано");

  const countBeforeDuplicate = await page.locator(".saved-table-wrap tbody tr").count();
  await original.getByRole("button", { name: "Дублировать" }).click();
  await expect(page.locator(".saved-table-wrap tbody tr")).toHaveCount(countBeforeDuplicate + 1);

  await original.getByRole("button", { name: "Открыть" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("cad-saved-detail").getByRole("button", { name: "Повторно рассчитать" }).click();
  await expect(page.getByTestId("cad-saved-detail")).toHaveAttribute("data-revision-number", "2");

  const duplicate = page.locator(".saved-table-wrap tbody tr").filter({ hasText: "копия" }).first();
  await expect(duplicate).toBeVisible();
  const deleteResponse = page.waitForResponse((response) => response.request().method() === "DELETE" && response.url().includes("/api/cad/calculations/"));
  // Chromium reports an empty 204 response proxied by Vite as ERR_ABORTED even though
  // the response and UI deletion both complete successfully; assert the response directly.
  page.removeAllListeners("requestfailed");
  page.once("dialog", (dialog) => dialog.accept());
  await duplicate.getByRole("button", { name: "Удалить" }).click();
  expect((await deleteResponse).status()).toBe(204);
  await expect(duplicate).toHaveCount(0);
  await expect(row).toHaveCount(1);
});

test("Stage 7 saved details support keyboard, responsive layouts and full print output", async ({ page }) => {
  const { detail } = await saveAndOpen(page, model("through_hole.step"));
  const details = detail.getByTestId("cad-saved-details");
  const summary = details.locator(":scope > summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await summary.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await summary.press("Space");
  await expect(details).not.toHaveAttribute("open", "");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(detail.locator(".cad-result-toolbar")).toBeVisible();
    await expect(detail.getByTestId("cad-viewer")).toBeVisible();
    await expect(detail.getByTestId("cad-saved-summary-total-area")).toBeVisible();
    await expect(detail.getByTestId("cad-saved-summary-paintable-area")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  }

  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await expect(details).toHaveAttribute("open", "");
  await expect(detail.getByText("Правила новой ревизии", { exact: true }).locator("..")).toHaveAttribute("open", "");
  await page.emulateMedia({ media: "print" });
  await expect(detail.getByTestId("cad-saved-details-content")).toBeVisible();
  await expect(detail.getByText(/Окрашиваемая площадь = Полная площадь/)).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Features и ручные исключения" })).toBeVisible();
  await page.emulateMedia({ media: "screen" });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await expect(details).not.toHaveAttribute("open", "");
  await expect(detail.getByText("Правила новой ревизии", { exact: true }).locator("..")).not.toHaveAttribute("open", "");
});
