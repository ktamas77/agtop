import fs from 'node:fs';
import { capture } from './platform.ts';
import type { Rec } from './types.ts';

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
