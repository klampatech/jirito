// playwright-global-teardown.mjs
// Global test teardown: stops backend and static file servers, and removes
// the isolated test DB so stale fixtures don't accumulate across runs.
import { unlinkSync, existsSync } from 'fs';
import { getServers } from './playwright-shared.mjs';

export default async function globalTeardown() {
  const { staticServer, backendProc, testDbPath } = getServers();
  if (staticServer) {
    await new Promise((resolve) => staticServer.close(resolve));
  }
  if (backendProc) {
    // Kill the whole process group, not just the parent (npm exec). The
    // children (sh, tsx, node) outlive the parent if we don't, and they
    // share the `tsx server/index.ts` binary path with jirito.service —
    // so systemd's KillMode=mixed would later mistake them for
    // jirito.service's children and SIGKILL them on the next restart,
    // producing confusing journalctl noise. detached: true in setup
    // creates the group; here we negative-pgid to signal the whole tree.
    try {
      if (backendProc.pid) {
        process.kill(-backendProc.pid, 'SIGTERM');
      }
    } catch {
      // already gone
    }
    // Hard-kill anything that ignored SIGTERM (5s grace).
    await new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      backendProc.once('exit', finish);
      setTimeout(() => {
        try {
          if (backendProc.pid) process.kill(-backendProc.pid, 'SIGKILL');
        } catch {}
        finish();
      }, 5000);
    });
  }
  // Remove the test DB. Best-effort — the file may already be gone if the
  // test server crashed mid-run, or the user may have pointed us at a path
  // they want to keep (e.g. for debugging a failed test). Swallow errors.
  if (testDbPath) {
    try {
      if (existsSync(testDbPath)) {
        unlinkSync(testDbPath);
      }
    } catch {
      // silent — see comment above
    }
  }
}
