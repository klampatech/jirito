/**
 * src/main-export-import.ts — Export / Import buttons.
 *
 * Conversion notes from src/main-export-import.js:
 *   - 1:1 translation. `exportData` / `importData` are provided by
 *     `data.ts` (attached via `attach()`).
 */

import { attach } from "./_attach.js";

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

declare function exportData(): void;
declare function importData(file: File): void;

attach({ initExportImport });
