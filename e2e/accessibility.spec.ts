import AxeBuilder from "@axe-core/playwright";
import { test, expect, model, uploadStep, expectWebGl } from "./fixtures";

test("@a11y CAD workflow has no critical accessibility violations", async ({ page }) => {
  await page.goto("/");
  await uploadStep(page, model("open_internal_cavity.step"));
  await expectWebGl(page);
  const results = await new AxeBuilder({ page }).exclude("canvas").analyze();
  expect(results.violations.filter((violation) => violation.impact === "critical"), JSON.stringify(results.violations, null, 2)).toEqual([]);
});

test("@a11y keyboard navigation, focus visibility, table actions and Escape", async ({ page }) => {
  await page.goto("/");
  const firstNav = page.getByRole("button", { name: "Калькулятор ЛКМ" });
  await firstNav.focus();
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus-visible");
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((element) => {
    const style = getComputedStyle(element);
    return `${style.outlineStyle}:${style.outlineWidth}:${style.boxShadow}`;
  });
  expect(outline).not.toMatch(/^none:0px:none$/);
  await uploadStep(page, model("through_hole.step"));
  await page.getByText("Грани и ручное исключение").click();
  const row = page.getByTestId("cad-face-table").locator("tbody tr").first();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("cad-selected-face-properties")).toContainText("Выбрана грань");
  await page.getByTestId("cad-transfer-paint-button").focus();
  const dialogPromise = page.waitForEvent("dialog");
  const enterPromise = page.keyboard.press("Enter");
  const dialog = await dialogPromise;
  await dialog.dismiss();
  await enterPromise;
  await expect(page.getByTestId("cad-transfer-paint-button")).toBeFocused();
});
