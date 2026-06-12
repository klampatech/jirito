/**
 * src/main-column-config.ts — column configuration modal.
 *
 * Conversion notes from src/main-column-config.js:
 *   - 1:1 translation. `renderColumnConfig`, `addCustomColumn`,
 *     `updateCustomColumn`, `getCustomColumns`, `getCurrentProject`,
 *     `showToast` come from `render.ts` / `state.ts` / `events.ts`.
 */

import type { CustomColumn } from "./types";
import { attach } from "./_attach.js";

export function initColumnConfig(): void {
  document.getElementById("column-config-btn")?.addEventListener("click", () => {
    (document.getElementById("column-config-overlay") as HTMLElement | null) &&
      (document.getElementById("column-config-overlay") as HTMLElement).style.setProperty("display", "flex");
    renderColumnConfig();
  });
  document.getElementById("column-config-close")?.addEventListener("click", () => {
    const overlay = document.getElementById("column-config-overlay");
    if (overlay) overlay.style.display = "none";
  });
  document.getElementById("column-config-overlay")?.addEventListener("click", (e: Event) => {
    if (!(e.target as HTMLElement).closest(".modal")) {
      const overlay = document.getElementById("column-config-overlay");
      if (overlay) overlay.style.display = "none";
    }
  });
  // Reset columns to defaults
  document.getElementById("reset-columns-btn")?.addEventListener("click", () => {
    if (confirm("Reset columns to defaults? Custom columns will be removed.")) {
      delete getCustomColumns()[getCurrentProject()];
      saveState();
      renderColumnConfig();
      renderBoard();
      showToast("Columns reset to defaults", "success");
    }
  });
  document.getElementById("add-column-btn")?.addEventListener("click", () => {
    const nameEl = document.getElementById("new-column-name") as HTMLInputElement | null;
    const colorEl = document.getElementById("new-column-color") as HTMLInputElement | null;
    const statusEl = document.getElementById("new-column-status") as HTMLSelectElement | null;
    const name = nameEl?.value.trim() ?? "";
    const color = colorEl?.value ?? "";
    const status = statusEl?.value ?? "";
    if (!name) return;
    const id = addCustomColumn(name, color);
    if (status) {
      updateCustomColumn(id, { status });
    }
    if (nameEl) nameEl.value = "";
    renderColumnConfig();
    renderBoard();
    showToast("Column added", "success");
  });
}

declare function renderColumnConfig(): void;
declare function addCustomColumn(name: string, color?: string): string;
declare function updateCustomColumn(id: string, updates: Partial<CustomColumn>): void;
declare function getCustomColumns(): Record<string, CustomColumn[]>;
declare function getCurrentProject(): string;
declare function saveState(): Promise<void>;
declare function renderBoard(): void;
declare function showToast(message: string, kind?: "info" | "success" | "error"): void;

attach({ initColumnConfig });
