/**
 * src/main-theme.ts — theme toggle (light/dark).
 *
 * Conversion notes from src/main-theme.js:
 *   - 1:1 translation. Uses `lucideIcon` imported from `./utils.js`.
 *   - Theme is persisted in `localStorage` under `jirito-theme` (legacy key).
 *   - Respects the system `prefers-color-scheme: dark` on first visit.
 */
import { lucideIcon } from "./utils.js";
export function initTheme() {
    const themeToggle = document.getElementById("theme-toggle");
    if (!themeToggle)
        return;
    const savedTheme = localStorage.getItem("jirito-theme");
    if (savedTheme) {
        document.documentElement.setAttribute("data-theme", savedTheme);
        themeToggle.innerHTML = savedTheme === "dark" ? lucideIcon("Sun", { class: "icon" }) : lucideIcon("Moon", { class: "icon" });
    }
    else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.setAttribute("data-theme", "dark");
        themeToggle.innerHTML = lucideIcon("Sun", { class: "icon" });
    }
    themeToggle.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("jirito-theme", next);
        themeToggle.innerHTML = next === "dark" ? lucideIcon("Sun", { class: "icon" }) : lucideIcon("Moon", { class: "icon" });
    });
}
//# sourceMappingURL=main-theme.js.map