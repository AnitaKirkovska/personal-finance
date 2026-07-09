// SQLite database singleton for personal-finance plugin.
// Uses node:sqlite (built-in since Node 22 with --experimental-sqlite flag,
// stable since Node 24). Falls back to a JSON-based store if unavailable.

import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

import { ALL_MIGRATIONS, ALL_SEEDS } from "./schema.js";

// Lazy-loaded to avoid import errors on Node < 24
let _db: any = undefined;
let _dbPath: string | undefined;

function getDefaultDbPath(): string {
  const workspaceDir = process.env.VELLUM_WORKSPACE_DIR ?? process.cwd();
  return join(workspaceDir, "plugins", "personal-finance", "data", "finance.db");
}

export function configureDb(dbPath: string): void {
  if (_db !== undefined) {
    throw new Error("Cannot reconfigure the database after initialization.");
  }
  _dbPath = dbPath;
}

export function getDb(): any {
  if (_db !== undefined) return _db;

  _dbPath = _dbPath ?? getDefaultDbPath();
  mkdirSync(dirname(_dbPath), { recursive: true });

  try {
    // Try node:sqlite (Node 24+)
    const { DatabaseSync } = require("node:sqlite");
    _db = new DatabaseSync(_dbPath);
  } catch {
    // Fallback: try better-sqlite3 if available
    try {
      const Database = require("better-sqlite3");
      _db = new Database(_dbPath);
    } catch {
      throw new Error(
        "No SQLite driver available. Requires Node.js 24+ (built-in node:sqlite) or better-sqlite3."
      );
    }
  }

  initializeDb(_db);
  return _db;
}

function initializeDb(db: any): void {
  // WAL mode + foreign keys (best-effort, not all drivers support pragmas the same way)
  try { db.exec("PRAGMA journal_mode = WAL"); } catch {}
  try { db.exec("PRAGMA foreign_keys = ON"); } catch {}

  try {
    db.exec("BEGIN");
    for (const sql of ALL_MIGRATIONS) {
      try { db.exec(sql); } catch (err: any) {
        // Ignore duplicate column errors from re-running migrations
        if (!/duplicate column name/i.test(err.message)) throw err;
      }
    }
    for (const sql of ALL_SEEDS) {
      try { db.exec(sql); } catch {}
    }
    db.exec("COMMIT");
  } catch (err) {
    try { db.exec("ROLLBACK"); } catch {}
    throw err;
  }
}

// Helper to normalize the query API between node:sqlite and better-sqlite3.
// node:sqlite uses db.prepare(sql).run(...params) / .all(...params) / .get(...params)
// better-sqlite3 uses db.prepare(sql).run(...params) / .all(...params) / .get(...params)
// They're close enough that this works for both.
export function queryAll(db: any, sql: string, ...params: any[]): any[] {
  return db.prepare(sql).all(...params);
}

export function queryGet(db: any, sql: string, ...params: any[]): any {
  return db.prepare(sql).get(...params);
}

export function queryRun(db: any, sql: string, ...params: any[]): void {
  db.prepare(sql).run(...params);
}
