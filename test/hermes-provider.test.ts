import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as hermes from '../src/providers/hermes.ts';
import type { Proc } from '../src/types.ts';

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

function withHome(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-hermes-'));
  const orig = os.homedir;
  (os as { homedir: () => string }).homedir = () => root;
  try {
    fn(root);
  } finally {
    (os as { homedir: () => string }).homedir = orig;
    fs.rmSync(root, { recursive: true, force: true });
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

function proc(args: string, cwd: string): Proc {
  return {
    pid: 234,
    ppid: 1,
    cpu: 2.5,
    rssKb: 4096,
    uptimeSec: 120,
    cwd,
    args,
  };
}

Deno.test('hermes.matchProcess accepts interactive sessions and rejects management shapes', () => {
  assert.equal(hermes.matchProcess('hermes'), true);
  assert.equal(hermes.matchProcess('/usr/local/bin/hermes chat --model nous/hermes'), true);
  assert.equal(hermes.matchProcess('node /usr/lib/hermes/cli.js'), true);
  assert.equal(
    hermes.matchProcess(
      '/home/me/.hermes/hermes-agent/venv/bin/python3 /home/me/.local/bin/hermes',
    ),
    true,
  );
  assert.equal(hermes.matchProcess('hermes gateway'), false);
  assert.equal(
    hermes.matchProcess(
      '/home/me/.hermes/hermes-agent/venv/bin/python3 /home/me/.local/bin/hermes gateway',
    ),
    false,
  );
  assert.equal(hermes.matchProcess('hermes sessions list'), false);
  assert.equal(hermes.matchProcess('hermes --help'), false);
  assert.equal(hermes.matchProcess('node server.js'), false);
});

Deno.test('hermes.dbPath honors HERMES_HOME and default home', () =>
  withHome((root) => {
    assert.equal(hermes.dbPath({}), path.join(root, '.hermes', 'state.db'));
    assert.equal(
      hermes.dbPath({ HERMES_HOME: '~/custom-hermes' }),
      path.join(root, 'custom-hermes', 'state.db'),
    );
  }));

Deno.test('hermes.collect enriches from state.db when sqlite3 is available', {
  ignore: !hasSqlite(),
}, () =>
  withHome((root) => {
    const cwd = path.join(root, 'repo');
    const db = hermes.dbPath({});
    fs.mkdirSync(path.dirname(db), { recursive: true });
    sqlite(
      db,
      `
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        model TEXT,
        title TEXT,
        started_at REAL NOT NULL,
        ended_at REAL
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT,
        tool_calls TEXT,
        tool_name TEXT,
        timestamp REAL NOT NULL,
        reasoning TEXT
      );
      INSERT INTO sessions (id, source, model, title, started_at)
        VALUES ('hermes-1', 'cli', 'nous/hermes-4', 'Fix auth', 1780912800.0);
      INSERT INTO messages (session_id, role, content, timestamp)
        VALUES ('hermes-1', 'user', 'inspect auth', 1780912801.0);
      INSERT INTO messages (session_id, role, content, tool_name, timestamp)
        VALUES ('hermes-1', 'assistant', '', 'terminal', 1780912803.0);
      `,
    );
    const rows = hermes.collect([proc('hermes chat', cwd)]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent, 'hermes');
    assert.equal(rows[0].model, 'nous/hermes-4');
    assert.equal(rows[0].sessionId, 'hermes-1');
    assert.equal(rows[0].lastPrompt, 'inspect auth');
    assert.equal(rows[0].rawState, 'tool');
    assert.equal(rows[0].detail, 'Shell');
    assert.equal(rows[0].lastTs, 1780912803000);
  }));

Deno.test('hermes.collect degrades when state.db is missing', () =>
  withHome((root) => {
    const cwd = path.join(root, 'repo');
    const rows = hermes.collect([proc('hermes', cwd)]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rawState, 'no-session');
    assert.equal(rows[0].sessionId, null);
    assert.equal(rows[0].project, 'repo');
  }));
