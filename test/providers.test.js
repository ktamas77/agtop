'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTailObjects, readHeadObjects } = require('../lib/jsonl');
const claude = require('../lib/providers/claude');
const codex = require('../lib/providers/codex');
const grok = require('../lib/providers/grok');
const gemini = require('../lib/providers/gemini');
const agy = require('../lib/providers/agy');

// ---- shared jsonl helpers ----

test('readTailObjects parses JSONL and drops a partial leading line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(JSON.stringify({ type: 'user', n: i }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const objs = readTailObjects(file, 512);
    assert.ok(objs.length > 0 && objs.length < 200);
    assert.equal(objs[objs.length - 1].n, 199);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readHeadObjects parses leading lines and drops a partial trailing line', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-'));
  const file = path.join(dir, 's.jsonl');
  try {
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(JSON.stringify({ type: 'session_meta', n: i }));
    fs.writeFileSync(file, lines.join('\n') + '\n');
    const objs = readHeadObjects(file, 256);
    assert.ok(objs.length > 0 && objs.length < 200);
    assert.equal(objs[0].n, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readTailObjects / readHeadObjects return [] for a missing file', () => {
  assert.deepEqual(readTailObjects('/no/such/file.jsonl'), []);
  assert.deepEqual(readHeadObjects('/no/such/file.jsonl'), []);
});

// ---- claude provider ----

test('claude.matchProcess matches the CLI but not the desktop app', () => {
  assert.equal(claude.matchProcess('claude'), true);
  assert.equal(claude.matchProcess('claude -c'), true);
  assert.equal(claude.matchProcess('/opt/homebrew/bin/claude --resume'), true);
  assert.equal(
    claude.matchProcess('node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js'),
    true,
  );
  assert.equal(claude.matchProcess('/Applications/Claude.app/Contents/MacOS/Claude'), false);
  assert.equal(claude.matchProcess('codex'), false);
  assert.equal(claude.matchProcess('vim claude.txt'), false);
});

test('claude.summarize derives state from a transcript tail', () => {
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
  assert.equal(s.gitBranch, 'main');
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Bash');
});

test('claude.summarize: text reply and empty input', () => {
  const r = claude.summarize([
    { type: 'assistant', message: { content: [{ type: 'text', text: 'all done\nx' }] } },
  ]);
  assert.equal(r.rawState, 'replied');
  assert.equal(r.detail, 'all done');
  const e = claude.summarize([]);
  assert.equal(e.cwd, null);
  assert.equal(e.rawState, 'unknown');
});

// ---- codex provider ----

test('codex.matchProcess matches the codex CLI only', () => {
  assert.equal(codex.matchProcess('codex'), true);
  assert.equal(codex.matchProcess('/opt/homebrew/bin/codex'), true);
  assert.equal(codex.matchProcess('codex exec "do a thing"'), true);
  assert.equal(codex.matchProcess('claude'), false);
  assert.equal(codex.matchProcess('node server.js'), false);
});

test('codex.summarizeTail extracts model and tool activity', () => {
  const s = codex.summarizeTail([
    { type: 'turn_context', payload: { model: 'gpt-5.5', cwd: '/tmp/x' } },
    {
      type: 'response_item',
      timestamp: '2026-06-08T00:00:02.000Z',
      payload: { type: 'function_call', name: 'exec_command' },
    },
  ]);
  assert.equal(s.model, 'gpt-5.5');
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Shell'); // exec_command -> friendly label
  assert.equal(s.lastTs, Date.parse('2026-06-08T00:00:02.000Z'));
});

test('codex.summarizeTail: assistant message -> replied, reasoning -> thinking', () => {
  const replied = codex.summarizeTail([
    {
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'done\nmore' }],
      },
    },
  ]);
  assert.equal(replied.rawState, 'replied');
  assert.equal(replied.detail, 'done');

  const thinking = codex.summarizeTail([{ type: 'response_item', payload: { type: 'reasoning' } }]);
  assert.equal(thinking.rawState, 'thinking');
});

test('codex.summarizeTail: apply_patch and task_complete', () => {
  const edit = codex.summarizeTail([
    { type: 'response_item', payload: { type: 'custom_tool_call', name: 'apply_patch' } },
  ]);
  assert.equal(edit.rawState, 'tool');
  assert.equal(edit.detail, 'Edit');

  const complete = codex.summarizeTail([
    { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: 'shipped it' } },
  ]);
  assert.equal(complete.rawState, 'replied');
  assert.equal(complete.detail, 'shipped it');
});

test('codex.summarizeTail is safe on empty input', () => {
  const s = codex.summarizeTail([]);
  assert.equal(s.model, null);
  assert.equal(s.rawState, 'unknown');
  assert.equal(s.lastTs, null);
});

// ---- grok provider ----

