import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readHeadObjects, readTailObjects } from '../src/jsonl.ts';
import * as claude from '../src/providers/claude.ts';
import * as codex from '../src/providers/codex.ts';
import * as grok from '../src/providers/grok.ts';
import * as gemini from '../src/providers/gemini.ts';
import * as agy from '../src/providers/agy.ts';

// ---- shared jsonl helpers ----

Deno.test('readTailObjects parses JSONL and drops a partial leading line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    const lines: string[] = [];
    for (let i = 0; i < 200; i++) lines.push(JSON.stringify({ type: 'user', n: i }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const objs = readTailObjects(file, 512);
    assert.ok(objs.length > 0 && objs.length < 200);
    assert.equal(objs[objs.length - 1].n, 199);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

Deno.test('readHeadObjects parses leading lines; both return [] for missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    fs.writeFileSync(file, [0, 1, 2].map((n) => JSON.stringify({ n })).join('\n') + '\n');
    assert.equal(readHeadObjects(file, 256)[0].n, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  assert.deepEqual(readTailObjects('/no/such/file.jsonl'), []);
  assert.deepEqual(readHeadObjects('/no/such/file.jsonl'), []);
});

// ---- claude ----

Deno.test('claude.matchProcess matches the CLI but not the desktop app', () => {
  assert.equal(claude.matchProcess('claude'), true);
  assert.equal(claude.matchProcess('/opt/homebrew/bin/claude --resume'), true);
  assert.equal(
    claude.matchProcess('node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'),
    true,
  );
  assert.equal(claude.matchProcess('/Applications/Claude.app/Contents/MacOS/Claude'), false);
  assert.equal(claude.matchProcess('codex'), false);
});

Deno.test('claude.summarize derives tool/replied state and empty input', () => {
  const s = claude.summarize([
    {
      type: 'user',
      cwd: '/tmp/x',
      gitBranch: 'main',
      timestamp: '2026-06-08T00:00:00.000Z',
      message: { content: 'hi' },
    },
    {
      type: 'assistant',
      timestamp: '2026-06-08T00:00:01.000Z',
      message: { model: 'claude-opus-4-8', content: [{ type: 'tool_use', name: 'Bash' }] },
    },
  ]);
  assert.equal(s.cwd, '/tmp/x');
  assert.equal(s.model, 'claude-opus-4-8');
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Bash');
  const r = claude.summarize([{
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'all done\nx' }] },
  }]);
  assert.equal(r.rawState, 'replied');
  assert.equal(r.detail, 'all done');
  assert.equal(claude.summarize([]).rawState, 'unknown');
});

Deno.test('claude.summarize captures the subagent slug', () => {
  const s = claude.summarize([
    { slug: 'review:bug-scan', type: 'user', message: { content: 'go' } },
    { type: 'assistant', message: { model: 'claude-haiku-4-5', content: [] } },
  ]);
  assert.equal(s.slug, 'review:bug-scan');
  assert.equal(claude.summarize([]).slug, null);
});

