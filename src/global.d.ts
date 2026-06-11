/**
 * Ambient declarations for the legacy global namespace.
 *
 * The migrated client attaches all of its exports to `window` via the
 * `attach()` helper (see `src/_attach.ts`, introduced in phase 5). Until
 * then, this file declares the `window` properties that other code reads
 * at runtime so that TS type-checks correctly.
 *
 * Note: the client tsconfig only includes `src` TypeScript files; the
 * pre-migration `src` JavaScript files are not part of the type-check
 * program. They keep running as classic scripts loaded by `index.html`.
 * This means we do not need to declare bare top-level identifiers here;
 * the new `.ts` files will only `import` from one another.
 */

import type { Constants } from "./constants";
import type { AppState } from "./types";

declare global {
  interface Window {
    /**
     * Legacy alias of `CONSTANTS` exposed by the constants classic script.
     * Kept here for type-checking cross-file references; the value is read
     * at runtime via the classic `<script>` tag in `index.html`.
     */
    LJ_CONSTANTS: Constants;

    /** Set by `state.js` once initial load completes. */
    __jiritoStateReady?: boolean;
    /** Set by `state.js`; returns true while a debounced save is pending. */
    __jiritoHasPendingSave?: () => boolean;
  }
}

export {};
