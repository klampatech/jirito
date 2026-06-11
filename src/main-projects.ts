/**
 * src/main-projects.ts — project creation modal.
 *
 * Conversion notes from src/main-projects.js:
 *   - 1:1 translation. `createProject`, `getProjects`, `showToast` are
 *     provided by `data.ts`, `state.ts`, and `events.ts` respectively.
 */

import type { Project } from "./types";
import { attach } from "./_attach";

export function initProjects(): void {
  // New project button
  document.getElementById("add-project-btn")?.addEventListener("click", () => {
    (document.getElementById("project-modal-overlay") as HTMLElement | null) &&
      (document.getElementById("project-modal-overlay") as HTMLElement).style.setProperty("display", "flex");
    document.getElementById("project-name")?.focus();
  });
  document.getElementById("project-modal-close")?.addEventListener("click", () => {
    const overlay = document.getElementById("project-modal-overlay");
    const form = document.getElementById("project-form") as HTMLFormElement | null;
    if (overlay) overlay.style.display = "none";
    if (form) form.reset();
  });
  document.getElementById("project-cancel")?.addEventListener("click", () => {
    const overlay = document.getElementById("project-modal-overlay");
    const form = document.getElementById("project-form") as HTMLFormElement | null;
    if (overlay) overlay.style.display = "none";
    if (form) form.reset();
  });
  document.getElementById("project-modal-overlay")?.addEventListener("click", (e: Event) => {
    if (!(e.target as HTMLElement).closest(".modal")) {
      const overlay = document.getElementById("project-modal-overlay");
      const form = document.getElementById("project-form") as HTMLFormElement | null;
      if (overlay) overlay.style.display = "none";
      if (form) form.reset();
    }
  });
  document.getElementById("project-form")?.addEventListener("submit", (e: Event) => {
    e.preventDefault();
    const name = (document.getElementById("project-name") as HTMLInputElement | null)?.value.trim() ?? "";
    const keyRaw = (document.getElementById("project-key") as HTMLInputElement | null)?.value.trim() ?? "";
    const key = keyRaw.toUpperCase();
    if (!name || !key) return;
    if (getProjects()[key]) {
      showToast("Project key already exists!", "error");
      return;
    }
    createProject(name, key);
    const overlay = document.getElementById("project-modal-overlay");
    const form = document.getElementById("project-form") as HTMLFormElement | null;
    if (overlay) overlay.style.display = "none";
    if (form) form.reset();
  });
}

declare function createProject(name: string, key: string): string | null;
declare function getProjects(): Record<string, Project>;
declare function showToast(message: string, kind?: "info" | "success" | "error"): void;

attach({ initProjects });