test('grok.matchProcess matches the grok CLI only', () => {
  assert.equal(grok.matchProcess('grok'), true);
  assert.equal(grok.matchProcess('/Users/me/.grok/bin/grok'), true);
  assert.equal(grok.matchProcess('grok --yolo'), true);
  assert.equal(grok.matchProcess('claude'), false);
  assert.equal(grok.matchProcess('codex'), false);
  assert.equal(grok.matchProcess('node server.js'), false);
  assert.equal(grok.matchProcess(''), false);
});

test('grok.summarizeEvents: turn_ended -> replied', () => {
  const s = grok.summarizeEvents([
    { type: 'phase_changed', phase: 'streaming_text' },
    { type: 'turn_ended', outcome: 'completed' },
  ]);
  assert.equal(s.rawState, 'replied');
});

test('grok.summarizeEvents: running tool -> working with friendly label', () => {
  const s = grok.summarizeEvents([
    { type: 'tool_started', tool_name: 'run_terminal_command' },
    { type: 'phase_changed', phase: 'tool_execution' },
  ]);
  assert.equal(s.rawState, 'tool');
  assert.equal(s.detail, 'Shell');
});

test('grok.summarizeEvents: completed tool clears the running tool', () => {
  const s = grok.summarizeEvents([
    { type: 'tool_started', tool_name: 'run_terminal_command' },
    { type: 'tool_completed' },
    { type: 'phase_changed', phase: 'streaming_reasoning' },
  ]);
  assert.equal(s.rawState, 'thinking');
});

test('grok.summarizeEvents: permission prompt and streaming/empty', () => {
  assert.equal(
    grok.summarizeEvents([{ type: 'phase_changed', phase: 'permission_prompt' }]).detail,
    'awaiting approval',
  );
  assert.equal(
    grok.summarizeEvents([{ type: 'phase_changed', phase: 'waiting_for_model' }]).rawState,
    'thinking',
  );
  assert.equal(grok.summarizeEvents([]).rawState, 'unknown');
});

test('grok.summarizeSession reads summary.json + events.jsonl from a session dir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-grok-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({
        info: { id: 'sess-1', cwd: '/tmp/x' },
        current_model_id: 'grok-4',
        updated_at: '2026-06-08T00:00:05.000Z',
        session_summary: 'Analyze the repo',
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'events.jsonl'),
      [
        JSON.stringify({
          ts: '2026-06-08T00:00:04.000Z',
          type: 'tool_started',
          tool_name: 'read_file',
        }),
        JSON.stringify({
          ts: '2026-06-08T00:00:05.000Z',
          type: 'phase_changed',
          phase: 'tool_execution',
        }),
      ].join('\n') + '\n',
    );
    const s = grok.summarizeSession(dir);
    assert.equal(s.model, 'grok-4');
    assert.equal(s.sessionId, 'sess-1');
    assert.equal(s.lastPrompt, 'Analyze the repo');
    assert.equal(s.lastTs, Date.parse('2026-06-08T00:00:05.000Z'));
    assert.equal(s.rawState, 'tool');
    assert.equal(s.detail, 'Read');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('grok.summarizeSession falls back to last event ts when summary lacks updated_at', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-grok-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'summary.json'),
      JSON.stringify({ current_model_id: 'grok-code' }),
    );
    fs.writeFileSync(
      path.join(dir, 'events.jsonl'),
      JSON.stringify({ ts: '2026-06-08T01:00:00.000Z', type: 'turn_ended' }) + '\n',
    );
    const s = grok.summarizeSession(dir);
    assert.equal(s.model, 'grok-code');
    assert.equal(s.lastTs, Date.parse('2026-06-08T01:00:00.000Z'));
    assert.equal(s.rawState, 'replied');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- gemini provider ----

test('gemini.matchProcess matches `node …/gemini` and the bare binary', () => {
  assert.equal(gemini.matchProcess('node /Users/me/.nvm/versions/node/v24.1.0/bin/gemini'), true);
  assert.equal(gemini.matchProcess('/path/node --max-old-space-size=32768 /path/bin/gemini'), true);
  assert.equal(gemini.matchProcess('gemini'), true);
  assert.equal(gemini.matchProcess('claude'), false);
  assert.equal(gemini.matchProcess('node server.js'), false);
});

test('gemini.deriveActivity: tool call vs reply vs user', () => {
  const tool = gemini.deriveActivity([
    { type: 'gemini', content: '', toolCalls: [{ name: 'run_shell_command' }] },
  ]);
  assert.equal(tool.rawState, 'tool');
  assert.equal(tool.detail, 'Shell');

  const replied = gemini.deriveActivity([
    { type: 'gemini', content: 'Here is what I found\nmore' },
  ]);
  assert.equal(replied.rawState, 'replied');
  assert.equal(replied.detail, 'Here is what I found');

  const thinking = gemini.deriveActivity([{ type: 'user', content: 'hello' }]);
  assert.equal(thinking.rawState, 'thinking');

  assert.equal(gemini.deriveActivity([]).rawState, 'unknown');
});

