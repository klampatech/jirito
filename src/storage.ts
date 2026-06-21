/**
 * src/storage.ts — Unified storage layer.
 *
 * Detects at startup whether the backend REST API is reachable:
 *   - Server mode: data round-trips through `/api/*` and is mirrored to
 *     localStorage for fast re-hydration and offline fallback.
 *   - Offline mode: data lives entirely in localStorage.
 *
 * The four exported functions (`initStorage`, `getStorageType`,
 * `getStorageData`, `saveStorageData`) match the `StorageLayer`
 * interface declared in `src/types.ts`.
 */

import type { AppState, StorageLayer, StorageType } from "./types";

// Detect server URL — use relative path for same-origin, or env override
let SERVER_URL = "";
if (typeof process !== "undefined" && process.env && process.env.VITE_API_URL) {
  SERVER_URL = process.env.VITE_API_URL;
} else if (typeof window !== "undefined") {
  // In browser: use relative path (same origin as the page)
  SERVER_URL = "";
}

const API_BASE = SERVER_URL ? SERVER_URL + "/api" : "/api";

/** A fresh, empty AppState. The `default` project is always seeded so
 *  the UI has something to render on first run. */
function defaultState(): AppState {
  return {
    issues: [],
    comments: {},
    projects: {
      default: {
        id: "default",
        name: "Project Alpha",
        key: "PROJ",
        icon: "\uD83D\uDE80",
        color: "#0052CC",
        description: "",
        issues: [],
      },
    },
    currentProject: "default",
    savedFilters: [],
    activity: [],
    activityLog: [],
    issueCounter: 1,
    trash: [],
    sprints: {},
    columns: [],
    customColumns: [],
  };
}

// In-memory state (synced from server or localStorage)
let _state: AppState = defaultState();

// Detected storage mode: 'server' or 'offline'
let _storageType: StorageType = "offline";

// Check if server is reachable
function _checkServer(): Promise<boolean> {
  return fetch(API_BASE + "/health", { method: "GET" })
    .then((resp) => resp.ok)
    .catch(() => false);
}

// ===== Public API =====

/**
 * Initialize the storage layer.
 * Detects whether the server is available and sets the storage mode.
 * Then loads data from the appropriate source.
 */
export async function initStorage(): Promise<AppState> {
  const serverOk = await _checkServer();
  if (serverOk) {
    _storageType = "server";
    console.log("[storage] Using server backend");
    await _loadFromServer();
  } else {
    _storageType = "offline";
    console.log("[storage] Server unavailable, using localStorage");
    await _loadFromLocalStorage();
  }
  return _state;
}

/**
 * Get the current storage type ('server' or 'offline').
 */
export function getStorageType(): StorageType {
  return _storageType;
}

/**
 * Get all data from the storage layer. The returned object is the
 * in-memory state; callers should treat it as read-only.
 */
export function getStorageData(): AppState {
  // Return a copy with activityLog alias for compatibility. The original
  // `.js` did `Object.assign({}, _state)` + `result.activityLog = ...`
  // — we just build a fresh object literal so the types are explicit.
  return {
    ..._state,
    activityLog: _state.activity || [],
  };
}

/**
 * Shape accepted by `saveStorageData`. The legacy client used the key
 * `filters` instead of `savedFilters`; we keep that alias live for
 * backward compatibility with `state.js`.
 */
export interface SaveInput {
  issues?: AppState["issues"];
  projects?: AppState["projects"];
  currentProject?: AppState["currentProject"];
  /** Legacy alias of `savedFilters`. */
  filters?: AppState["savedFilters"];
  savedFilters?: AppState["savedFilters"];
  activity?: AppState["activity"];
  activityLog?: AppState["activityLog"];
  issueCounter?: AppState["issueCounter"];
  trash?: AppState["trash"];
  sprints?: AppState["sprints"];
  columns?: AppState["columns"];
  customColumns?: AppState["customColumns"];
  /** Persisted default column name/color overrides (keyed by column id). */
  _defaultColumnOverrides?: Record<string, { name?: string; color?: string }>;
}

/**
 * Save all data to the storage layer.
 */
export async function saveStorageData(data: Partial<SaveInput>): Promise<void> {
  if (_storageType === "server") {
    await _saveToServer(data);
  } else {
    _saveToLocalStorage(data);
  }
}

// ===== Server Backend =====

interface ApiOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
}

function _apiRequest(endpoint: string, options: ApiOptions = {}): Promise<unknown> {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  headers["Content-Type"] = "application/json";

  return fetch(API_BASE + endpoint, { ...options, headers }).then((resp) => {
    if (resp.status === 204 || resp.status === 205) {
      return {};
    }
    const contentType = resp.headers.get("content-type") || "";
    if (contentType.indexOf("application/json") !== -1) {
      return resp.json().then((data: { error?: string } & Record<string, unknown>) => {
        if (!resp.ok) {
          throw new Error(data.error || "HTTP " + resp.status);
        }
        return data as unknown;
      });
    }
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    return {};
  });
}

