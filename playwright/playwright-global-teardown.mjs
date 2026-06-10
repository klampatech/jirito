// playwright-global-teardown.mjs
// Global test teardown: stops backend and static file servers
import { getServers } from './playwright-shared.mjs';

export default async function globalTeardown() {
  const { staticServer, backendProc } = getServers();
  if (staticServer) {
    await new Promise((resolve) => staticServer.close(resolve));
  }
  if (backendProc) {
    backendProc.kill();
  }
}
