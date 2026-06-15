/**
 * server/static.ts — Minimal static file server for the Jirito backend.
 *
 * Used as a fallback after the API dispatcher returns `false` (i.e. the
 * request didn't match any `/api/*` route). Serves files from the project
 * root (`process.cwd()`) so the single backend process can host both the
 * REST API and the static client bundle.
 *
 * Same-origin (no CORS): the browser's CSP allows `connect-src 'self'`,
 * so the client at `http://localhost:3001/` can call `/api/*` directly.
 *
 * Path-traversal guard: every resolved path must start with `process.cwd()`.
 */
import { readFile } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".cjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

/**
 * Try to serve a static file for the request.
 *
 * @returns `true` if the request was handled (200, 404, or 403 for the
 *   static path); `false` if the method isn't GET/HEAD and the caller
 *   should keep routing.
 */
export async function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  const rawUrl = req.url ?? "/";
  // Strip query string and resolve "/" → "/index.html".
  const pathOnly = rawUrl.split("?")[0].split("#")[0];
  const relPath = pathOnly === "/" ? "/index.html" : pathOnly;
  const root = resolve(process.cwd());
  const filePath = resolve(join(root, relPath));

  // Path-traversal guard: filePath must live under the project root.
  if (!filePath.startsWith(root + sep) && filePath !== root) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return true;
  }

  try {
    const data = await readFileAsync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
    });
    if (method === "HEAD") {
      res.end();
    } else {
      res.end(data);
    }
    return true;
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return true;
  }
}

function readFileAsync(path: string): Promise<Buffer> {
  return new Promise((resolveFn, rejectFn) => {
    readFile(path, (err, data) => {
      if (err) rejectFn(err);
      else resolveFn(data);
    });
  });
}
