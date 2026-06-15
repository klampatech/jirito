/**
 * src/main-sidebar-toggle.ts — sidebar collapse/expand.
 *
 * Conversion notes from src/main-sidebar-toggle.js:
 *   - 1:1 translation. The legacy code uses `style.left = '0' | '260px'`
 *     to position the toggle button; preserved verbatim.
 */
export function initSidebarToggle() {
    document.getElementById("sidebar-toggle")?.addEventListener("click", () => {
        const wrapper = document.getElementById("sidebar-wrapper");
        const toggle = document.getElementById("sidebar-toggle");
        if (!wrapper || !toggle)
            return;
        const isCollapsed = wrapper.classList.toggle("collapsed");
        // Move toggle button position: at sidebar edge when open, at screen left when collapsed
        toggle.style.left = isCollapsed ? "0" : "260px";
    });
}
//# sourceMappingURL=main-sidebar-toggle.js.map