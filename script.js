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
