import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { cleanupMaterialDatabase } from "./legacy/cleanupMaterialDatabase.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Корневой элемент #root не найден.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void cleanupMaterialDatabase().catch(() => {
  console.warn("Legacy material database cleanup: unexpected failure.");
});
