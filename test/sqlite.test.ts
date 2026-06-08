import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { queryJson } from '../src/sqlite.ts';

function hasSqlite(): boolean {
  try {
    return new Deno.Command('sqlite3', {
      args: ['-version'],
      stdout: 'null',
      stderr: 'null',
    }).outputSync().success;
  } catch {
    return false;
  }
}

function sqlite(db: string, sql: string): void {
  const out = new Deno.Command('sqlite3', {
    args: [db, sql],
    stdout: 'null',
    stderr: 'null',
  }).outputSync();
  if (!out.success) throw new Error('sqlite command failed');
}

Deno.test('queryJson returns [] for missing or invalid databases', () => {
  assert.deepEqual(queryJson('/no/such/db.sqlite', 'SELECT 1'), []);
});

Deno.test('queryJson reads JSON rows when sqlite3 is available', { ignore: !hasSqlite() }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-sqlite-'));
  const db = path.join(dir, 'test.sqlite');
  try {
    sqlite(db, "CREATE TABLE items(id INTEGER, name TEXT); INSERT INTO items VALUES (1, 'one');");
    assert.deepEqual(queryJson(db, 'SELECT id, name FROM items;'), [{ id: 1, name: 'one' }]);
    assert.deepEqual(queryJson(db, 'SELECT * FROM missing_table;'), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
