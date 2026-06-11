/**
 * src/main-projects.ts — project creation modal.
 *
 * Conversion notes from src/main-projects.js:
 *   - 1:1 translation. `createProject`, `getProjects`, `showToast` are
 *     provided by `data.ts`, `state.ts`, and `events.ts` respectively.
 */
import { attach } from "./_attach";
export function initProjects() {
    // New project button
    document.getElementById("add-project-btn")?.addEventListener("click", () => {
        document.getElementById("project-modal-overlay") &&
            document.getElementById("project-modal-overlay").style.setProperty("display", "flex");
        document.getElementById("project-name")?.focus();
    });
    document.getElementById("project-modal-close")?.addEventListener("click", () => {
        const overlay = document.getElementById("project-modal-overlay");
        const form = document.getElementById("project-form");
        if (overlay)
            overlay.style.display = "none";
        if (form)
            form.reset();
    });
    document.getElementById("project-cancel")?.addEventListener("click", () => {
        const overlay = document.getElementById("project-modal-overlay");
        const form = document.getElementById("project-form");
        if (overlay)
            overlay.style.display = "none";
        if (form)
            form.reset();
    });
    document.getElementById("project-modal-overlay")?.addEventListener("click", (e) => {
        if (!e.target.closest(".modal")) {
            const overlay = document.getElementById("project-modal-overlay");
            const form = document.getElementById("project-form");
            if (overlay)
                overlay.style.display = "none";
            if (form)
                form.reset();
        }
    });
    document.getElementById("project-form")?.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("project-name")?.value.trim() ?? "";
        const keyRaw = document.getElementById("project-key")?.value.trim() ?? "";
        const key = keyRaw.toUpperCase();
        if (!name || !key)
            return;
        if (getProjects()[key]) {
            showToast("Project key already exists!", "error");
            return;
        }
        createProject(name, key);
        const overlay = document.getElementById("project-modal-overlay");
        const form = document.getElementById("project-form");
        if (overlay)
            overlay.style.display = "none";
        if (form)
            form.reset();
    });
}
attach({ initProjects });
//# sourceMappingURL=main-projects.js.map