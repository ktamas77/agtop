import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as opencode from '../src/providers/opencode.ts';
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-opencode-'));
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
    pid: 345,
    ppid: 1,
    cpu: 3.5,
    rssKb: 8192,
    uptimeSec: 240,
    cwd,
    args,
  };
}

Deno.test('opencode.matchProcess accepts TUI/run sessions and rejects sidecar shapes', () => {
  assert.equal(opencode.matchProcess('opencode'), true);
  assert.equal(opencode.matchProcess('opencode /work/project'), true);
  assert.equal(opencode.matchProcess('opencode --model anthropic/claude-sonnet-4-5'), true);
  assert.equal(opencode.matchProcess('opencode run "explain closures"'), true);
  assert.equal(opencode.matchProcess('opencode tui'), true);
  assert.equal(opencode.matchProcess('opencode serve'), false);
  assert.equal(opencode.matchProcess('opencode web'), false);
  assert.equal(opencode.matchProcess('opencode db path'), false);
  assert.equal(opencode.matchProcess('opencode session list'), false);
  assert.equal(opencode.matchProcess('opencode --help'), false);
  assert.equal(opencode.matchProcess('npx opencode'), false);
});

Deno.test('opencode.dbPaths honors OPENCODE_DB, OPENCODE_DATA_DIR, and XDG data paths', () =>
  withHome((root) => {
    const explicit = path.join(root, 'explicit.db');
    const dataDir = path.join(root, 'data');
    const xdg = path.join(root, 'xdg');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'opencode-stable.db'), '');
    const paths = opencode.dbPaths({
      OPENCODE_DB: explicit,
      OPENCODE_DATA_DIR: dataDir,
      XDG_DATA_HOME: xdg,
    });
    assert.deepEqual(paths, [
      explicit,
      path.join(dataDir, 'opencode.db'),
      path.join(dataDir, 'opencode-stable.db'),
    ]);
  }));

Deno.test('opencode.collect enriches cwd-matched sessions from sqlite storage', {
  ignore: !hasSqlite(),
}, () =>
  withHome((root) => {
    const cwd = path.join(root, 'repo');
    const db = path.join(root, '.local', 'share', 'opencode', 'opencode.db');
    fs.mkdirSync(path.dirname(db), { recursive: true });
    sqlite(
      db,
      `
      CREATE TABLE project (
        id TEXT PRIMARY KEY,
        worktree TEXT NOT NULL,
        name TEXT,
        time_created INTEGER,
        time_updated INTEGER
      );
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        directory TEXT NOT NULL,
        title TEXT NOT NULL,
        version TEXT NOT NULL,
        agent TEXT,
        model TEXT,
        time_created INTEGER,
        time_updated INTEGER
      );
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        time_created INTEGER,
        time_updated INTEGER,
        data TEXT NOT NULL
      );
      CREATE TABLE part (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        time_created INTEGER,
        time_updated INTEGER,
        data TEXT NOT NULL
      );
      INSERT INTO project (id, worktree, name, time_created, time_updated)
        VALUES ('proj-1', '${cwd.replace(/'/g, "''")}', 'repo', 1780912800000, 1780912800000);
      INSERT INTO session (id, project_id, directory, title, version, agent, model, time_created, time_updated)
        VALUES ('oc-1', 'proj-1', '${cwd.replace(/'/g, "''")}', 'Fix auth', '1', 'build',
          '{"providerID":"anthropic","id":"claude-sonnet-4-5"}', 1780912800000, 1780912805000);
      INSERT INTO message (id, session_id, time_created, time_updated, data)
        VALUES ('msg-1', 'oc-1', 1780912801000, 1780912801000, '{"role":"user","text":"inspect auth"}');
      INSERT INTO message (id, session_id, time_created, time_updated, data)
        VALUES ('msg-2', 'oc-1', 1780912802000, 1780912802000, '{"role":"assistant","text":""}');
      INSERT INTO part (id, message_id, session_id, time_created, time_updated, data)
        VALUES ('part-1', 'msg-2', 'oc-1', 1780912803000, 1780912803000, '{"type":"tool","tool":"bash"}');
      `,
    );
    const rows = opencode.collect([proc('opencode', cwd)]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent, 'opencode');
    assert.equal(rows[0].model, 'anthropic/claude-sonnet-4-5');
    assert.equal(rows[0].sessionId, 'oc-1');
    assert.equal(rows[0].lastPrompt, 'inspect auth');
    assert.equal(rows[0].rawState, 'tool');
    assert.equal(rows[0].detail, 'Shell');
    assert.equal(rows[0].lastTs, 1780912803000);
  }));

Deno.test('opencode.collect degrades on missing or malformed storage', () =>
  withHome((root) => {
    const cwd = path.join(root, 'repo');
    const rows = opencode.collect([proc('opencode run "x"', cwd)]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rawState, 'no-session');
    assert.equal(rows[0].sessionId, null);
    assert.equal(rows[0].project, 'repo');
  }));

Deno.test('opencode.summarizeRow fails soft on malformed JSON data', () => {
  const row = opencode.summarizeRow({
    id: 'oc-bad',
    directory: '/tmp/repo',
    model: '{bad',
    time_created: 1780912800000,
    first_message_data: '{bad',
    last_message_data: '{bad',
    last_part_data: '{bad',
  });
  assert.equal(row.sessionId, 'oc-bad');
  assert.equal(row.model, '{bad');
  assert.equal(row.rawState, 'unknown');
});
