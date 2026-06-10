// ===== Storage Abstraction Layer =====
// Provides a unified interface for data persistence.
// Supports two modes:
//   1. Server mode: Data synced via REST API to the Node.js backend (SQLite)
//   2. Offline mode: Data persisted to localStorage (no server)
//
// Usage:
//   storage.initStorage()  — call once on app startup
//   storage.getStorageData() — get all data
//   storage.saveStorageData(data) — save all data
//   storage.getStorageType()  — returns 'server' or 'offline'

(function () {
  // Detect server URL — use relative path for same-origin, or env override
  var SERVER_URL = '';
  if (typeof process !== 'undefined' && process.env && process.env.VITE_API_URL) {
    SERVER_URL = process.env.VITE_API_URL;
  } else if (typeof window !== 'undefined') {
    // In browser: use relative path (same origin as the page)
    SERVER_URL = '';
  }

  var API_BASE = SERVER_URL ? SERVER_URL + '/api' : '/api';

  // In-memory state (synced from server or localStorage)
  var _state = {
    issues: [],
    comments: {},
    projects: {
      default: {
        name: 'Project Alpha',
        key: 'PROJ',
        icon: '\uD83D\uDE80',
        color: '#0052CC',
        description: '',
        issues: []
      }
    },
    currentProject: 'default',
    savedFilters: [],
    activity: [],
    issueCounter: 1,
    trash: [],
    sprints: {},
    columns: [],
    customColumns: []
  };

  // Detected storage mode: 'server' or 'offline'
  var _storageType = 'offline';

  // Check if server is reachable
  function _checkServer() {
    return fetch(API_BASE + '/health', { method: 'GET' })
      .then(function (resp) {
        return resp.ok;
      })
      .catch(function () {
        return false;
      });
  }

  // ===== Public API =====

  /**
   * Initialize the storage layer.
   * Detects whether the server is available and sets the storage mode.
   * Then loads data from the appropriate source.
   */
  function initStorage() {
    return _checkServer().then(function (serverOk) {
      if (serverOk) {
        _storageType = 'server';
        console.log('[storage] Using server backend');
        return _loadFromServer();
      } else {
        _storageType = 'offline';
        console.log('[storage] Server unavailable, using localStorage');
        return _loadFromLocalStorage();
      }
    }).then(function () {
      return _state;
    });
  }

  /**
   * Get the current storage type ('server' or 'offline')
   */
  function getStorageType() {
    return _storageType;
  }

  /**
   * Get all data from the storage layer.
   */
  function getStorageData() {
    // Return a copy with activityLog alias for compatibility
    var result = Object.assign({}, _state);
    result.activityLog = result.activity || [];
    return result;
  }

  /**
   * Save all data to the storage layer.
   */
  function saveStorageData(data) {
    if (_storageType === 'server') {
      return _saveToServer(data);
    } else {
      _saveToLocalStorage(data);
      return Promise.resolve();
    }
  }

  // ===== Server Backend =====

  function _apiRequest(endpoint, options) {
    options = options || {};
    var headers = options.headers || {};
    headers['Content-Type'] = 'application/json';
    options.headers = headers;

    return fetch(API_BASE + endpoint, options).then(function (resp) {
      if (resp.status === 204 || resp.status === 205) {
        return {};
      }
      var contentType = resp.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') !== -1) {
        return resp.json().then(function (data) {
          if (!resp.ok) {
            throw new Error(data.error || 'HTTP ' + resp.status);
          }
          return data;
        });
      }
      if (!resp.ok) {
        throw new Error('HTTP ' + resp.status);
      }
      return {};
    });
  }

  function _loadFromServer() {
    return _apiRequest('/state', { method: 'GET' }).then(function (data) {
      console.log('[storage] _loadFromServer received issues:', JSON.stringify(data.issues?.map(i => ({id:i.id, dueDate:i.dueDate}))));
      // Map trash from server format to frontend format
      var trashData = [];
      if (data.trash && Array.isArray(data.trash)) {
        trashData = data.trash.map(function (t) {
          return { issues: t.issues || [], date: new Date(t.date) };
        });
      }
      _state = {
        issues: data.issues || [],
        comments: data.comments || {},
        projects: data.projects || _state.projects,
        currentProject: data.currentProject || 'default',
        savedFilters: data.savedFilters || [],
        activity: data.activityLog || [],
        issueCounter: data.issueCounter || 1,
        trash: trashData,
        sprints: data.sprints || {},
        columns: data.columns || [],
        customColumns: Array.isArray(data.customColumns) ? data.customColumns : []
      };
    });
  }

  function _saveToServer(data) {
    // Save sprints and custom columns separately (they're stored in localStorage in the current app)
    var stateToSave = {
      issues: data.issues,
      projects: data.projects,
      currentProject: data.currentProject,
      savedFilters: data.filters || [],
      activityLog: data.activity ? data.activity.map(function (a) {
        return { icon: a.icon, text: a.text, time: a.time };
      }) : [],
      issueCounter: data.issueCounter,
      trash: data.trash ? data.trash.map(function (t) {
        return { issues: t.issues || [], date: t.date.toISOString ? t.date.toISOString() : t.date };
      }) : [],
      sprints: data.sprints || {},
      customColumns: Array.isArray(data.customColumns) ? data.customColumns : []
    };
    // Send as 'columns' for server compatibility (server expects 'columns' key)
    // Also keep 'customColumns' for localStorage mirror
    if (Array.isArray(data.customColumns) && data.customColumns.length > 0) {
      stateToSave.columns = data.customColumns;
    } else if (data.columns && data.columns.length > 0) {
      stateToSave.columns = data.columns;
    }
    // Mirror to localStorage as a cache. This keeps the offline fallback
    // warm and lets test suites (and any same-origin reader) observe the
    // latest state without an extra round-trip to the server.
    try {
      _writeLocalMirror(stateToSave);
    } catch (e) {
      console.warn('[storage] Failed to mirror to localStorage:', e);
    }
    return _apiRequest('/state', { method: 'PUT', body: JSON.stringify(stateToSave) });
  }

  /**
   * Write the current state to localStorage under the canonical
   * "jirito-state" key. Used as a cache mirror in server mode and
   * as the primary store in offline mode. Kept tolerant of partial data
   * (missing fields fall back to safe defaults).
   */
  function _writeLocalMirror(data) {
    if (typeof localStorage === 'undefined') return;
    var stateToSave = {
      issues: data.issues || [],
      projects: data.projects || {},
      currentProject: data.currentProject || 'default',
      filters: data.filters || data.savedFilters || [],
      activity: data.activity || data.activityLog || [],
      activityLog: data.activityLog || data.activity || [],
      issueCounter: data.issueCounter || 1,
      trash: data.trash || [],
      sprints: data.sprints || {},
      columns: data.columns || [],
      customColumns: Array.isArray(data.customColumns) ? data.customColumns : []
    };
    localStorage.setItem('jirito-state', JSON.stringify(stateToSave));
  }

  // ===== localStorage Fallback =====

  function _loadFromLocalStorage() {
    try {
      var saved = localStorage.getItem('jirito-state');
      if (saved) {
        var parsed = JSON.parse(saved);
        _state = _extend(_state, parsed);
      }
    } catch (e) {
      console.error('[storage] Failed to load from localStorage:', e);
    }
    return Promise.resolve();
  }

  function _saveToLocalStorage(data) {
    try {
      _writeLocalMirror(data);
    } catch (e) {
      console.error('[storage] Failed to save to localStorage:', e);
    }
  }

  // ===== Helpers =====

  function _extend(target, source) {
    for (var key in source) {
      if (source.hasOwnProperty(key)) {
        target[key] = source[key];
      }
    }
    return target;
  }

  // ===== Expose globally =====
  if (typeof window !== 'undefined') {
    window.storage = {
      initStorage: initStorage,
      getStorageType: getStorageType,
      getStorageData: getStorageData,
      saveStorageData: saveStorageData
    };
  }
})();
