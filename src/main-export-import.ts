/**
 * src/main-export-import.ts — Export / Import buttons.
 *
 * Conversion notes from src/main-export-import.js:
 *   - 1:1 translation. `exportData` / `importData` are imported from
 *     `./data.js`.
 */

import { exportData, importData } from "./data.js";

export function initExportImport(): void {
  document.getElementById("export-btn")?.addEventListener("click", exportData);
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".json";
  importInput.style.display = "none";
  document.body.appendChild(importInput);
  document.getElementById("import-btn")?.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files[0]) {
      importData(target.files[0]);
      target.value = "";
    }
  });
}
