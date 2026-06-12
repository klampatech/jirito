/**
 * src/main-sprints.ts — sprint management modal + helpers.
 *
 * Conversion notes from src/main-sprints.js:
 *   - 1:1 translation. All sprint-related helpers (`createSprint`,
 *     `renderSprintList`, `populateSprintFilter`, etc.) are attached
 *     to `window` by their respective source files.
 */

import type { Sprint } from "./types";
import { attach } from "./_attach.js";

export function initSprints(): void {
  // Manage sprints button
  document.getElementById("manage-sprints-btn")?.addEventListener("click", () => {
    (document.getElementById("sprint-modal-overlay") as HTMLElement | null) &&
      (document.getElementById("sprint-modal-overlay") as HTMLElement).style.setProperty("display", "flex");
    renderSprintList();
  });
  document.getElementById("sprint-modal-close")?.addEventListener("click", () => {
    const overlay = document.getElementById("sprint-modal-overlay");
    if (overlay) overlay.style.display = "none";
  });
  document.getElementById("sprint-modal-overlay")?.addEventListener("click", (e: Event) => {
    if (!(e.target as HTMLElement).closest(".modal")) {
      const overlay = document.getElementById("sprint-modal-overlay");
      if (overlay) overlay.style.display = "none";
    }
  });
  document.getElementById("sprint-form")?.addEventListener("submit", (e: Event) => {
    e.preventDefault();
    const name = (document.getElementById("sprint-name") as HTMLInputElement | null)?.value.trim() ?? "";
    const start = (document.getElementById("sprint-start") as HTMLInputElement | null)?.value ?? "";
    const end = (document.getElementById("sprint-end") as HTMLInputElement | null)?.value ?? "";
    if (!name || !start || !end) return;
    createSprint(name, start, end);
    (document.getElementById("sprint-name") as HTMLInputElement | null) &&
      ((document.getElementById("sprint-name") as HTMLInputElement).value = "");
    (document.getElementById("sprint-start") as HTMLInputElement | null) &&
      ((document.getElementById("sprint-start") as HTMLInputElement).value = "");
    (document.getElementById("sprint-end") as HTMLInputElement | null) &&
      ((document.getElementById("sprint-end") as HTMLInputElement).value = "");
    renderSprintList();
    populateSprintFilter();
    populateSprintSelect();
    updateSprintBar();
    // Show sprint bar if active sprint now exists
    const newActive = getActiveSprint();
    if (newActive) {
      const sprintBar = document.getElementById("sprint-bar");
      if (sprintBar) {
        sprintBar.style.display = "block";
        document.getElementById("sprint-bar-name")!.textContent = newActive.name;
        updateSprintProgressBar(newActive);
      }
    }
    showToast("Sprint created", "success");
  });
}

declare function createSprint(name: string, startDate?: string, endDate?: string): Sprint;
declare function renderSprintList(): void;
declare function populateSprintFilter(): void;
declare function populateSprintSelect(): void;
declare function updateSprintBar(): void;
declare function getActiveSprint(): Sprint | null;
declare function updateSprintProgressBar(activeSprint: Sprint): void;
declare function showToast(message: string, kind?: "info" | "success" | "error"): void;

attach({ initSprints });
