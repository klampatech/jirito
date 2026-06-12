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

import type { Issue, Project, Sprint, SavedFilter, ActivityEntry, TrashEntry, AppState } from "./types";
import { attach } from "./_attach.js";

let SERVER_URL = "";
if (typeof process !== "undefined" && process.env && process.env.VITE_API_URL) {
  SERVER_URL = process.env.VITE_API_URL;
}

// Check if server is reachable (called once on init)
let _serverAvailable: boolean | null = null;

export async function checkServer(): Promise<boolean> {
  if (_serverAvailable !== null) return _serverAvailable;

  try {
    const resp = await fetch(`${SERVER_URL}/api/health`, { method: "GET" });
    _serverAvailable = resp.ok;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[api] Server not reachable, running offline:", message);
    _serverAvailable = false;
  }

  return _serverAvailable;
}

// Generic fetch wrapper with error handling
export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: BodyInit | null;
}

export async function apiRequest<T = unknown>(endpoint: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${SERVER_URL}${endpoint}`;

  // Always include CORS headers
  const defaultHeaders: Record<string, string> = { "Content-Type": "application/json" };

  try {
    const resp = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...((options.headers as Record<string, string> | undefined) || {}) },
    });

    if (!resp.ok) {
      const body = (await resp.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `HTTP ${resp.status}`);
    }

    // Some endpoints return 204 No Content (e.g., DELETE)
    const contentType = resp.headers.get("content-type") || "";
    if (resp.status === 204 || resp.status === 205) {
      return {} as T;
    }

    if (contentType.includes("application/json")) {
      return (await resp.json()) as T;
    }

    return {} as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api] ${options.method || "GET"} ${endpoint}:`, message);
    throw error;
  }
}

// ===== Issues API =====

export async function getIssues(): Promise<Issue[]> {
  const data = await apiRequest<unknown>("/api/issues", { method: "GET" });
  return Array.isArray(data) ? (data as Issue[]) : [];
}

export async function createIssue(issueData: Partial<Issue>): Promise<Issue> {
  return apiRequest<Issue>("/api/issues", { method: "POST", body: JSON.stringify(issueData) });
}

export async function updateIssue(id: number | string, issueData: Partial<Issue>): Promise<Issue> {
  return apiRequest<Issue>(`/api/issues/${id}`, { method: "PUT", body: JSON.stringify(issueData) });
}

export async function deleteIssue(id: number | string): Promise<unknown> {
  return apiRequest(`/api/issues/${id}`, { method: "DELETE" });
}

// ===== Projects API =====

export async function getProjects(): Promise<Project[]> {
  const data = await apiRequest<unknown>("/api/projects", { method: "GET" });
  return Array.isArray(data) ? (data as Project[]) : [];
}

export async function getCurrentProject(): Promise<Project | null> {
  const data = await apiRequest<Project | null>("/api/projects/current", { method: "GET" });
  return data || null;
}

export async function setCurrentProject(projectId: string): Promise<unknown> {
  return apiRequest("/api/projects/current", { method: "PUT", body: JSON.stringify({ projectId }) });
}

export async function createProject(projectData: Partial<Project>): Promise<Project> {
  return apiRequest<Project>("/api/projects", { method: "POST", body: JSON.stringify(projectData) });
}

export async function deleteProject(id: string): Promise<unknown> {
  return apiRequest(`/api/projects/${id}`, { method: "DELETE" });
}

// ===== Sprints API =====

export async function getSprints(projectId: string): Promise<Sprint[]> {
  const data = await apiRequest<unknown>(`/api/projects/${projectId}/sprints`, { method: "GET" });
  return Array.isArray(data) ? (data as Sprint[]) : [];
}

export async function createSprint(sprintData: Partial<Sprint>): Promise<Sprint> {
  return apiRequest<Sprint>("/api/sprints", { method: "POST", body: JSON.stringify(sprintData) });
}

export async function updateSprint(id: string, sprintData: Partial<Sprint>): Promise<Sprint> {
  return apiRequest<Sprint>(`/api/sprints/${id}`, { method: "PUT", body: JSON.stringify(sprintData) });
}

