// Fabricated agents for `agentop --demo` — privacy-safe, reproducible sample
// data for screenshots, demo GIFs, and previewing the UI without running any
// real sessions. States cycle over time so the live view looks alive.

import type { Agent, DisplayState, Framework, RawState } from './types.ts';

interface Fixture {
  pid: number;
  agent: Framework;
  project: string;
  branch: string;
  model: string;
  baseCpu: number;
  rssKb: number;
  uptimeSec: number;
}

const FIXTURES: Fixture[] = [
  {
    pid: 50121,
    agent: 'claude',
    project: 'api-gateway',
    branch: 'main',
    model: 'claude-opus-4-8',
    baseCpu: 22.4,
    rssKb: 612000,
    uptimeSec: 4460,
  },
  {
    pid: 50488,
    agent: 'codex',
    project: 'web-frontend',
    branch: 'feat/checkout',
    model: 'gpt-5.5',
    baseCpu: 14.1,
    rssKb: 548000,
    uptimeSec: 1820,
  },
  {
    pid: 50733,
    agent: 'grok',
    project: 'billing-service',
    branch: 'main',
    model: 'grok-4',
    baseCpu: 9.7,
    rssKb: 503000,
    uptimeSec: 7321,
  },
  {
    pid: 51002,
    agent: 'gemini',
    project: 'ml-pipeline',
    branch: 'exp/embeddings',
    model: 'gemini-3-flash',
    baseCpu: 31.8,
    rssKb: 731000,
    uptimeSec: 980,
  },
  {
    pid: 51140,
    agent: 'agy',
    project: 'mobile-app',
    branch: 'release/2.3',
    model: 'gemini-3-flash',
    baseCpu: 2.1,
    rssKb: 421000,
    uptimeSec: 15400,
  },
  {
    pid: 51399,
    agent: 'pi',
    project: 'infra-terraform',
    branch: 'main',
    model: 'claude-sonnet-4-5',
    baseCpu: 0.3,
    rssKb: 388000,
    uptimeSec: 22030,
  },
  {
    pid: 51602,
    agent: 'hermes',
    project: 'docs-portal',
    branch: 'content/rewrite',
    model: 'nous/hermes-4',
    baseCpu: 6.8,
    rssKb: 462000,
    uptimeSec: 3400,
  },
  {
    pid: 51871,
    agent: 'opencode',
    project: 'payments-cli',
    branch: 'fix/refunds',
    model: 'anthropic/claude-sonnet-4-5',
    baseCpu: 18.6,
    rssKb: 590000,
    uptimeSec: 2280,
  },
];

interface Phase {
  rawState: RawState;
  detail: string;
  idleSec: number;
  state: DisplayState;
}

const CYCLE: Phase[] = [
  { rawState: 'tool', detail: 'Bash', idleSec: 1, state: 'working' },
  { rawState: 'tool', detail: 'Edit', idleSec: 2, state: 'working' },
  { rawState: 'thinking', detail: '', idleSec: 3, state: 'thinking' },
  { rawState: 'tool', detail: 'Grep', idleSec: 1, state: 'working' },
  { rawState: 'replied', detail: 'done — opened PR #214', idleSec: 12, state: 'replied' },
  { rawState: 'tool', detail: 'WebSearch', idleSec: 1, state: 'working' },
  { rawState: 'replied', detail: 'awaiting input', idleSec: 95, state: 'waiting' },
  { rawState: 'idle', detail: '', idleSec: 740, state: 'idle' },
];

// Build the demo agent list for a given timestamp (ms). Pass a fixed value for
// deterministic output (tests); omit for a live, animated view.
export function demoAgents(nowMs: number = Date.now()): Agent[] {
  const tick = Math.floor(nowMs / 1000);
  const agents: Agent[] = FIXTURES.map((f, i) => {
    const phase = CYCLE[(tick + i * 2) % CYCLE.length];
    const cpuJitter = phase.state === 'idle' || phase.state === 'waiting'
      ? 0
      : ((tick + i) % 5) - 2;
    return {
      pid: f.pid,
      agent: f.agent,
      cpu: Math.max(0, +(f.baseCpu + cpuJitter).toFixed(1)),
      rssKb: f.rssKb,
      uptimeSec: f.uptimeSec + (tick % 60),
      cwd: `/Users/dev/${f.project}`,
      project: f.project,
      args: f.agent,
      model: f.model,
      version: '2.1.168',
      gitBranch: f.branch,
      sessionId: null,
      lastPrompt: null,
      lastTs: null,
      rawState: phase.rawState,
      detail: phase.detail,
      idleSec: phase.idleSec,
      state: phase.state,
    };
  });

  // A live Task-tool subagent under the claude fixture (pid 50121), to preview
  // the SUB / ↳parent row style. sortAgents pins it beneath its parent.
  const sub = CYCLE[(tick + 1) % CYCLE.length];
  agents.push({
    pid: 50121,
    parentPid: 50121,
    slug: 'review:bug-scan',
    agent: 'claude',
    cpu: 0,
    rssKb: 0,
    uptimeSec: 0,
    cwd: '/Users/dev/api-gateway',
    project: 'api-gateway',
    args: 'claude',
    model: 'claude-haiku-4-5',
    version: '2.1.168',
    gitBranch: 'main',
    sessionId: 'demo-session',
    lastPrompt: null,
    lastTs: null,
    rawState: sub.rawState,
    detail: sub.detail,
    idleSec: sub.idleSec,
    state: sub.state,
  });

  return agents;
}
