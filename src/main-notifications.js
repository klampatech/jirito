/**
 * src/main-notifications.ts — overdue-issues notification dropdown.
 *
 * Conversion notes from src/main-notifications.js:
 *   - 1:1 translation. `openDetailPanel` is provided by `events.ts`
 *     (attached via `attach()`).
 *   - The dropdown is positioned with fixed coordinates relative to
 *     the bell icon; legacy `style.top` / `style.right` assignments
 *     preserved.
 */
import { attach } from "./_attach";
export function updateNotificationDropdown() {
    const body = document.getElementById("notification-dropdown-body");
    if (!body)
        return;
    const overdue = getIssues().filter((i) => isOverdue(i.dueDate, i.status));
    if (overdue.length === 0) {
        body.innerHTML = '<div class="notification-empty">No overdue issues</div>';
        return;
    }
    body.innerHTML = overdue
        .map((i) => `
    <div class="notification-item" data-id="${i.id}">
      <span class="notification-key">${generateIssueKey(getProjectKey(), i.id)}</span>
      <span class="notification-title">${escapeHtml(i.title)}</span>
      <span class="notification-date">Due: ${formatDate(i.dueDate)}</span>
    </div>
  `)
        .join("");
    body.querySelectorAll(".notification-item").forEach((item) => {
        item.addEventListener("click", () => {
            const id = item.dataset.id;
            if (id)
                openDetailPanel(parseInt(id, 10));
            const dropdown = document.getElementById("notification-dropdown");
            if (dropdown)
                dropdown.style.display = "none";
        });
    });
}
export function initNotifications() {
    const bell = document.getElementById("notification-bell");
    const dropdown = document.getElementById("notification-dropdown");
    if (!bell || !dropdown)
        return;
    bell.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dropdown.style.display === "block") {
            dropdown.style.display = "none";
        }
        else {
            updateNotificationDropdown();
            dropdown.style.display = "block";
            // Position dropdown under the bell icon using fixed positioning
            const bellRect = bell.getBoundingClientRect();
            dropdown.style.top = bellRect.bottom + 4 + "px";
            dropdown.style.right = window.innerWidth - bellRect.right + "px";
            dropdown.style.left = "auto";
        }
    });
    document.addEventListener("click", (e) => {
        if (!bell.contains(e.target)) {
            dropdown.style.display = "none";
        }
    });
}
attach({ initNotifications, updateNotificationDropdown });
//# sourceMappingURL=main-notifications.js.map