/**
 * Server-side re-export of the shared client types.
 *
 * The server has its own tsconfig whose `include` is `server` TypeScript
 * files, so it cannot directly import from `../src/...` without going
 * through this shim. The import is `import type`-only, so the runtime
 * output is empty -- no extra file lands in `dist/server/` from this.
 */

export type {
  Issue,
  HistoryEntry,
  Dependency,
  Project,
  Comment,
  Sprint,
  SavedFilter,
  ActivityEntry,
  TrashEntry,
  CustomColumn,
  AppState,
  UserSettings,
  StorageLayer,
  StorageType,
  IssueStatus,
  IssueType,
  IssuePriority,
} from "../src/types.js";

export type { Constants } from "../src/constants.js";