test('gemini.summarize reads model + activity + newest timestamp from a chat file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-gemini-'));
  const file = path.join(dir, 'session-x.jsonl');
  try {
    fs.writeFileSync(
      file,
      [
        JSON.stringify({
          sessionId: 'sess-9',
          startTime: '2026-06-08T09:30:00.000Z',
          kind: 'main',
        }),
        JSON.stringify({ type: 'user', message: 'analyze', timestamp: '2026-06-08T09:31:00.000Z' }),
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
    assert.equal(s.lastTs, Date.parse('2026-06-08T09:31:09.000Z')); // newest across messages + $set
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- agy (Google Antigravity) provider ----

test('agy.matchProcess matches the agy CLI only', () => {
  assert.equal(agy.matchProcess('agy'), true);
  assert.equal(agy.matchProcess('/Users/me/.local/bin/agy'), true);
  assert.equal(agy.matchProcess('node /path/bin/agy'), true);
  assert.equal(agy.matchProcess('claude'), false);
  assert.equal(agy.matchProcess('gemini'), false);
  assert.equal(agy.matchProcess('node server.js'), false);
});

test('agy.summarizeSteps maps transcript step types to state', () => {
  assert.equal(agy.summarizeSteps([{ type: 'USER_INPUT' }]).rawState, 'thinking');

  const replied = agy.summarizeSteps([
    { type: 'PLANNER_RESPONSE', status: 'DONE', content: 'All done.\nmore' },
  ]);
  assert.equal(replied.rawState, 'replied');
  assert.equal(replied.detail, 'All done.');

  assert.equal(
    agy.summarizeSteps([{ type: 'PLANNER_RESPONSE', status: 'RUNNING' }]).rawState,
    'thinking',
  );

  const tool = agy.summarizeSteps([{ type: 'LIST_DIRECTORY', status: 'DONE' }]);
  assert.equal(tool.rawState, 'tool');
  assert.equal(tool.detail, 'List');

  assert.equal(agy.summarizeSteps([{ type: 'VIEW_FILE' }]).detail, 'Read');
  assert.equal(agy.summarizeSteps([]).rawState, 'unknown');
});

test('agy.modelFrom extracts the model from a settings-change line (keeps version dots)', () => {
  const objs = [
    {
      type: 'USER_INPUT',
      content:
        '<USER_SETTINGS_CHANGE>\nThe user changed setting `Model Selection` from None to Gemini 3.5 Flash (Medium). No need to comment.\n</USER_SETTINGS_CHANGE>',
    },
  ];
  assert.equal(agy.modelFrom(objs), 'gemini-3.5-flash');
  assert.equal(agy.modelFrom([{ type: 'USER_INPUT', content: 'no model here' }]), null);
});

test('agy.summarizeConversation only matches a transcript that references the cwd', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentop-agy-'));
  const convDir = path.join(root, 'conv-1', '.system_generated', 'logs');
  fs.mkdirSync(convDir, { recursive: true });
  const tp = path.join(convDir, 'transcript.jsonl');
  // Point the provider at our temp brain root.
  const orig = os.homedir;
  os.homedir = () => root;
  // brainRoot() = <root>/.gemini/antigravity-cli/brain — so place the conv there.
  const brain = path.join(
    root,
    '.gemini',
    'antigravity-cli',
    'brain',
    'conv-1',
    '.system_generated',
    'logs',
  );
  fs.mkdirSync(brain, { recursive: true });
  const realTp = path.join(brain, 'transcript.jsonl');
  try {
    fs.writeFileSync(
      realTp,
      [
        JSON.stringify({
          type: 'USER_INPUT',
          created_at: '2026-06-08T09:38:00Z',
          content: 'Model Selection from None to Gemini 3.5 Flash (Medium). file:///work/proj',
        }),
        JSON.stringify({
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          created_at: '2026-06-08T09:39:00Z',
          content: 'Done.',
        }),
      ].join('\n') + '\n',
    );
    const hit = agy.summarizeConversation('conv-1', '/work/proj');
    assert.ok(hit);
    assert.equal(hit.model, 'gemini-3.5-flash');
    assert.equal(hit.rawState, 'replied');
    assert.equal(hit.lastTs, Date.parse('2026-06-08T09:39:00Z'));
    assert.equal(agy.summarizeConversation('conv-1', '/some/other/dir'), null);
  } finally {
    os.homedir = orig;
    fs.rmSync(root, { recursive: true, force: true });
    void tp;
  }
});
