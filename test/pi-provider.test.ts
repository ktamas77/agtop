import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as pi from '../src/providers/pi.ts';
import type { Proc, Rec } from '../src/types.ts';

function withHome(fn: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-pi-'));
  const orig = os.homedir;
  (os as { homedir: () => string }).homedir = () => root;
  try {
    fn(root);
  } finally {
    (os as { homedir: () => string }).homedir = orig;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeSession(file: string, entries: Rec[]): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n');
}

function proc(args: string, cwd: string): Proc {
  return {
    pid: 123,
    ppid: 1,
    cpu: 1.5,
    rssKb: 2048,
    uptimeSec: 42,
    cwd,
    args,
  };
}

Deno.test('pi.matchProcess accepts Pi shapes and rejects management or pi-go shapes', () => {
  assert.equal(pi.matchProcess('pi'), true);
  assert.equal(pi.matchProcess('/opt/bin/pi --session-dir /tmp/pi-sessions'), true);
  assert.equal(
    pi.matchProcess('node /usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js'),
    true,
  );
  assert.equal(pi.matchProcess('pi --no-session'), true);
  assert.equal(pi.matchProcess('pi fix the failing test'), true);
  // Bare `pi` with only numeric positionals is the GNU pi calculator, not the agent.
  assert.equal(pi.matchProcess('pi 1000'), false);
  assert.equal(pi.matchProcess('/usr/bin/pi 31415'), false);
  assert.equal(pi.matchProcess('/usr/bin/pi-go tui'), false);
  assert.equal(pi.matchProcess('pi-go'), false);
  assert.equal(pi.matchProcess('pi sessions list'), false);
  assert.equal(pi.matchProcess('pi --help'), false);
  assert.equal(pi.matchProcess('npx pi'), false);
  assert.equal(pi.matchProcess('node server.js'), false);
});

Deno.test('pi.sessionRoots honors CLI, env, settings, default, and XDG roots', () =>
  withHome((root) => {
    const cwd = path.join(root, 'work', 'proj');
    const agentHome = path.join(root, '.pi', 'agent');
    fs.mkdirSync(agentHome, { recursive: true });
    fs.writeFileSync(
      path.join(agentHome, 'settings.json'),
      JSON.stringify({ sessionDir: 'custom' }),
    );
    const envRoot = path.join(root, 'env-sessions');
    const xdg = path.join(root, 'xdg');
    const roots = pi.sessionRoots(cwd, 'pi --session-dir ./local-sessions', {
      PI_CODING_AGENT_SESSION_DIR: envRoot,
      XDG_DATA_HOME: xdg,
    });
    assert.deepEqual(roots, [
      path.join(cwd, 'local-sessions'),
      envRoot,
      path.join(agentHome, 'custom'),
      path.join(agentHome, 'sessions'),
      path.join(xdg, 'pi-coding-agent', 'sessions'),
    ]);
  }));

Deno.test('pi.summarizeFile derives model, session, state, timestamp, and detail', () =>
  withHome((root) => {
    const cwd = path.join(root, 'repo');
    const file = path.join(root, '.pi', 'agent', 'sessions', '--repo--', '20260608_sess.jsonl');
    writeSession(file, [
      {
        type: 'session',
        version: 3,
        id: 'sess-1',
        timestamp: '2026-06-08T10:00:00.000Z',
        cwd,
      },
      {
        type: 'message',
        id: 'u1',
        timestamp: '2026-06-08T10:00:01.000Z',
        message: { role: 'user', content: 'inspect the repo', timestamp: 1780912801000 },
      },
      {
        type: 'model_change',
        id: 'm1',
        timestamp: '2026-06-08T10:00:02.000Z',
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5',
      },
      {
        type: 'message',
        id: 'a1',
        timestamp: '2026-06-08T10:00:03.000Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          content: [{ type: 'toolCall', name: 'bash', arguments: {} }],
          timestamp: 1780912803000,
        },
      },
    ]);
    const summary = pi.summarizeFile(file);
    assert.equal(summary.cwd, cwd);
    assert.equal(summary.sessionId, 'sess-1');
    assert.equal(summary.model, 'claude-sonnet-4-5');
    assert.equal(summary.lastPrompt, 'inspect the repo');
    assert.equal(summary.rawState, 'tool');
    assert.equal(summary.detail, 'Shell');
    assert.equal(summary.lastTs, 1780912803000);
  }));

Deno.test('pi.collect joins cwd-matched sessions and drops ambiguous bare pi without evidence', () =>
  withHome((root) => {
    const cwd = path.join(root, 'proj');
    const file = path.join(root, '.pi', 'agent', 'sessions', '--proj--', '20260608_sess.jsonl');
    writeSession(file, [
      { type: 'session', version: 3, id: 'sess-2', timestamp: '2026-06-08T00:00:00Z', cwd },
      {
        type: 'message',
        id: 'a1',
        timestamp: '2026-06-08T00:00:05Z',
        message: {
          role: 'assistant',
          model: 'gpt-5',
          content: [{ type: 'text', text: 'Done.\nmore' }],
        },
      },
    ]);
    const rows = pi.collect([proc('pi', cwd), proc('pi', path.join(root, 'other'))]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent, 'pi');
    assert.equal(rows[0].sessionId, 'sess-2');
    assert.equal(rows[0].model, 'gpt-5');
    assert.equal(rows[0].rawState, 'replied');
    assert.equal(rows[0].detail, 'Done.');
  }));

Deno.test('pi.collect preserves trusted no-session Pi processes as degraded rows', () =>
  withHome((root) => {
    const cwd = path.join(root, 'proj');
    const rows = pi.collect([proc('pi --no-session', cwd)]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].rawState, 'no-session');
    assert.equal(rows[0].sessionId, null);
    assert.equal(rows[0].project, 'proj');
  }));

Deno.test('pi custom GSD entries stay represented as a single Pi row', () =>
  withHome((root) => {
    const cwd = path.join(root, 'repo');
    const file = path.join(root, '.pi', 'agent', 'sessions', '--repo--', '20260608_gsd.jsonl');
    writeSession(file, [
      { type: 'session', version: 3, id: 'sess-gsd', timestamp: '2026-06-08T00:00:00Z', cwd },
      {
        type: 'custom',
        id: 'g1',
        customType: 'pi-gsd',
        timestamp: '2026-06-08T00:00:05Z',
        data: { mode: 'auto', phase: '2.1', status: 'verifying' },
      },
    ]);
    const rows = pi.collect([proc('pi', cwd)]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].agent, 'pi');
    assert.equal(rows[0].sessionId, 'sess-gsd');
    assert.equal(rows[0].rawState, 'thinking');
    assert.equal(rows[0].detail, 'gsd: auto phase 2.1 verifying');
  }));

Deno.test('pi.summarizeFile fails soft on malformed files', () =>
  withHome((root) => {
    const file = path.join(root, 'bad.jsonl');
    fs.writeFileSync(file, '{bad json\n');
    const summary = pi.summarizeFile(file);
    assert.equal(summary.cwd, null);
    assert.equal(summary.sessionId, 'bad');
    assert.equal(summary.rawState, 'unknown');
  }));
