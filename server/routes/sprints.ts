/**
 * Sprints CRUD routes.
 * GET    /api/projects/:id/sprints  — get sprints for a project
 * POST   /api/sprints              — create sprint
 * PUT    /api/sprints/:id          — update sprint
 * DELETE /api/sprints/:id          — delete sprint
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { getDb, saveDb } from "../db/index.js";
import { sendJson, queryAll, mapRow } from "./_shared.js";

export async function getByProject(
  _req: IncomingMessage,
  res: ServerResponse,
  projectId: string
): Promise<void> {
  try {
    const rows = queryAll(
      "SELECT * FROM sprints WHERE projectId = ? ORDER BY createdAt ASC",
      [projectId]
    );
    sendJson(res, 200, rows);
  } catch (error) {
    console.error("getByProject sprints error:", error);
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
    const id = (input.id as string) || `spr_${Date.now()}`;
    const now = new Date().toISOString();
    db.run(
      "INSERT INTO sprints (id, projectId, name, status, startDate, endDate, goal, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        (input.projectId as string) ?? "",
        (input.name as string) ?? "",
        (input.status as string) ?? "active",
        (input.startDate as string) ?? null,
        (input.endDate as string) ?? null,
        (input.goal as string) ?? "",
        now,
        now,
      ]
    );
    await saveDb();
    sendJson(res, 201, { id, ...input, createdAt: now, updatedAt: now });
  } catch (error) {
    console.error("create sprint error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export async function update(
  _req: IncomingMessage,
  res: ServerResponse,
  id: string,
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
    const fields = [
      "projectId",
      "name",
      "status",
      "startDate",
      "endDate",
      "goal",
    ];
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const field of fields) {
      if (input[field] !== undefined) {
        updates.push(`${field} = ?`);
        params.push(input[field]);
      }
    }
    updates.push("updatedAt = ?");
    params.push(now);
    params.push(id);
    db.run(`UPDATE sprints SET ${updates.join(", ")} WHERE id = ?`, params);
    await saveDb();

    const result = db.exec("SELECT * FROM sprints WHERE id = ?", [id]);
    if (result.length === 0) {
      sendJson(res, 404, { error: "Sprint not found" });
      return;
    }
    const sprint = mapRow("sprints", result[0].columns, result[0].values[0]);
    sendJson(res, 200, sprint);
  } catch (error) {
    console.error("update sprint error:", error);
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
    db.run("DELETE FROM sprints WHERE id = ?", [id]);
    await saveDb();
    sendJson(res, 200, { success: true });
  } catch (error) {
    console.error("remove sprint error:", error);
    sendJson(res, 500, { error: (error as Error).message });
  }
}

export default { getByProject, create, update, remove };
