import { test, expect, model, uploadStep } from "./fixtures";

const DATABASE_NAME = "profigym-user-database";
const MARKER = "profigym:migrations:material-db-cleanup:v1";
const MARKER_VALUE = "completed";
const DELETE_CALLS = "stage5:legacy-delete-calls";

test("legacy material database is deleted once without breaking CAD or paint calculation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByLabel("Норма расхода краски")).toBeVisible();

  await page.evaluate(
    ({ databaseName, marker }) =>
      new Promise<void>((resolve, reject) => {
        localStorage.removeItem(marker);
        sessionStorage.removeItem("stage5:legacy-delete-calls");
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("materials");
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("materials", "readwrite");
          transaction.objectStore("materials").put({ name: "legacy" }, "one");
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
    { databaseName: DATABASE_NAME, marker: MARKER },
  );

  await page.addInitScript(
    ({ databaseName, counterKey }) => {
      const original = IDBFactory.prototype.deleteDatabase;
      IDBFactory.prototype.deleteDatabase = function deleteDatabase(name) {
        if (name === databaseName) {
          const count = Number(sessionStorage.getItem(counterKey) ?? "0");
          sessionStorage.setItem(counterKey, String(count + 1));
        }
        return original.call(this, name);
      };
    },
    { databaseName: DATABASE_NAME, counterKey: DELETE_CALLS },
  );

  await page.reload();
  await expect
    .poll(() => page.evaluate((marker) => localStorage.getItem(marker), MARKER))
    .toBe(MARKER_VALUE);
  await expect
    .poll(() =>
      page.evaluate(async (databaseName) => {
        const databases = await indexedDB.databases();
        return databases.some((database) => database.name === databaseName);
      }, DATABASE_NAME),
    )
    .toBe(false);
  await expect
    .poll(() =>
      page.evaluate((counterKey) => sessionStorage.getItem(counterKey), DELETE_CALLS),
    )
    .toBe("1");

  await page.reload();
  await expect(page.getByLabel("Норма расхода краски")).toBeVisible();
  expect(
    await page.evaluate((counterKey) => sessionStorage.getItem(counterKey), DELETE_CALLS),
  ).toBe("1");

  await page.getByLabel("Норма расхода краски").fill("0,20");
  await page.getByLabel("Площадь окраски (м²)").fill("10");
  await page.getByLabel("Коэффициент потерь").fill("1.10");
  await page.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" }).click();
  await expect(page.getByText("2,2", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "CAD-расчёт площади" }).click();
  await uploadStep(page, model("cube.step", "golden"));
  await expect(page.getByTestId("cad-summary-total-area")).toHaveAttribute(
    "data-area-m2",
    "0.0006",
  );
  await page.getByTestId("cad-save-button").click();
  await expect(page.getByTestId("cad-save-button")).toHaveText("Сохранено");

  await page.getByRole("button", { name: "Сохранённые CAD-расчёты" }).click();
  await page
    .getByTestId("cad-saved-calculations")
    .getByRole("button", { name: "Открыть" })
    .first()
    .click();
  await expect(page.getByTestId("cad-saved-detail")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("cad-transfer-paint-button").click();
  await expect(page.getByTestId("paint-area-source")).toContainText(
    "Источник площади: CAD-расчёт",
  );
  await page.getByLabel("Норма расхода краски").fill("0,20");
  await page.getByLabel("Коэффициент потерь").fill("1.10");
  await page.getByRole("button", { name: "РАССЧИТАТЬ РАСХОД КРАСКИ" }).click();
  await expect(
    page.getByText("Необходимое количество материала", { exact: true }),
  ).toBeVisible();
});

test("application renders when IndexedDB is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Норма расхода краски")).toBeVisible();
  await expect(page.getByRole("button", { name: "CAD-расчёт площади" })).toBeVisible();
});

test("application renders when reading localStorage throws", async ({ page }) => {
  await page.addInitScript((marker) => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      if (key === marker) throw new Error("storage unavailable");
      return original.call(this, key);
    };
  }, MARKER);

  await page.goto("/");

  await expect(page.getByLabel("Норма расхода краски")).toBeVisible();
  await expect(page.getByRole("button", { name: "CAD-расчёт площади" })).toBeVisible();
});
