/**
 * Projects CRUD routes.
 * GET    /api/projects          — list all projects
 * GET    /api/projects/current  — get current project
 * PUT    /api/projects/current  — set current project
 * POST   /api/projects          — create project
 * DELETE /api/projects/:id      — delete project
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow } from "./_shared.js";

export async function getAll(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const projects = queryAll("SELECT * FROM projects ORDER BY createdAt ASC");
    sendJson(res, 200, projects);
  } catch (error) {
    console.error("getAll projects error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function getCurrent(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const result = db.exec(
      "SELECT value FROM metadata WHERE key = 'currentProject'"
    );
    const currentProject =
      result.length > 0 ? String(result[0].values[0][0]) : "default";

    const projectResult = db.exec("SELECT * FROM projects WHERE id = ?", [
      currentProject,
    ]);
    if (projectResult.length === 0 || projectResult[0].values.length === 0) {
      sendJson(res, 404, { error: "Project not found" });
      return;
    }
    const project = mapRow(
      "projects",
      projectResult[0].columns,
      projectResult[0].values[0]
    );
    sendJson(res, 200, project);
  } catch (error) {
    console.error("getCurrent project error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function setCurrent(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const input = body as { currentProject?: string };
    const currentProject = input.currentProject;
    if (!currentProject) {
      sendJson(res, 400, { error: "currentProject is required" });
      return;
    }

    // Verify project exists
    const check = db.exec("SELECT id FROM projects WHERE id = ?", [
      currentProject,
    ]);
    if (check.length === 0 || check[0].values.length === 0) {
      sendJson(res, 404, { error: "Project not found" });
      return;
    }

    db.run(
      "INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)",
      [currentProject]
    );
    await saveDb();

    sendJson(res, 200, { success: true, currentProject });
  } catch (error) {
    console.error("setCurrent project error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function create(
  _req: IncomingMessage,
  res: ServerResponse,
  body: unknown
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }
    const input = body as Record<string, unknown>;
    const now = new Date().toISOString();
    const id = (input.id as string) || `proj_${Date.now()}`;
    const name = (input.name as string) || "";
    const key = (input.key as string) || id;
    const icon = (input.icon as string) || "🚀";
    const color = (input.color as string) || "#0052CC";
    const description = (input.description as string) || "";
    // JIRITO-125 (2026-06-30): the create-project modal in
    // index.html:345-350 captured githubUrl (PR target) and path
    // (local working dir), but the server silently dropped both
    // before this fix. Surfacing them here is the prerequisite for
    // handing agents the right repo on dispatch — see
    // ~/.hermes/plugins/jirito-event-injector/formatting.py and the
    // PR for squad-integration follow-up.
    const githubUrl = (input.githubUrl as string) || "";
    const path = (input.path as string) || "";

    db.run(
      `INSERT INTO projects (id, name, key, icon, color, description, githubUrl, path, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, key, icon, color, description, githubUrl, path, now, now]
    );

    await saveDb();

    sendJson(res, 201, {
      id,
      name,
      key,
      icon,
      color,
      description,
      githubUrl,
      path,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    console.error("create project error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function remove(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string
): Promise<void> {
  try {
    const db = getDb();
    if (!db) {
      sendJson(res, 500, { error: "DB not initialised" });
      return;
    }

    // Check how many projects exist
    const countResult = db.exec("SELECT COUNT(*) as count FROM projects");
    const count =
      countResult.length > 0 ? Number(countResult[0].values[0][0]) : 0;
    if (count <= 1) {
      sendJson(res, 400, { error: "You must have at least one project" });
      return;
    }

    // Get project name for response
    const projectResult = db.exec("SELECT name FROM projects WHERE id = ?", [
      id,
    ]);
    const projectName =
      projectResult.length > 0
        ? String(projectResult[0].values[0][0])
        : id;

    // Delete project (cascade will handle sprints)
    db.run("DELETE FROM projects WHERE id = ?", [id]);

    // Update current project if it was the current one
    const currentResult = db.exec(
      "SELECT value FROM metadata WHERE key = 'currentProject'"
    );
    const currentProject =
      currentResult.length > 0
        ? String(currentResult[0].values[0][0])
        : "default";
    if (currentProject === id) {
      // Find another project to use as current
      const otherResult = db.exec("SELECT id FROM projects LIMIT 1");
      if (otherResult.length > 0 && otherResult[0].values.length > 0) {
        const newCurrent = String(otherResult[0].values[0][0]);
        db.run(
          "INSERT OR REPLACE INTO metadata (key, value) VALUES ('currentProject', ?)",
          [newCurrent]
        );
      }
    }

    await saveDb();

    sendJson(res, 200, {
      success: true,
      message: `Project "${projectName}" deleted`,
    });
  } catch (error) {
    console.error("remove project error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getAll, getCurrent, setCurrent, create, remove };