export async function deleteSprint(id: string): Promise<unknown> {
  return apiRequest(`/api/sprints/${id}`, { method: "DELETE" });
}

// ===== Activity API =====

export async function getActivity(): Promise<ActivityEntry[]> {
  const data = await apiRequest<unknown>("/api/activity", { method: "GET" });
  return Array.isArray(data) ? (data as ActivityEntry[]) : [];
}

export async function createActivity(activityData: Partial<ActivityEntry>): Promise<ActivityEntry> {
  return apiRequest<ActivityEntry>("/api/activity", { method: "POST", body: JSON.stringify(activityData) });
}

// ===== Filters API =====

export async function getFilters(): Promise<SavedFilter[]> {
  const data = await apiRequest<unknown>("/api/filters", { method: "GET" });
  return Array.isArray(data) ? (data as SavedFilter[]) : [];
}

export async function createFilter(filterData: Partial<SavedFilter>): Promise<SavedFilter> {
  return apiRequest<SavedFilter>("/api/filters", { method: "POST", body: JSON.stringify(filterData) });
}

export async function updateFilter(id: string, filterData: Partial<SavedFilter>): Promise<SavedFilter> {
  return apiRequest<SavedFilter>(`/api/filters/${id}`, { method: "PUT", body: JSON.stringify(filterData) });
}

export async function deleteFilter(id: string): Promise<unknown> {
  return apiRequest(`/api/filters/${id}`, { method: "DELETE" });
}

// ===== Trash API =====

export async function getTrash(): Promise<TrashEntry[]> {
  const data = await apiRequest<unknown>("/api/trash", { method: "GET" });
  return Array.isArray(data) ? (data as TrashEntry[]) : [];
}

export async function restoreFromTrash(id: string): Promise<unknown> {
  return apiRequest(`/api/trash/${id}/restore`, { method: "POST" });
}

export async function deleteTrashEntry(id: string): Promise<unknown> {
  return apiRequest(`/api/trash/${id}`, { method: "DELETE" });
}

// ===== State Sync (bulk) API =====

/** Fetch all data in one request for initial load */
export async function syncState(): Promise<AppState> {
  return apiRequest<AppState>("/api/state", { method: "GET" });
}

/** Push all data to server in one request */
export async function pushState(state: Partial<AppState>): Promise<unknown> {
  return apiRequest("/api/state", { method: "PUT", body: JSON.stringify(state) });
}

// ===== Public API =====

export interface JiritoApi {
  checkServer(): Promise<boolean>;
  getIssues(): Promise<Issue[]>;
  createIssue(input: Partial<Issue>): Promise<Issue>;
  updateIssue(id: number | string, input: Partial<Issue>): Promise<Issue>;
  deleteIssue(id: number | string): Promise<unknown>;
  getProjects(): Promise<Project[]>;
  getCurrentProject(): Promise<Project | null>;
  setCurrentProject(projectId: string): Promise<unknown>;
  createProject(input: Partial<Project>): Promise<Project>;
  deleteProject(id: string): Promise<unknown>;
  getSprints(projectId: string): Promise<Sprint[]>;
  createSprint(input: Partial<Sprint>): Promise<Sprint>;
  updateSprint(id: string, input: Partial<Sprint>): Promise<Sprint>;
  deleteSprint(id: string): Promise<unknown>;
  getActivity(): Promise<ActivityEntry[]>;
  createActivity(input: Partial<ActivityEntry>): Promise<ActivityEntry>;
  getFilters(): Promise<SavedFilter[]>;
  createFilter(input: Partial<SavedFilter>): Promise<SavedFilter>;
  updateFilter(id: string, input: Partial<SavedFilter>): Promise<SavedFilter>;
  deleteFilter(id: string): Promise<unknown>;
  getTrash(): Promise<TrashEntry[]>;
  restoreFromTrash(id: string): Promise<unknown>;
  deleteTrashEntry(id: string): Promise<unknown>;
  syncState(): Promise<AppState>;
  pushState(state: Partial<AppState>): Promise<unknown>;
}

export const api: JiritoApi = {
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
