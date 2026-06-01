// Shared state between global setup and teardown
let staticServer = null;
let backendProc = null;

export function setServers(server, proc) {
  staticServer = server;
  backendProc = proc;
}

export function getServers() {
  return { staticServer, backendProc };
}
