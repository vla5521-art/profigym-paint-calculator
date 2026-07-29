const form = document.getElementById("paint-form");
const consumptionInput = document.getElementById("consumption");
const areaInput = document.getElementById("area");
const consumptionError = document.getElementById("consumption-error");
const areaError = document.getElementById("area-error");
const result = document.getElementById("result");

function readValue(input) {
  const normalized = input.value.trim().replace(",", ".");
  return normalized === "" ? null : Number(normalized);
}

function validateField(input, errorElement, label) {
  const value = readValue(input);

  if (value === null) {
    errorElement.textContent = `Введите значение: ${label}.`;
    input.setAttribute("aria-invalid", "true");
    return null;
  }

  if (!Number.isFinite(value)) {
    errorElement.textContent = "Введите корректное числовое значение.";
    input.setAttribute("aria-invalid", "true");
    return null;
  }

  if (value < 0) {
    errorElement.textContent = "Отрицательные значения недопустимы.";
    input.setAttribute("aria-invalid", "true");
    return null;
  }

  errorElement.textContent = "";
  input.removeAttribute("aria-invalid");
  return value;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const consumption = validateField(
    consumptionInput,
    consumptionError,
    "норма расхода"
  );

  const area = validateField(
    areaInput,
    areaError,
    "площадь окраски"
  );

  if (consumption === null || area === null) {
    result.textContent = "0.00";
    const firstInvalid = document.querySelector('[aria-invalid="true"]');
    firstInvalid?.focus();
    return;
  }

  result.textContent = (consumption * area).toFixed(2);
});

[consumptionInput, areaInput].forEach((input) => {
  input.addEventListener("input", () => {
    if (input.value !== "" && Number(input.value) < 0) {
      input.value = "";
    }
  });
});


const unitSelect = document.getElementById("unit");
const historyList = document.getElementById("history-list");
const searchInput = document.getElementById("history-search");
const repeatBtn = document.getElementById("repeat-btn");
const favoriteBtn = document.getElementById("favorite-btn");
const printBtn = document.getElementById("print-btn");
const pdfBtn = document.getElementById("pdf-btn");

let calculations = JSON.parse(localStorage.getItem("paintHistory") || "[]");

function saveHistory(item){
  calculations.unshift(item);
  localStorage.setItem("paintHistory", JSON.stringify(calculations.slice(0,50)));
  renderHistory();
}

function renderHistory(){
  const q = (searchInput?.value || "").toLowerCase();
  historyList.innerHTML = calculations.filter(x => JSON.stringify(x).toLowerCase().includes(q))
    .map((x,i)=>`<div class="history-item">${x.date}<br>${x.consumption} ${x.unit} × ${x.area} м² = ${x.result}</div>`).join("");
}

const oldSubmit = form.onsubmit;
form.addEventListener("submit", () => {
  const value = readValue(consumptionInput);
  const area = readValue(areaInput);
  if(value !== null && area !== null){
    saveHistory({
      date:new Date().toLocaleString("ru-RU"),
      consumption:value,
      unit:unitSelect.value,
      area:area,
      result:(value*area).toFixed(2)
    });
  }
});

repeatBtn?.addEventListener("click",()=>{
 const x=calculations[0];
 if(x){consumptionInput.value=x.consumption; areaInput.value=x.area; unitSelect.value=x.unit;}
});

favoriteBtn?.addEventListener("click",()=>{
 localStorage.setItem("favoritePaintCalc", JSON.stringify(calculations[0]||{}));
});

function hasCompletedCalculation() {
  const consumption = readValue(consumptionInput);
  const area = readValue(areaInput);
  const displayedResult = Number(result.textContent);

  return consumption !== null
    && area !== null
    && Number.isFinite(consumption)
    && Number.isFinite(area)
    && consumption >= 0
    && area >= 0
    && Number.isFinite(displayedResult)
    && displayedResult === Number((consumption * area).toFixed(2));
}

function openPrintDialog() {
  if (!hasCompletedCalculation()) {
    alert("Сначала выполните расчёт");
    return;
  }

  const originalTitle = document.title;
  const now = new Date();
  const localDate = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");

  document.title = `PROFiGYM_расчет_краски_${localDate}`;

  const restoreTitle = () => {
    document.title = originalTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };

  window.addEventListener("afterprint", restoreTitle);
  window.print();

  // Резервное восстановление для браузеров без события afterprint.
  window.setTimeout(() => {
    if (document.title !== originalTitle) {
      restoreTitle();
    }
  }, 1000);
}

printBtn?.addEventListener("click", openPrintDialog);
pdfBtn?.addEventListener("click", openPrintDialog);

searchInput?.addEventListener("input",renderHistory);
renderHistory();
