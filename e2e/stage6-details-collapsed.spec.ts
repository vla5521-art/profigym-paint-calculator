import { test, expect, model, uploadStep } from "./fixtures";

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("Stage 6 shows only the two primary areas until Подробнее is opened", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"), { expandDetails: false });

  const details = page.getByTestId("cad-details");
  await expect(details).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("Основные площади CAD-расчёта").locator(":scope > div")).toHaveCount(2);
  await expect(page.getByText("Полная площадь", { exact: true })).toBeVisible();
  await expect(page.getByText("Площадь для окрашивания", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cad-result-screen")).toBeHidden();
  await expect(page.getByTestId("cad-viewer")).toBeHidden();
  await expect(page.getByTestId("cad-feature-table")).toBeHidden();

  await details.getByText("Подробнее", { exact: true }).click();
  await expect(details).toHaveAttribute("open", "");
  await expect(page.getByTestId("cad-result-screen")).toBeVisible();
  await expect(page.getByTestId("cad-viewer")).toBeVisible();
  await expect(page.getByTestId("cad-feature-table")).toBeVisible();
  await expect(page.getByText("Диагностический отчет", { exact: true })).toBeVisible();

  await details.getByText("Подробнее", { exact: true }).click();
  await expect(details).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("cad-details-content")).toBeHidden();
});

test("Stage 6 keeps review-required count visible while controls stay in details", async ({ page }) => {
  await uploadStep(page, model("open_internal_cavity.step"), { expandDetails: false });

  await expect(page.getByTestId("cad-review-required-indicator")).toContainText("Требуют проверки: 1");
  await expect(page.getByTestId("cad-review-required-indicator")).toBeVisible();
  await expect(page.getByRole("button", { name: "Подтвердить исключение" })).toBeHidden();

  await page.getByTestId("cad-details").getByText("Подробнее", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Подтвердить исключение" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Отклонить" }).first()).toBeVisible();
});

test("Stage 6 keeps CAD warnings visible outside the closed details", async ({ page }) => {
  await uploadStep(page, model("multi_body_no_contact.step", "contacts"), { expandDetails: false });

  await expect(page.getByTestId("cad-details")).not.toHaveAttribute("open", "");
  await expect(page.getByLabel("Предупреждения")).toBeVisible();
  await expect(page.getByLabel("Предупреждения")).toContainText("MULTI_BODY_MODEL");
});

test("Stage 6 native summary supports Enter and Space", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"), { expandDetails: false });
  const details = page.getByTestId("cad-details");
  const summary = details.locator(":scope > summary");

  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(details).not.toHaveAttribute("open", "");
});

test("Stage 6 layout is responsive in closed and open states", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"), { expandDetails: false });
  const details = page.getByTestId("cad-details");

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    await expect(page.getByTestId("cad-summary-total-area")).toBeVisible();
    await expect(page.getByTestId("cad-summary-paintable-area")).toBeVisible();
  }

  await details.getByText("Подробнее", { exact: true }).click();
  const openOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(openOverflow).toBeLessThanOrEqual(2);
});

test("Stage 6 print media exposes the full report even when details is closed", async ({ page }) => {
  await uploadStep(page, model("through_hole.step"), { expandDetails: false });
  await expect(page.getByTestId("cad-details")).not.toHaveAttribute("open", "");

  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("cad-details")).toHaveAttribute("open", "");
  await expect(page.getByTestId("cad-details-content")).toBeVisible();
  await expect(page.getByText("Диагностический отчет", { exact: true })).toBeVisible();
  await expect(page.getByText("Контактные исключения", { exact: true })).toBeVisible();
  await expect(page.getByTestId("cad-feature-table")).toBeVisible();
  await expect(page.getByTestId("cad-face-table")).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByTestId("cad-details")).not.toHaveAttribute("open", "");
});
