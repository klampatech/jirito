/**
 * Ambient declarations for the cross-cutting window-level signals.
 *
 * `window.__jiritoStateReady` is the test contract: tests wait for this
 * flag before running page.evaluate() against the app. It is set by
 * `src/main.ts` after the full UI is initialised.
 *
 * `window.__jiritoHasPendingSave` lets the `beforeunload` handler in
 * `src/main.ts` ask the storage layer whether a debounced save is
 * actually queued, so it can flush only when needed (preserving fresher
 * server state from other tabs / test runs).
 *
 * The previous migration kept an `LJ_CONSTANTS` window augmentation
 * for the classic-script shim. Now that all consumers are real ES
 * modules, the shim is no longer needed and the augmentation is
 * dropped.
 *
 * The state/read accessors (`getIssues`, `getCurrentProject`,
 * `switchProject`) are re-exposed for the Playwright test contract
 * only. Specs in `tests/*.spec.mjs` call them from inside
 * `page.evaluate()` callbacks, which run in a fresh global scope with
 * no ES-module imports. They are assigned at the bottom of
 * `src/state.ts` and `src/render.ts` respectively. Real consumers
 * must use real `import` statements.
 *
 * Note: the runtime values are typed in the client project
 * (`tsconfig.client.json`) where `Issue` is available. The unit-test
 * project (`tsconfig.tests.json`) doesn't include the DOM lib and
 * shouldn't transitively pull in client source just for ambient
 * window typings, so the shapes here are intentionally permissive.
 */

declare global {
  interface Window {
    /** Set by `main.ts` once initial load completes. */
    __jiritoStateReady?: boolean;
    /** Set by `state.ts`; returns true while a debounced save is pending. */
    __jiritoHasPendingSave?: () => boolean;
    /** Test contract: reads the in-memory issue list. Set in `state.ts`. */
    getIssues?: () => ReadonlyArray<unknown>;
    /** Test contract: reads the current project key. Set in `state.ts`. */
    getCurrentProject?: () => string;
    /** Test contract: switches the active project. Set in `render.ts`. */
    switchProject?: (key: string) => void;
  }
}

export {};
