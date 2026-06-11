/**
 * src/utils.ts — DOM/formatting/icon helpers used by every other client module.
 *
 * Conversion notes (from src/utils.js):
 *   - `LJ_CONSTANTS.X` references are replaced with `CONSTANTS.X` from
 *     `./constants`. The legacy `window.LJ_CONSTANTS` shim is still in
 *     `index.html` (loaded by `src/constants.js`) until phase 5.
 *   - `lucideIcon`'s `attrs` type tightened to `Record<string, string>`;
 *     callers passed booleans/numbers, which `Object.entries` then
 *     stringified. We keep the same surface by coercing at the boundary.
 *   - `getCalendarDays` is typed via the `CalendarDay` shape added to
 *     `src/types.ts` (none yet — the original used an inferred shape; we
 *     add a local type to keep the file self-contained).
 */
import { CONSTANTS } from "./constants";
import { attach } from "./_attach";
const { CALENDAR_MAX_ROWS, ALLOWED_URL_SCHEMES } = CONSTANTS;
// ===== Markdown Parser (lightweight) =====
export function isSafeUrl(url) {
    // Strip leading whitespace and newlines
    const trimmed = url.trim().replace(/^\s*\n\s*/g, "");
    // Block empty URLs
    if (!trimmed)
        return false;
    // Block javascript:, data:, vbscript: and other dangerous schemes
    const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase() + ":";
        return ALLOWED_URL_SCHEMES.includes(scheme);
    }
    // Relative URLs (no scheme) are safe
    return true;
}
export function parseMarkdown(text) {
    if (!text)
        return "";
    let html = escapeHtml(text);
    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    // Italic
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    // Strikethrough
    html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    // Links (with XSS-safe URL filtering)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, url) => {
        if (isSafeUrl(url)) {
            return '<a href="' + url + '" target="_blank" rel="noopener">' + label + "</a>";
        }
        // Unsafe URL — render as plain text, drop the link
        return label;
    });
    // Unordered lists
    html = html.replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/s, "<ul>$1</ul>");
    // Headers
    html = html.replace(/^###\s+(.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^##\s+(.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^#\s+(.+)$/gm, "<h2>$1</h2>");
    // Blockquotes
    html = html.replace(/^&gt;\s+(.+)$/gm, "<blockquote>$1</blockquote>");
    // Line breaks
    html = html.replace(/\n/g, "<br>");
    // Clean up extra <br> around block elements
    html = html.replace(/<br><(h[2-4]|ul|ol|li|pre|blockquote)/g, "<$1");
    html = html.replace(/<\/(h[2-4]|ul|ol|li|pre|blockquote)><br>/g, "</$1>");
    return html;
}
export function renderMarkdown(text) {
    if (!text)
        return "";
    return parseMarkdown(text);
}
// ===== Calendar Helpers =====
/**
 * Returns a 6-row (42-day) calendar grid for the given month, padded
 * with leading/trailing days from the adjacent months. The `dueIssues`
 * array on each day is populated by reading the current `getIssues()`
 * snapshot — kept as a deferred dependency to match the legacy shape
 * (this function is called from `render.js` after `state` is loaded).
 */
export function getCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0=Sun
    const days = [];
    // Previous month padding
    for (let i = startDay - 1; i >= 0; i--) {
        const d = new Date(year, month, -i);
        days.push({ date: d, isCurrentMonth: false, dueIssues: [] });
    }
    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dueIssues = getIssues().filter((i) => i.dueDate === dateStr && i.status !== "done");
        days.push({ date: new Date(year, month, d), isCurrentMonth: true, dateStr, dueIssues });
    }
    // Next month padding
    const remaining = CALENDAR_MAX_ROWS * 7 - days.length;
    for (let d = 1; d <= remaining; d++) {
        const date = new Date(year, month + 1, d);
        days.push({ date, isCurrentMonth: false, dueIssues: [] });
    }
    return days;
}
export function getMonthName(month) {
    return new Date(2000, month, 1).toLocaleString("en-US", { month: "long" });
}
// ===== Icon Helper (Phosphor Icons) =====
/**
 * Returns the HTML for a Phosphor-style icon.
 *
 * `attrs` is rendered as `key="value"` pairs on the `<i>` element; values
 * are coerced to strings at the call site (the original `.js` accepted
 * booleans/numbers via `String(v)`). Callers passed `string` only.
 */
export function lucideIcon(name, attrs = {}) {
    // Convert PascalCase icon name to kebab-case CSS class (e.g. "Plus" -> "plus", "FileText" -> "file-text")
    const kebabName = name
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
        .toLowerCase();
    const className = "ph ph-" + kebabName;
    const iconAttrs = Object.entries(attrs)
        .map(([k, v]) => k + '="' + v + '"')
        .join(" ");
    return '<i class="' + className + '" ' + iconAttrs + "></i>";
}
export function escapeHtml(str) {
    if (!str && str !== 0)
        return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}
export function truncateDesc(str, maxChars) {
    if (!str && str !== 0)
        return "";
    const plain = String(str);
    if (plain.length <= maxChars)
        return escapeHtml(plain);
    return escapeHtml(plain.slice(0, maxChars)) + "…";
}
export function isOverdue(dueDate, status) {
    if (!dueDate || status === "done")
        return false;
    return new Date(dueDate) < new Date(new Date().toDateString());
}
export function formatDate(dateStr) {
    if (!dateStr)
        return "";
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())
        return "Today";
    if (d.toDateString() === tomorrow.toDateString())
        return "Tomorrow";
    if (d.toDateString() === yesterday.toDateString())
        return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