Deno.test('claude.collectSubagents emits live subagents and skips stale ones', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-sub-'));
  const sid = 'sess-1';
  const sessionFile = path.join(root, `${sid}.jsonl`);
  const subDir = path.join(root, sid, 'subagents');
  try {
    fs.writeFileSync(sessionFile, JSON.stringify({ cwd: '/proj', type: 'user' }) + '\n');
    fs.mkdirSync(subDir, { recursive: true });
    const mkSub = (fname: string, slug: string, tool: string) =>
      fs.writeFileSync(
        path.join(subDir, fname),
        JSON.stringify({
          slug,
          cwd: '/proj',
          gitBranch: 'main',
          type: 'assistant',
          timestamp: '2026-06-08T00:00:00.000Z',
          message: { model: 'claude-haiku-4-5', content: [{ type: 'tool_use', name: tool }] },
        }) + '\n',
      );
    mkSub('agent-a.jsonl', 'review:bug-scan', 'Grep');
    mkSub('agent-b.jsonl', 'review:perf', 'Read');
    // Age agent-b well past the live window so it is filtered out.
    const old = new Date(Date.now() - 10 * 60 * 1000);
    fs.utimesSync(path.join(subDir, 'agent-b.jsonl'), old, old);

    const parent = {
      agent: 'claude' as const,
      pid: 4242,
      cpu: 12,
      rssKb: 1,
      uptimeSec: 1,
      cwd: '/proj',
      project: 'proj',
      args: 'claude',
      model: null,
      version: null,
      gitBranch: 'main',
      sessionId: sid,
      lastPrompt: null,
      lastTs: null,
      rawState: 'tool',
      detail: '',
    };
    const subs = claude.collectSubagents(parent, sessionFile, Date.now());
    assert.equal(subs.length, 1);
    assert.equal(subs[0].parentPid, 4242);
    assert.equal(subs[0].pid, 4242);
    assert.equal(subs[0].slug, 'review:bug-scan');
    assert.equal(subs[0].model, 'claude-haiku-4-5');
    assert.equal(subs[0].rawState, 'tool');
    assert.equal(subs[0].detail, 'Grep');
    // No subagents dir → empty, not a throw.
    assert.deepEqual(
      claude.collectSubagents({ ...parent, sessionId: 'nope' }, sessionFile, Date.now()),
      [],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// ---- codex ----

Deno.test('codex.matchProcess + summarizeTail (model, tool label, reply, empty)', () => {
  assert.equal(codex.matchProcess('codex'), true);
  assert.equal(codex.matchProcess('claude'), false);
  const s = codex.summarizeTail([
    { type: 'turn_context', payload: { model: 'gpt-5.5' } },
    {
      type: 'response_item',
      timestamp: '2026-06-08T00:00:02.000Z',
      payload: { type: 'function_call', name: 'exec_command' },
    },
  ]);
  assert.equal(s.model, 'gpt-5.5');
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Shell');
  assert.equal(s.lastTs, Date.parse('2026-06-08T00:00:02.000Z'));
  const done = codex.summarizeTail([{
    type: 'event_msg',
    payload: { type: 'task_complete', last_agent_message: 'shipped' },
  }]);
  assert.equal(done.rawState, 'replied');
  assert.equal(codex.summarizeTail([]).rawState, 'unknown');
});

// ---- grok ----

Deno.test('grok.matchProcess + summarizeEvents phase/tool mapping', () => {
  assert.equal(grok.matchProcess('grok'), true);
  assert.equal(grok.matchProcess('claude'), false);
  assert.equal(grok.summarizeEvents([{ type: 'turn_ended' }]).rawState, 'replied');
  const tool = grok.summarizeEvents([
    { type: 'tool_started', tool_name: 'run_terminal_command' },
    { type: 'phase_changed', phase: 'tool_execution' },
  ]);
  assert.equal(tool.rawState, 'tool');
  assert.equal(tool.detail, 'Shell');
  assert.equal(
    grok.summarizeEvents([{ type: 'phase_changed', phase: 'permission_prompt' }]).detail,
    'awaiting approval',
  );
  assert.equal(grok.summarizeEvents([]).rawState, 'unknown');
});

// ---- gemini ----

Deno.test('gemini.matchProcess (node …/gemini) + deriveActivity + summarize', () => {
  assert.equal(gemini.matchProcess('node /Users/me/.nvm/versions/node/v24/bin/gemini'), true);
  assert.equal(gemini.matchProcess('claude'), false);
  const tool = gemini.deriveActivity([{
    type: 'gemini',
    content: '',
    toolCalls: [{ name: 'run_shell_command' }],
  }]);
  assert.equal(tool.rawState, 'tool');
  assert.equal(tool.detail, 'Shell');
  assert.equal(gemini.deriveActivity([{ type: 'user', content: 'hi' }]).rawState, 'thinking');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-gemini-'));
  const file = path.join(dir, 'session-x.jsonl');
  try {
    fs.writeFileSync(
      file,
      [
        JSON.stringify({ sessionId: 'sess-9', kind: 'main' }),
        JSON.stringify({
          type: 'gemini',
          content: '',
          model: 'gemini-3-flash-preview',
          toolCalls: [{ name: 'read_file' }],
          timestamp: '2026-06-08T09:31:05.000Z',
        }),
        JSON.stringify({ $set: { lastUpdated: '2026-06-08T09:31:09.000Z' } }),
      ].join('\n') + '\n',
    );
    const s = gemini.summarize(file);
    assert.equal(s.model, 'gemini-3-flash-preview');
    assert.equal(s.sessionId, 'sess-9');
    assert.equal(s.rawState, 'tool');
    assert.equal(s.detail, 'Read');
    assert.equal(s.lastTs, Date.parse('2026-06-08T09:31:09.000Z'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- agy (Antigravity) ----

Deno.test('agy.matchProcess + summarizeSteps + modelFrom (version-dot)', () => {
  assert.equal(agy.matchProcess('agy'), true);
  assert.equal(agy.matchProcess('/Users/me/.local/bin/agy'), true);
  assert.equal(agy.matchProcess('claude'), false);

  assert.equal(agy.summarizeSteps([{ type: 'USER_INPUT' }]).rawState, 'thinking');
  const replied = agy.summarizeSteps([{
    type: 'PLANNER_RESPONSE',
    status: 'DONE',
    content: 'Done.\nx',
  }]);
  assert.equal(replied.rawState, 'replied');
  assert.equal(replied.detail, 'Done.');
  assert.equal(agy.summarizeSteps([{ type: 'LIST_DIRECTORY', status: 'DONE' }]).detail, 'List');

  assert.equal(
    agy.modelFrom([{
      type: 'USER_INPUT',
      content: 'Model Selection from None to Gemini 3.5 Flash (Medium). ok',
    }]),
    'gemini-3.5-flash',
  );
  assert.equal(agy.modelFrom([{ type: 'USER_INPUT', content: 'nope' }]), null);
});
