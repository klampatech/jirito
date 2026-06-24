/**
 * Canonical data model shared by client and server.
 *
 * The client uses these shapes via `import type` (erased at runtime).
 * The server uses the same types via `import type` from
 * `server/_types-shim.ts`, which re-exports them.
 */

// ----- Enumerations -----

export type IssueStatus = "todo" | "inprogress" | "review" | "done";
export type IssueType = "story" | "bug" | "task" | "epic";
export type IssuePriority = "high" | "medium" | "low";

// ----- Domain entities -----

export interface HistoryEntry {
  field: string;
  from: string;
  to: string;
  /** ISO 8601 date string */
  date: string;
  user: string;
}

export interface Dependency {
  targetId: string | number;
  type: "blocks" | "relates-to";
  created?: string;
}

export interface Issue {
  /**
   * The id is stored as a number in sql.js and most client code, but the
   * server returns string ids over the wire when they were inserted via
   * non-numeric strategies (UUID, etc.). Treat as a flexible identifier.
   */
  id: number | string;
  title: string;
  /** Legacy alias for description. Older issues use `desc`. */
  desc?: string;
  description?: string;
  type: IssueType;
  priority: IssuePriority;
  /** Server stores one of: "todo" | "inprogress" | "review" | "done" | "trash". */
  status: IssueStatus | "trash" | string;
  assignee?: string;
  reporter?: string;
  projectId?: string;
  /** Server-side column name. */
  sprintId?: string | null;
  /** Client-side column name (alias of sprintId). */
  sprint?: string | null;
  dueDate?: string | null;
  labels: string[];
  storyPoints?: number | null;
  rank?: number;
  parentIssueId?: string | null;
  customColumnId?: string | null;
  prUrl?: string;
  prMerged?: boolean;
  history?: HistoryEntry[];
  dependencies?: Dependency[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  key: string;
  icon?: string;
  color?: string;
  description?: string;
  /** Server returns string ids; client may hydrate with full Issue objects. */
  issues?: Array<Issue | string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Comment {
  id: string;
  issueId: string | number;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  name: string;
  startDate?: string;
  endDate?: string;
  active?: boolean;
  archived?: boolean;
  projectId?: string;
  status?: string;
  goal?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SavedFilter {
  id?: string;
  name: string;
  query: string | Record<string, unknown>;
  sortOrder?: number;
  type?: string;
  priority?: string;
  assignee?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ActivityEntry {
  id?: string;
  icon: string;
  text: string;
  /** Time may be a Date (client) or ISO string (server / storage round-trip). */
  time: Date | string;
  issueId?: string | number;
  action?: string;
  details?: string | Record<string, unknown>;
}

export interface TrashEntry {
  id?: string;
  type: string;
  /** `data` is a JSON-encoded string when stored in the trash table. */
  data: string | Record<string, unknown>;
  date: Date | string;
  /** Client-side variant that re-hydrates issues. */
  issues?: Issue[];
}

export interface CustomColumn {
  id: string;
  name: string;
  color: string;
  /** null = unassigned (the column is not tied to a specific status). */
  status: string | null;
  order: number;
}

// ----- Aggregates -----

/**
 * The full state object that `storage` round-trips between client and server.
 * Field names match the existing JSON shape 1:1; renaming any of these is a
 * breaking change.
 */
export interface AppState {
  issues: Issue[];
  comments: Record<string, Comment[]>;
  projects: Record<string, Project>;
  currentProject: string;
  savedFilters: SavedFilter[];
  activity: ActivityEntry[];
  /** Alias of `activity`. Kept for backwards compatibility. */
  activityLog: ActivityEntry[];
  issueCounter: number;
  trash: TrashEntry[];
  sprints: Record<string, Sprint>;
  /** Server-side column name. */
  columns: CustomColumn[];
  /** Client-side column name (alias of columns). */
  customColumns: CustomColumn[];
}

export interface UserSettings {
  theme: "light" | "dark";
  onboardingSeen: boolean;
  listviewSort: string;
  listviewDir: "asc" | "desc";
}

// ----- Storage interface -----

export type StorageType = "server" | "offline";

export interface StorageLayer {
  initStorage(): Promise<AppState>;
  getStorageType(): StorageType;
  getStorageData(): AppState;
  saveStorageData(data: Partial<AppState>): Promise<void>;
}