export function timeAgo(date) {
    const d = date instanceof Date ? date : new Date(date);
    const seconds = Math.floor((new Date().getTime() - d.getTime()) / 1000);
    if (seconds < 0)
        return "In the future";
    if (seconds < 60)
        return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
export function generateIssueKey(projectKey, id) {
    return `${projectKey.toUpperCase()}-${id}`;
}
export function getProjectKey() {
    return getProjects()[getCurrentProject()]?.key || "PROJ";
}
export function getFilteredIssues() {
    // The four input elements are <input> or <select>; cast accordingly so
    // `.value` is well-typed. The original `.js` was loose.
    const searchEl = document.getElementById("search-input");
    const typeEl = document.getElementById("filter-type");
    const priorityEl = document.getElementById("filter-priority");
    const assigneeEl = document.getElementById("filter-assignee");
    const search = searchEl?.value.toLowerCase() || "";
    const typeFilter = typeEl?.value || "all";
    const priorityFilter = priorityEl?.value || "all";
    const assigneeFilter = assigneeEl?.value || "all";
    return getIssues().filter((i) => {
        if (typeFilter !== "all" && i.type !== typeFilter)
            return false;
        if (priorityFilter !== "all" && i.priority !== priorityFilter)
            return false;
        if (assigneeFilter !== "all" && i.assignee !== assigneeFilter)
            return false;
        if (search &&
            !i.title.toLowerCase().includes(search) &&
            !(i.desc || "").toLowerCase().includes(search)) {
            return false;
        }
        return true;
    });
}
export function getAllLabels() {
    const labels = new Set();
    getIssues().forEach((i) => {
        if (i.labels)
            i.labels.forEach((l) => labels.add(l));
    });
    return [...labels].sort();
}
// ===== Sprint UI Helpers =====
export function populateSprintFilter() {
    const select = document.getElementById("sprint-filter");
    if (!select)
        return;
    const currentVal = select.value;
    select.innerHTML = '<option value="all">All Sprints</option>';
    Object.values(getSprints()).forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        select.appendChild(opt);
    });
    select.value = currentVal || "all";
}
export function populateSprintSelect() {
    const select = document.getElementById("issue-sprint");
    if (!select)
        return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">No Sprint</option>';
    Object.values(getSprints()).forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = s.name;
        select.appendChild(opt);
    });
    select.value = currentVal || "";
}
export function updateSprintBar() {
    const sprintFilter = document.getElementById("sprint-filter");
    const manageBtn = document.getElementById("manage-sprints-btn");
    const sprintBar = document.getElementById("sprint-bar");
    if (!sprintFilter || !manageBtn)
        return;
    const sprints = getSprints();
    const sprintCount = Object.keys(sprints).length;
    // Always show the manage button (users need to create sprints)
    manageBtn.style.display = "inline-flex";
    if (sprintCount > 0) {
        sprintFilter.style.display = "inline-block";
        populateSprintFilter();
        // Show sprint bar if a sprint is active
        const activeSprint = getActiveSprint();
        if (activeSprint) {
            sprintBar.style.display = "block";
            document.getElementById("sprint-bar-name").textContent = activeSprint.name;
            updateSprintProgressBar(activeSprint);
        }
        else {
            sprintBar.style.display = "none";
        }
    }
    else {
        sprintFilter.style.display = "none";
        sprintBar.style.display = "none";
    }
}
export function updateSprintProgressBar(activeSprint) {
    const fill = document.getElementById("sprint-progress-fill");
    const text = document.getElementById("sprint-progress-text");
    if (!fill || !text)
        return;
    const sprintIssues = getIssues().filter((i) => i.sprint === activeSprint.id);
    const totalSP = sprintIssues.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const doneSP = sprintIssues
        .filter((i) => i.status === "done")
        .reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    const pct = totalSP > 0 ? Math.round((doneSP / totalSP) * 100) : 0;
    fill.style.width = pct + "%";
    text.textContent = doneSP + "/" + totalSP + " points";
}
export function updateSprintProgress() {
    const activeSprint = getActiveSprint();
    if (activeSprint) {
        updateSprintProgressBar(activeSprint);
    }
}
// Attach every public export to `window` for legacy classic-script callers.
// Phase 5 will switch `index.html` to `<script type="module">` and these
// `attach()` calls become redundant (the import graph takes over).
attach({
    // markdown
    isSafeUrl,
    parseMarkdown,
    renderMarkdown,
    // calendar
    getCalendarDays,
    getMonthName,
    // icons
    lucideIcon,
    // formatting
    escapeHtml,
    truncateDesc,
    isOverdue,
    formatDate,
    timeAgo,
    // keys
    generateIssueKey,
    getProjectKey,
    // filters
    getFilteredIssues,
    getAllLabels,
    // sprint UI
    populateSprintFilter,
    populateSprintSelect,
    updateSprintBar,
    updateSprintProgressBar,
    updateSprintProgress,
});
//# sourceMappingURL=utils.js.map