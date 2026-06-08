'use strict';

const { listAllProcesses, resolveCwds } = require('./processes');
const { classifyState } = require('./state');
const claude = require('./providers/claude');
const codex = require('./providers/codex');
const grok = require('./providers/grok');

const PROVIDERS = [claude, codex, grok];

// Build the list of running-agent records across all providers (Claude, Codex).
function collectAgents() {
  const all = listAllProcesses();

  // Map each process to the first provider that claims it, then resolve cwds
  // once for the matched set.
  const providerOf = new Map();
  const matched = [];
  for (const p of all) {
    const provider = PROVIDERS.find((pr) => pr.matchProcess(p.args));
    if (provider) {
      providerOf.set(p, provider);
      matched.push(p);
    }
  }
  resolveCwds(matched);

  const now = Date.now();
  const agents = [];
  for (const provider of PROVIDERS) {
    const procs = matched.filter((p) => providerOf.get(p) === provider);
    if (!procs.length) continue;
    for (const a of provider.collect(procs)) {
      const idleSec = a.lastTs ? Math.max(0, (now - a.lastTs) / 1000) : null;
      agents.push({ ...a, idleSec, state: classifyState(a.rawState, idleSec) });
    }
  }
  return agents;
}

module.exports = { collectAgents, classifyState };
