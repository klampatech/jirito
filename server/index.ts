/**
 * Jirito HTTP server.
 *
 * Provides REST endpoints for the SQLite-backed persistence layer. The
 * server is started with `tsx server/index.ts` (or the built
 * `dist/server/server/index.js`).
 */

import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { initDb, closeDb, saveDb } from "./db/index.js";
import { initTables, migrateTables } from "./db/init.js";

// Routes
import issuesRouter from "./routes/issues.js";
import projectsRouter from "./routes/projects.js";
import sprintsRouter from "./routes/sprints.js";
import activityRouter from "./routes/activity.js";
import filtersRouter from "./routes/filters.js";
import trashRouter from "./routes/trash.js";
import commentsRouter from "./routes/comments.js";
import { getState, setState } from "./routes/state.js";
import { importData, exportData } from "./routes/import-export.js";
import { serveStaticFile } from "./static.js";
import { parseBody, sendJson } from "./routes/_shared.js";

const PORT = Number(process.env.SERVER_PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

/** Match a path against a regex and return the first capture group. */
function matchId(pathname: string, pattern: RegExp): string | null {
  const m = pathname.match(pattern);
  return m ? m[1] : null;
}

/**
 * Top-level router. Returns `true` if a route matched and handled the
 * request, `false` if no route matched (caller should send 404).
 */
async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  pathname: string,
  method: string
): Promise<boolean> {
  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": CLIENT_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  // Health check
  if (pathname === "/api/health" && method === "GET") {
    sendJson(res, 200, {
      status: "ok",
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // Issues
  if (pathname === "/api/issues" && method === "GET") {
    await issuesRouter.getAll(req, res, url);
    return true;
  }
  const issuesId = matchId(pathname, /^\/api\/issues\/([^/]+)$/);
  if (issuesId) {
    if (method === "GET") {
      await issuesRouter.getById(req, res, issuesId);
      return true;
    }
    if (method === "PUT") {
      await issuesRouter.update(req, res, issuesId, await parseBody(req));
      return true;
    }
    if (method === "DELETE") {
      await issuesRouter.remove(req, res, issuesId);
      return true;
    }
  }
  if (pathname === "/api/issues" && method === "POST") {
    await issuesRouter.create(req, res, await parseBody(req));
    return true;
  }

  // Projects
  if (pathname === "/api/projects" && method === "GET") {
    await projectsRouter.getAll(req, res);
    return true;
  }
  if (pathname === "/api/projects/current" && method === "GET") {
    await projectsRouter.getCurrent(req, res);
    return true;
  }
  if (pathname === "/api/projects/current" && method === "PUT") {
    await projectsRouter.setCurrent(req, res, await parseBody(req));
    return true;
  }
  if (pathname === "/api/projects" && method === "POST") {
    await projectsRouter.create(req, res, await parseBody(req));
    return true;
  }
  const projectsId = matchId(pathname, /^\/api\/projects\/([^/]+)$/);
  if (projectsId && method === "DELETE") {
    await projectsRouter.remove(req, res, projectsId);
    return true;
  }

  // Sprints
  const projectSprintsMatch = pathname.match(
    /^\/api\/projects\/([^/]+)\/sprints$/
  );
  if (projectSprintsMatch && method === "GET") {
    await sprintsRouter.getByProject(
      req,
      res,
      projectSprintsMatch[1]
    );
    return true;
  }
  if (pathname === "/api/sprints" && method === "POST") {
    await sprintsRouter.create(req, res, await parseBody(req));
    return true;
  }
  const sprintId = matchId(pathname, /^\/api\/sprints\/([^/]+)$/);
  if (sprintId) {
    if (method === "PUT") {
      await sprintsRouter.update(req, res, sprintId, await parseBody(req));
      return true;
    }
    if (method === "DELETE") {
      await sprintsRouter.remove(req, res, sprintId);
      return true;
    }
  }

  // Activity
  if (pathname === "/api/activity" && method === "GET") {
    await activityRouter.getAll(req, res);
    return true;
  }
  if (pathname === "/api/activity" && method === "POST") {
    await activityRouter.create(req, res, await parseBody(req));
    return true;
  }

  // Filters
  if (pathname === "/api/filters" && method === "GET") {
    await filtersRouter.getAll(req, res);
    return true;
  }
  if (pathname === "/api/filters" && method === "POST") {
    await filtersRouter.create(req, res, await parseBody(req));
    return true;
  }
  const filterId = matchId(pathname, /^\/api\/filters\/([^/]+)$/);
  if (filterId) {
    if (method === "PUT") {
      await filtersRouter.update(req, res, filterId, await parseBody(req));
      return true;
    }
    if (method === "DELETE") {
      await filtersRouter.remove(req, res, filterId);
      return true;
    }
  }

  // Trash
  if (pathname === "/api/trash" && method === "GET") {
    await trashRouter.getAll(req, res);
    return true;
  }
  const trashRestore = matchId(
    pathname,
    /^\/api\/trash\/([^/]+)\/restore$/
  );
  if (trashRestore && method === "POST") {
    await trashRouter.restore(req, res, trashRestore);
    return true;
  }
  const trashPurge = matchId(
    pathname,
    /^\/api\/trash\/([^/]+)\/purge$/
  );
  if (trashPurge && method === "DELETE") {
    await trashRouter.purge(req, res, trashPurge);
    return true;
  }
  const trashId = matchId(pathname, /^\/api\/trash\/([^/]+)$/);
  if (trashId && method === "DELETE") {
    await trashRouter.remove(req, res, trashId);
    return true;
  }

  // Comments
  if (pathname === "/api/comments" && method === "GET") {
    await commentsRouter.getAll(req, res);
    return true;
  }
  if (pathname === "/api/comments" && method === "POST") {
    await commentsRouter.create(req, res, await parseBody(req));
    return true;
  }
  const commentId = matchId(pathname, /^\/api\/comments\/([^/]+)$/);
  if (commentId) {
    if (method === "PUT") {
      await commentsRouter.update(req, res, commentId, await parseBody(req));
      return true;
    }
    if (method === "DELETE") {
      await commentsRouter.remove(req, res, commentId);
      return true;
    }
  }

  // State sync
  if (pathname === "/api/state" && method === "GET") {
    await getState(req, res);
    return true;
  }
  if (pathname === "/api/state" && method === "PUT") {
    await setState(req, res, await parseBody(req));
    return true;
  }

  // Import / Export
  if (pathname === "/api/import" && method === "POST") {
    await importData(req, res, await parseBody(req));
    return true;
  }
  if (pathname === "/api/export" && method === "GET") {
    exportData(req, res);
    return true;
  }

  return false;
}

async function start(): Promise<void> {
  try {
    // Initialize database
    await initDb();
    initTables();
    migrateTables();

    // Create HTTP server
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(
          req.url ?? "/",
          `http://${req.headers.host ?? "localhost"}`
        );
        const handled = await dispatch(
          req,
          res,
          url,
          url.pathname,
          req.method ?? "GET"
        );
        if (!handled) {
          // No /api/* route matched. Try to serve a static file from the
          // project root (index.html, src/*.js, styles.css, public/*, etc.).
          // The static handler returns true if it handled the request (even
          // for a 404 of a static path); only fall through to the JSON 404
          // if it explicitly says "I don't handle this method".
          const staticHandled = await serveStaticFile(req, res);
          if (!staticHandled) {
            sendJson(res, 404, { error: "Not found" });
          }
        }
      } catch (error) {
        console.error("Request error:", error);
        sendJson(res, 500, { error: "Internal server error" });
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      console.log("\nShutting down...");
      void saveDb().then(() => {
        closeDb();
        process.exit(0);
      });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Jirito server running at http://localhost:${PORT}`);
      console.log(`Database: ${process.env.JIRITO_DB_PATH || "./jirito.db"}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

void start();
