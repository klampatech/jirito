// playwright-global-setup.mjs
// Global test setup: starts backend (port 3001) and static file server (port 8080)
import { spawn, execSync } from 'child_process';
import { createServer, request } from 'http';
import { appendFileSync, readFile } from 'fs';
import { resolve, join, dirname, extname, sep } from 'path';
import { fileURLToPath } from 'url';
import { setServers } from './playwright-shared.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
let staticServer;
let backendProc;
const rootDir = resolve(__dirname, '..');
const LOG_FILE = '/Users/kylelampa/Development/jirito/playwright-test-setup.log';
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(LOG_FILE, line); } catch {} // silent in case of errors
  try { process.stderr.write(line); } catch {} // silent in case of errors
}

function serveStatic(req, res) {
  // Proxy API requests to the backend server
  if (req.url.startsWith('/api/')) {
    const backendUrl = 'http://127.0.0.1:3001' + req.url;
    const proxyReq = request(backendUrl, {
      method: req.method,
      headers: {
        ...req.headers,
        host: '127.0.0.1:3001',
        'x-forwarded-host': '127.0.0.1:8080',
      },
    }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Backend unavailable' }));
    });
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.pipe(proxyReq);
    } else {
      proxyReq.end();
    }
    return;
  }

  let url = req.url === '/' ? '/index.html' : req.url;
  url = url.split('?')[0];
  const filePath = join(rootDir, url);
  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function killOnPort(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (pids) {
      for (const pid of pids.split('\n').filter(Boolean)) {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore', windowsHide: true });
      }
    }
  } catch {
    // ignore - no processes on this port or lsof not available
  }
}

export default async function globalSetup() {
  try {
  log('Starting global setup...');
  
  // Kill any existing servers
  killOnPort(8080);
  killOnPort(3001);
  log('Killed existing processes');

  // Wait for ports to be free
  for (let i = 0; i < 40; i++) {
    try {
      await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(500) });
    } catch {
      break; // port 8080 is free
    }
    await new Promise(r => setTimeout(r, 250));
  }
  log('Ports free, starting servers...');

  // Start backend server on port 3001. Per phase 2, the server source of
  // truth is server/index.ts. The committed server/*.js files are
  // legacy artifacts (still tracked for now, but no longer run).
  // `tsx` is the project's dev dep (per phase 1) for running TS files
  // directly, so we use it here instead of the emit-then-node dance.
  backendProc = spawn('npx', ['tsx', 'server/index.ts'], {
    cwd: rootDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, SERVER_PORT: '3001' },
  });
  backendProc.stdout.on('data', d => log('[backend] ' + d.toString().trim()));
  backendProc.stderr.on('data', d => log('[backend err] ' + d.toString().trim()));

  // Wait for backend to be ready
  let backendReady = false;
  for (let i = 0; i < 40; i++) {
    try {
      const resp = await fetch('http://127.0.0.1:3001/api/health');
      if (resp.ok) { backendReady = true; break; }
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 250));
  }
  log('Backend ready: ' + backendReady);
  
  if (!backendReady) {
    log('Backend failed to start, killing and throwing');
    if (backendProc) backendProc.kill();
    throw new Error('Backend server failed to start');
  }

  // Start static file server on port 8080
  staticServer = createServer(serveStatic);
  await new Promise((resolve, reject) => {
    staticServer.listen(8080, '127.0.0.1', () => resolve());
    staticServer.on('error', reject);
  });
  log('Static server started on 8080');

  // Share server references with teardown
  setServers(staticServer, backendProc);

  // Verify servers are responding
  for (let i = 0; i < 20; i++) {
    try {
      const resp = await fetch('http://127.0.0.1:8080/');
      if (resp.ok) break;
    } catch {
      // server not ready yet
    }
    await new Promise(r => setTimeout(r, 250));
  }

  const resp = await fetch('http://127.0.0.1:8080/');
  if (!resp.ok) {
    throw new Error('Static server failed to start');
  }
  // Seed default issues so tests.spec.mjs tests have data to work with
  const seedIssues = [
    { title: 'Design login page mockup', description: 'Create wireframes for the new login flow', type: 'story', priority: 'high', status: 'todo', storyPoints: 5, sprint: '', assignee: 'Alice', dueDate: '2026-05-15', rank: 0 },
    { title: 'Fix auth token refresh bug', description: 'Tokens expire too early on mobile', type: 'bug', priority: 'high', status: 'inprogress', storyPoints: 3, sprint: '', assignee: 'Bob', dueDate: '2026-05-01', rank: 1 },
    { title: 'Set up CI/CD pipeline', description: 'GitHub Actions for staging and prod', type: 'task', priority: 'medium', status: 'todo', storyPoints: 8, sprint: '', assignee: 'Charlie', dueDate: '2026-06-01', rank: 2 },
    { title: 'Write API documentation', description: 'OpenAPI spec for all endpoints', type: 'story', priority: 'medium', status: 'inreview', storyPoints: 5, sprint: '', assignee: 'Alice', dueDate: '', rank: 3 },
    { title: 'Update dependencies', description: 'Bump all npm packages to latest', type: 'task', priority: 'low', status: 'done', storyPoints: 2, sprint: '', assignee: 'Bob', dueDate: '2026-04-20', rank: 4 },
  ];
  for (const issue of seedIssues) {
    try {
      await fetch('http://127.0.0.1:3001/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(issue),
      });
    } catch {
      // Server might not be running
    }
  }
  log('Global setup complete');
  } catch (e) {
    log('Global setup ERROR: ' + e.message);
    log('Stack: ' + e.stack);
    throw e;
  }
}
