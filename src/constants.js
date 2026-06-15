/**
 * Typed constants used throughout the client.
 *
 * Each consumer imports `CONSTANTS` from this module. The legacy
 * `src/constants.js` file and the `window.LJ_CONSTANTS` shim are no
 * longer needed (the `attach()` indirection was removed in plan §10.1).
 */
export const CONSTANTS = {
    // State management
    ISSUE_COUNTER_START: 100,
    ACTIVITY_LOG_MAX: 50,
    TRASH_RETENTION_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
    DUPLICATE_WORD_OVERLAP: 0.6,
    // Calendar
    CALENDAR_MAX_ROWS: 6, // 6 weeks = 42 days
    // History
    HISTORY_MAX_ENTRIES: 200,
    // Debounce
    SAVE_STATE_DEBOUNCE_MS: 300,
    DEP_SEARCH_DEBOUNCE_MS: 200,
    // Validation
    MAX_TITLE_LENGTH: 500,
    MAX_PROJECT_KEY_LENGTH: 5,
    PROJECT_KEY_REGEX: /^[a-zA-Z0-9_-]+$/,
    // Valid values
    VALID_STATUSES: ["todo", "inprogress", "review", "done"],
    VALID_ISSUE_TYPES: ["story", "bug", "task", "epic"],
    VALID_PRIORITIES: ["high", "medium", "low"],
    // URL schemes allowed in markdown links
    ALLOWED_URL_SCHEMES: ["http:", "https:", "mailto:", "tel:"],
};
//# sourceMappingURL=constants.js.map