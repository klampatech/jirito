/**
 * src/api.ts — Frontend API client for the Jirito REST backend.
 *
 * The exported `api` object is the single source of truth for all
 * server-mode operations. When the server is unreachable, callers fall
 * back to the localStorage-backed storage layer (see `src/storage.ts`).
 *
 * The `checkServer()` call is cached in `_serverAvailable` so the
 * health probe runs at most once per page load.
 */
import { attach } from "./_attach.js";
let SERVER_URL = "";
if (typeof process !== "undefined" && process.env && process.env.VITE_API_URL) {
    SERVER_URL = process.env.VITE_API_URL;
}
// Check if server is reachable (called once on init)
let _serverAvailable = null;
export async function checkServer() {
    if (_serverAvailable !== null)
        return _serverAvailable;
    try {
        const resp = await fetch(`${SERVER_URL}/api/health`, { method: "GET" });
        _serverAvailable = resp.ok;
    }
    catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn("[api] Server not reachable, running offline:", message);
        _serverAvailable = false;
    }
    return _serverAvailable;
}
export async function apiRequest(endpoint, options = {}) {
    const url = `${SERVER_URL}${endpoint}`;
    // Always include CORS headers
    const defaultHeaders = { "Content-Type": "application/json" };
    try {
        const resp = await fetch(url, {
            ...options,
            headers: { ...defaultHeaders, ...(options.headers || {}) },
        });
        if (!resp.ok) {
            const body = (await resp.json().catch(() => ({})));
            throw new Error(body.error || `HTTP ${resp.status}`);
        }
        // Some endpoints return 204 No Content (e.g., DELETE)
        const contentType = resp.headers.get("content-type") || "";
        if (resp.status === 204 || resp.status === 205) {
            return {};
        }
        if (contentType.includes("application/json")) {
            return (await resp.json());
        }
        return {};
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[api] ${options.method || "GET"} ${endpoint}:`, message);
        throw error;
    }
}
// ===== Issues API =====
export async function getIssues() {
    const data = await apiRequest("/api/issues", { method: "GET" });
    return Array.isArray(data) ? data : [];
}
export async function createIssue(issueData) {
    return apiRequest("/api/issues", { method: "POST", body: JSON.stringify(issueData) });
}
export async function updateIssue(id, issueData) {
    return apiRequest(`/api/issues/${id}`, { method: "PUT", body: JSON.stringify(issueData) });
}
export async function deleteIssue(id) {
    return apiRequest(`/api/issues/${id}`, { method: "DELETE" });
}
// ===== Projects API =====
export async function getProjects() {
    const data = await apiRequest("/api/projects", { method: "GET" });
    return Array.isArray(data) ? data : [];
}
export async function getCurrentProject() {
    const data = await apiRequest("/api/projects/current", { method: "GET" });
    return data || null;
}
export async function setCurrentProject(projectId) {
    return apiRequest("/api/projects/current", { method: "PUT", body: JSON.stringify({ projectId }) });
}
export async function createProject(projectData) {
    return apiRequest("/api/projects", { method: "POST", body: JSON.stringify(projectData) });
}
export async function deleteProject(id) {
    return apiRequest(`/api/projects/${id}`, { method: "DELETE" });
}
// ===== Sprints API =====
export async function getSprints(projectId) {
    const data = await apiRequest(`/api/projects/${projectId}/sprints`, { method: "GET" });
    return Array.isArray(data) ? data : [];
}
export async function createSprint(sprintData) {
    return apiRequest("/api/sprints", { method: "POST", body: JSON.stringify(sprintData) });
}
export async function updateSprint(id, sprintData) {
    return apiRequest(`/api/sprints/${id}`, { method: "PUT", body: JSON.stringify(sprintData) });
}
export async function deleteSprint(id) {
    return apiRequest(`/api/sprints/${id}`, { method: "DELETE" });
}
// ===== Activity API =====
export async function getActivity() {
    const data = await apiRequest("/api/activity", { method: "GET" });
    return Array.isArray(data) ? data : [];
}
export async function createActivity(activityData) {
    return apiRequest("/api/activity", { method: "POST", body: JSON.stringify(activityData) });
}
// ===== Filters API =====
export async function getFilters() {
    const data = await apiRequest("/api/filters", { method: "GET" });
    return Array.isArray(data) ? data : [];
}
export async function createFilter(filterData) {
    return apiRequest("/api/filters", { method: "POST", body: JSON.stringify(filterData) });
}
export async function updateFilter(id, filterData) {
    return apiRequest(`/api/filters/${id}`, { method: "PUT", body: JSON.stringify(filterData) });
}
export async function deleteFilter(id) {
    return apiRequest(`/api/filters/${id}`, { method: "DELETE" });
}
// ===== Trash API =====
export async function getTrash() {
    const data = await apiRequest("/api/trash", { method: "GET" });
    return Array.isArray(data) ? data : [];
}
export async function restoreFromTrash(id) {
    return apiRequest(`/api/trash/${id}/restore`, { method: "POST" });
}
export async function deleteTrashEntry(id) {
    return apiRequest(`/api/trash/${id}`, { method: "DELETE" });
}
// ===== State Sync (bulk) API =====
/** Fetch all data in one request for initial load */
export async function syncState() {
    return apiRequest("/api/state", { method: "GET" });
}
/** Push all data to server in one request */
export async function pushState(state) {
    return apiRequest("/api/state", { method: "PUT", body: JSON.stringify(state) });
}
export const api = {
    checkServer,
    getIssues,
    createIssue,
    updateIssue,
    deleteIssue,
    getProjects,
    getCurrentProject,
    setCurrentProject,
    createProject,
    deleteProject,
    getSprints,
    createSprint,
    updateSprint,
    deleteSprint,
    getActivity,
    createActivity,
    getFilters,
    createFilter,
    updateFilter,
    deleteFilter,
    getTrash,
    restoreFromTrash,
    deleteTrashEntry,
    syncState,
    pushState,
};
// Make available globally for non-module scripts
attach({ api });
//# sourceMappingURL=api.js.map