async function _loadFromServer(): Promise<void> {
  const data = (await _apiRequest("/state", { method: "GET" })) as Partial<AppState> & {
    activityLog?: AppState["activity"];
    columns?: AppState["columns"];
    customColumns?: AppState["customColumns"];
  };

  // Map trash from server format to frontend format. The server stores
  // each row as a `data` JSON blob; the client expands `data.issues` to
  // a top-level `issues` field for the trash UI.
  const trashData: AppState["trash"] = [];
  if (data.trash && Array.isArray(data.trash)) {
    for (const t of data.trash) {
      const issues = (t as { issues?: AppState["issues"] }).issues || [];
      trashData.push({ ...t, issues });
    }
  }

  _state = {
    issues: data.issues || [],
    comments: data.comments || {},
    projects: data.projects || _state.projects,
    currentProject: data.currentProject || "default",
    savedFilters: data.savedFilters || [],
    activity: data.activityLog || [],
    activityLog: data.activityLog || [],
    issueCounter: data.issueCounter || 1,
    trash: trashData,
    sprints: data.sprints || {},
    columns: data.columns || [],
    customColumns: Array.isArray(data.customColumns) ? data.customColumns : [],
  };
}

function _saveToServer(data: Partial<SaveInput>): Promise<unknown> {
  // Save sprints and custom columns separately (they're stored in
  // localStorage in the current app). Build a server-shaped payload.
  const stateToSave: Record<string, unknown> = {
    issues: data.issues,
    projects: data.projects,
    currentProject: data.currentProject,
    savedFilters: data.filters || [],
    activityLog: data.activity
      ? data.activity.map((a) => ({ icon: a.icon, text: a.text, time: a.time }))
      : [],
    issueCounter: data.issueCounter,
    trash: data.trash
      ? data.trash.map((t) => ({
          issues: t.issues || [],
          date: t.date instanceof Date ? t.date.toISOString() : String(t.date),
        }))
      : [],
    sprints: data.sprints || {},
    customColumns: Array.isArray(data.customColumns) ? data.customColumns : [],
  };
  // Send as 'columns' for server compatibility (server expects 'columns' key).
  if (Array.isArray(data.customColumns) && data.customColumns.length > 0) {
    stateToSave.columns = data.customColumns;
  } else if (data.columns && data.columns.length > 0) {
    stateToSave.columns = data.columns;
  }
  // Persist default column overrides alongside custom columns.
  if (data._defaultColumnOverrides) {
    stateToSave._defaultColumnOverrides = data._defaultColumnOverrides;
  }
  // Mirror to localStorage as a cache. This keeps the offline fallback
  // warm and lets test suites (and any same-origin reader) observe the
  // latest state without an extra round-trip to the server.
  try {
    _writeLocalMirror(stateToSave as Partial<AppState>);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[storage] Failed to mirror to localStorage:", message);
  }
  return _apiRequest("/state", { method: "PUT", body: JSON.stringify(stateToSave) });
}

/**
 * Write the current state to localStorage under the canonical
 * "jirito-state" key. Used as a cache mirror in server mode and
 * as the primary store in offline mode. Kept tolerant of partial data
 * (missing fields fall back to safe defaults).
 */
function _writeLocalMirror(data: Partial<SaveInput>): void {
  if (typeof localStorage === "undefined") return;
  const stateToSave = {
    issues: data.issues || [],
    projects: data.projects || {},
    currentProject: data.currentProject || "default",
    filters: data.filters || data.savedFilters || [],
    activity: data.activity || data.activityLog || [],
    activityLog: data.activityLog || data.activity || [],
    issueCounter: data.issueCounter || 1,
    trash: data.trash || [],
    sprints: data.sprints || {},
    columns: data.columns || [],
    customColumns: Array.isArray(data.customColumns) ? data.customColumns : [],
    _defaultColumnOverrides: data._defaultColumnOverrides || {},
  };
  localStorage.setItem("jirito-state", JSON.stringify(stateToSave));
}

// ===== localStorage Fallback =====

async function _loadFromLocalStorage(): Promise<void> {
  try {
    const saved = localStorage.getItem("jirito-state");
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<AppState>;
      _state = { ..._state, ...parsed };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[storage] Failed to load from localStorage:", message);
  }
}

function _saveToLocalStorage(data: Partial<AppState>): void {
  try {
    _writeLocalMirror(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[storage] Failed to save to localStorage:", message);
  }
}

// ===== Public API object =====

export const storage: StorageLayer = {
  initStorage,
  getStorageType,
  getStorageData,
  saveStorageData,
};

// Expose storage on window for the storage-browser test contract
// (tests/storage-browser.spec.mjs calls window.storage.initStorage(), etc.).
if (typeof window !== "undefined") {
  (window as unknown as { storage: StorageLayer }).storage = storage;
}
