import fs from 'node:fs';
import { capture } from './platform.ts';
import type { Rec } from './types.ts';

// Shared read path for the SQLite-backed providers (Codex, Hermes, OpenCode).
// Two deliberate choices, both hard-won (see CHANGELOG 0.2.2):
//   - No `-readonly` flag: it fails with SQLITE_CANTOPEN on WAL-mode DBs (e.g.
//     Codex's state DB), so we open read-write and rely on running our own SELECT.
//   - capture() discards the subprocess stderr, so a failed open or a missing
//     `sqlite3` binary never leaks an error line into the live TUI.
export function queryJson(db: string | null | undefined, sql: string | null | undefined): Rec[] {
  if (!db || !sql) return [];
  try {
    if (!fs.existsSync(db)) return [];
    const out = capture('sqlite3', ['-json', db, sql]);
    const parsed = out.trim() ? JSON.parse(out) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
