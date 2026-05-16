import http from 'http';

import { initDb, closeDb, saveDb } from './db/index.js';
import { initTables } from './db/init.js';

// Routes - using dynamic imports for ESM
import issuesRouter from './routes/issues.js';
import projectsRouter from './routes/projects.js';
import sprintsRouter from './routes/sprints.js';
import activityRouter from './routes/activity.js';
import filtersRouter from './routes/filters.js';
import trashRouter from './routes/trash.js';
import { getState, setState } from './routes/state.js';

const PORT = process.env.SERVER_PORT || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

// Parse JSON body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': CLIENT_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

// Simple router
async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': CLIENT_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Health check
  if (pathname === '/api/health') {
    sendJson(res, 200, { status: 'ok', timestamp: new Date().toISOString() });
    return;
  }

  // Route to handlers
  try {
    // Issues routes
    if (pathname === '/api/issues' && method === 'GET') {
      return issuesRouter.getAll(req, res, url);
    }
    if (pathname === '/api/issues' && method === 'POST') {
      return issuesRouter.create(req, res, await parseBody(req));
    }
    if (pathname.match(/^\/api\/issues\/[^/]+$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      return issuesRouter.update(req, res, id, await parseBody(req));
    }
    if (pathname.match(/^\/api\/issues\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      return issuesRouter.remove(req, res, id);
    }

    // Projects routes
    if (pathname === '/api/projects' && method === 'GET') {
      return projectsRouter.getAll(req, res);
    }
    if (pathname === '/api/projects/current' && method === 'GET') {
      return projectsRouter.getCurrent(req, res);
    }
    if (pathname === '/api/projects/current' && method === 'PUT') {
      return projectsRouter.setCurrent(req, res, await parseBody(req));
    }
    if (pathname === '/api/projects' && method === 'POST') {
      return projectsRouter.create(req, res, await parseBody(req));
    }
    if (pathname.match(/^\/api\/projects\/[^/]+$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      return projectsRouter.remove(req, res, id);
    }

    // Sprints routes
    if (pathname.match(/^\/api\/projects\/([^/]+)\/sprints$/) && method === 'GET') {
      const projectId = pathname.split('/')[3];
      return sprintsRouter.getByProject(req, res, projectId);
    }
    if (pathname === '/api/sprints' && method === 'POST') {
      return sprintsRouter.create(req, res, await parseBody(req));
    }
    if (pathname.match(/^\/api\/sprints\/([^/]+)$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      return sprintsRouter.update(req, res, id, await parseBody(req));
    }
    if (pathname.match(/^\/api\/sprints\/([^/]+)$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      return sprintsRouter.remove(req, res, id);
    }

    // Activity routes
    if (pathname === '/api/activity' && method === 'GET') {
      return activityRouter.getAll(req, res);
    }
    if (pathname === '/api/activity' && method === 'POST') {
      return activityRouter.create(req, res, await parseBody(req));
    }

    // Filters routes
    if (pathname === '/api/filters' && method === 'GET') {
      return filtersRouter.getAll(req, res);
    }
    if (pathname === '/api/filters' && method === 'POST') {
      return filtersRouter.create(req, res, await parseBody(req));
    }
    if (pathname.match(/^\/api\/filters\/([^/]+)$/) && method === 'PUT') {
      const id = pathname.split('/')[3];
      return filtersRouter.update(req, res, id, await parseBody(req));
    }
    if (pathname.match(/^\/api\/filters\/([^/]+)$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      return filtersRouter.remove(req, res, id);
    }

    // Trash routes
    if (pathname === '/api/trash' && method === 'GET') {
      return trashRouter.getAll(req, res);
    }
    if (pathname.match(/^\/api\/trash\/([^/]+)\/restore$/) && method === 'POST') {
      const id = pathname.split('/')[3];
      return trashRouter.restore(req, res, id);
    }
    if (pathname.match(/^\/api\/trash\/([^/]+)$/) && method === 'DELETE') {
      const id = pathname.split('/')[3];
      return trashRouter.remove(req, res, id);
    }

    // State sync endpoint - return all data for initial load
    if (pathname === '/api/state' && method === 'GET') {
      return getState(req, res);
    }
    if (pathname === '/api/state' && method === 'PUT') {
      return setState(req, res, await parseBody(req));
    }

    // Not found
    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Route error:', error);
    sendJson(res, 500, { error: error.message });
  }
}

async function start() {
  try {
    // Initialize database
    await initDb();
    initTables();

    // Create HTTP server
    const server = http.createServer(async (req, res) => {
      try {
        await route(req, res);
      } catch (error) {
        console.error('Request error:', error);
        sendJson(res, 500, { error: 'Internal server error' });
      }
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      saveDb();
      closeDb();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      saveDb();
      closeDb();
      process.exit(0);
    });

    server.listen(PORT, () => {
      console.log(`Jirito server running at http://localhost:${PORT}`);
      console.log(`Database: ${process.env.JIRITO_DB_PATH || './jirito.db'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();