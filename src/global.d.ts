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
 */

declare global {
  interface Window {
    /** Set by `main.ts` once initial load completes. */
    __jiritoStateReady?: boolean;
    /** Set by `state.ts`; returns true while a debounced save is pending. */
    __jiritoHasPendingSave?: () => boolean;
  }
}

export {};
