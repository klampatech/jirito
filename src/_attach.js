/**
 * `attach()` — bridges ES-module exports to the `window` namespace.
 *
 * The client is in the middle of a JS-to-TS migration. The end-state will
 * replace the implicit global namespace with a real ES-module import graph
 * (see plan-003 §10.1). Until then, the cheapest path that keeps
 * `index.html` working is:
 *
 *   1. Each client `.ts` file `export`s its top-level functions.
 *   2. Each client `.ts` file calls `attach({ ... })` at the bottom.
 *   3. `attach()` writes those exports onto `window` so classic-script
 *      callers (e.g. the not-yet-converted `main.js`) can still find them
 *      by their bare name.
 *
 * Once every file is converted and `index.html` is switched to
 * `<script type="module">`, the `attach()` calls become redundant (the
 * import graph is the source of truth), but they're harmless.
 */
export function attach(ns) {
    if (typeof window === "undefined")
        return;
    for (const [key, value] of Object.entries(ns)) {
        // We assign through `window` (rather than `globalThis`) so that test
        // harnesses using JSDOM see the same shape as the browser.
        window[key] = value;
    }
}
//# sourceMappingURL=_attach.js.map