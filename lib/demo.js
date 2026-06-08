'use strict';

// Fabricated agents for `agentop --demo` — privacy-safe, reproducible sample
// data for screenshots, demo GIFs, and previewing the UI without running any
// real Claude sessions. States cycle over time so the live view looks alive.

const FIXTURES = [
  {
    pid: 50121,
    project: 'api-gateway',
    branch: 'main',
    model: 'claude-opus-4-8',
    baseCpu: 22.4,
    rssKb: 612000,
    uptimeSec: 4460,
  },
  {
    pid: 50488,
    project: 'web-frontend',
    branch: 'feat/checkout',
    model: 'claude-sonnet-4-6',
    baseCpu: 14.1,
    rssKb: 548000,
    uptimeSec: 1820,
  },
  {
    pid: 50733,
    project: 'billing-service',
    branch: 'main',
    model: 'claude-opus-4-8',
    baseCpu: 9.7,
    rssKb: 503000,
    uptimeSec: 7321,
  },
  {
    pid: 51002,
    project: 'ml-pipeline',
    branch: 'exp/embeddings',
    model: 'claude-opus-4-8',
    baseCpu: 31.8,
    rssKb: 731000,
    uptimeSec: 980,
  },
  {
    pid: 51140,
    project: 'mobile-app',
    branch: 'release/2.3',
    model: 'claude-haiku-4-5',
    baseCpu: 2.1,
    rssKb: 421000,
    uptimeSec: 15400,
  },
  {
    pid: 51399,
    project: 'infra-terraform',
    branch: 'main',
    model: 'claude-sonnet-4-6',
    baseCpu: 0.3,
    rssKb: 388000,
    uptimeSec: 22030,
  },
];

// Each rotation step: [rawState, detail, idleSec]. classifyState (in render via
// the precomputed `state`) maps these to colors; we set `state` directly here.
const CYCLE = [
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
function demoAgents(nowMs = Date.now()) {
  const tick = Math.floor(nowMs / 1000);
  return FIXTURES.map((f, i) => {
    const phase = CYCLE[(tick + i * 2) % CYCLE.length];
    const cpuJitter =
      phase.state === 'idle' || phase.state === 'waiting' ? 0 : ((tick + i) % 5) - 2;
    return {
      pid: f.pid,
      cpu: Math.max(0, +(f.baseCpu + cpuJitter).toFixed(1)),
      rssKb: f.rssKb,
      uptimeSec: f.uptimeSec + (tick % 60),
      cwd: `/Users/dev/${f.project}`,
      project: f.project,
      args: 'claude',
      model: f.model,
      version: '2.1.168',
      gitBranch: f.branch,
      sessionId: null,
      lastPrompt: null,
      rawState: phase.rawState,
      detail: phase.detail,
      idleSec: phase.idleSec,
      state: phase.state,
    };
  });
}

module.exports = { demoAgents };
