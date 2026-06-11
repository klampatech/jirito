/**
 * src/main-export-import.ts — Export / Import buttons.
 *
 * Conversion notes from src/main-export-import.js:
 *   - 1:1 translation. `exportData` / `importData` are provided by
 *     `data.ts` (attached via `attach()`).
 */
import { attach } from "./_attach";
export function initExportImport() {
    document.getElementById("export-btn")?.addEventListener("click", exportData);
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json";
    importInput.style.display = "none";
    document.body.appendChild(importInput);
    document.getElementById("import-btn")?.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", (e) => {
        const target = e.target;
        if (target.files && target.files[0]) {
            importData(target.files[0]);
            target.value = "";
        }
    });
}
attach({ initExportImport });
//# sourceMappingURL=main-export-import.js.map