/**
 * src/api.js — Frontend API client for Jirito.
 * Provides a clean interface to the backend REST API with automatic fallback
 * detection (server available vs. offline).
 */

var SERVER_URL = '';
if (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) {
  SERVER_URL = process.env.VITE_API_URL;
}

// Check if server is reachable (called once on init)
let _serverAvailable = null;

async function checkServer() {
  if (_serverAvailable !== null) return _serverAvailable;

  try {
    const resp = await fetch(`${SERVER_URL}/api/health`, { method: 'GET' });
    _serverAvailable = resp.ok;
  } catch (e) {
    console.warn('[api] Server not reachable, running offline:', e.message);
    _serverAvailable = false;
  }

  return _serverAvailable;
}

// Generic fetch wrapper with error handling
async function apiRequest(endpoint, options = {}) {
  const url = `${SERVER_URL}${endpoint}`;

  // Always include CORS headers
  const defaultHeaders = { 'Content-Type': 'application/json' };

  try {
    const resp = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers || {}) },
    });

    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${resp.status}`);
    }

    // Some endpoints return 204 No Content (e.g., DELETE)
    const contentType = resp.headers.get('content-type') || '';
    if (resp.status === 204 || resp.status === 205) {
      return {};
    }

    if (contentType.includes('application/json')) {
      return await resp.json();
    }

    return {};
  } catch (error) {
    console.error(`[api] ${options.method || 'GET'} ${endpoint}:`, error.message);
    throw error;
  }
}

// ===== Issues API =====

async function getIssues() {
  const data = await apiRequest('/api/issues', { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function createIssue(issueData) {
  return apiRequest('/api/issues', { method: 'POST', body: JSON.stringify(issueData) });
}

async function updateIssue(id, issueData) {
  return apiRequest(`/api/issues/${id}`, { method: 'PUT', body: JSON.stringify(issueData) });
}

async function deleteIssue(id) {
  return apiRequest(`/api/issues/${id}`, { method: 'DELETE' });
}

// ===== Projects API =====

async function getProjects() {
  const data = await apiRequest('/api/projects', { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function getCurrentProject() {
  const data = await apiRequest('/api/projects/current', { method: 'GET' });
  return data || null;
}

async function setCurrentProject(projectId) {
  return apiRequest('/api/projects/current', { method: 'PUT', body: JSON.stringify({ projectId }) });
}

async function createProject(projectData) {
  return apiRequest('/api/projects', { method: 'POST', body: JSON.stringify(projectData) });
}

async function deleteProject(id) {
  return apiRequest(`/api/projects/${id}`, { method: 'DELETE' });
}

// ===== Sprints API =====

async function getSprints(projectId) {
  const data = await apiRequest(`/api/projects/${projectId}/sprints`, { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function createSprint(sprintData) {
  return apiRequest('/api/sprints', { method: 'POST', body: JSON.stringify(sprintData) });
}

async function updateSprint(id, sprintData) {
  return apiRequest(`/api/sprints/${id}`, { method: 'PUT', body: JSON.stringify(sprintData) });
}

async function deleteSprint(id) {
  return apiRequest(`/api/sprints/${id}`, { method: 'DELETE' });
}

// ===== Activity API =====

async function getActivity() {
  const data = await apiRequest('/api/activity', { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function createActivity(activityData) {
  return apiRequest('/api/activity', { method: 'POST', body: JSON.stringify(activityData) });
}

// ===== Filters API =====

async function getFilters() {
  const data = await apiRequest('/api/filters', { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function createFilter(filterData) {
  return apiRequest('/api/filters', { method: 'POST', body: JSON.stringify(filterData) });
}

async function updateFilter(id, filterData) {
  return apiRequest(`/api/filters/${id}`, { method: 'PUT', body: JSON.stringify(filterData) });
}

async function deleteFilter(id) {
  return apiRequest(`/api/filters/${id}`, { method: 'DELETE' });
}

// ===== Trash API =====

async function getTrash() {
  const data = await apiRequest('/api/trash', { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

async function restoreFromTrash(id) {
  return apiRequest(`/api/trash/${id}/restore`, { method: 'POST' });
}

async function deleteTrashEntry(id) {
  return apiRequest(`/api/trash/${id}`, { method: 'DELETE' });
}

// ===== State Sync (bulk) API =====

/** Fetch all data in one request for initial load */
async function syncState() {
  return apiRequest('/api/state', { method: 'GET' });
}

/** Push all data to server in one request */
async function pushState(state) {
  return apiRequest('/api/state', { method: 'PUT', body: JSON.stringify(state) });
}

// ===== Public API =====

const api = {
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
if (typeof window !== 'undefined') {
  window.api = api;
}
