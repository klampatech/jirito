/**
 * src/main-column-config.ts — column configuration modal.
 *
 * Conversion notes from src/main-column-config.js:
 *   - 1:1 translation. `renderColumnConfig`, `addCustomColumn`,
 *     `updateCustomColumn`, `getCustomColumns`, `getCurrentProject`,
 *     `showToast` are imported from `./render.ts` / `./state.ts` /
 *     `./events.ts`.
 */
import { addCustomColumn, saveState, setCustomColumns, updateCustomColumn } from "./state.js";
import { renderBoard, renderColumnConfig } from "./render.js";
import { showToast } from "./events.js";
export function initColumnConfig() {
    document.getElementById("column-config-btn")?.addEventListener("click", () => {
        document.getElementById("column-config-overlay") &&
            document.getElementById("column-config-overlay").style.setProperty("display", "flex");
        renderColumnConfig();
    });
    document.getElementById("column-config-close")?.addEventListener("click", () => {
        const overlay = document.getElementById("column-config-overlay");
        if (overlay)
            overlay.style.display = "none";
    });
    document.getElementById("column-config-overlay")?.addEventListener("click", (e) => {
        if (!e.target.closest(".modal")) {
            const overlay = document.getElementById("column-config-overlay");
            if (overlay)
                overlay.style.display = "none";
        }
    });
    // Reset columns to defaults
    document.getElementById("reset-columns-btn")?.addEventListener("click", () => {
        if (confirm("Reset columns to defaults? Custom columns will be removed.")) {
            setCustomColumns([]); // reset to defaults (the custom array is global; clearing it triggers getEffectiveColumns fallback)
            saveState();
            renderColumnConfig();
            renderBoard();
            showToast("Columns reset to defaults", "success");
        }
    });
    document.getElementById("add-column-btn")?.addEventListener("click", () => {
        const nameEl = document.getElementById("new-column-name");
        const colorEl = document.getElementById("new-column-color");
        const statusEl = document.getElementById("new-column-status");
        const name = nameEl?.value.trim() ?? "";
        const color = colorEl?.value ?? "";
        const status = statusEl?.value ?? "";
        if (!name)
            return;
        const id = addCustomColumn(name, color);
        if (status) {
            updateCustomColumn(id, { status });
        }
        if (nameEl)
            nameEl.value = "";
        renderColumnConfig();
        renderBoard();
        showToast("Column added", "success");
    });
}
//# sourceMappingURL=main-column-config.js.map