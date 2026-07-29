export function printCalculation(): void {
  const originalTitle = document.title;
  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

  document.title = `PROFiGYM_расчет_краски_${localDate}`;

  let restored = false;
  const restoreTitle = (): void => {
    if (restored) return;
    restored = true;
    document.title = originalTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };

  window.addEventListener("afterprint", restoreTitle);
  window.print();

  window.setTimeout(restoreTitle, 1500);
}
