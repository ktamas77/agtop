'use strict';

const { listAllProcesses, resolveCwds } = require('./processes');
const { classifyState } = require('./state');
const claude = require('./providers/claude');
const codex = require('./providers/codex');
const grok = require('./providers/grok');
const gemini = require('./providers/gemini');
const agy = require('./providers/agy');

const PROVIDERS = [claude, codex, grok, gemini, agy];

// Build the list of running-agent records across all providers (Claude, Codex).
function collectAgents() {
  const all = listAllProcesses();

  // Map each process to the first provider that claims it.
  const providerOf = new Map();
  let matched = [];
  for (const p of all) {
    const provider = PROVIDERS.find((pr) => pr.matchProcess(p.args));
    if (provider) {
      providerOf.set(p, provider);
      matched.push(p);
    }
  }

  // Drop launcher shims: a matched process that is the parent of another matched
  // process of the same provider (e.g. Gemini's `node gemini` shim that spawns
  // the actual worker). Keep the leaf — it holds the real session.
  const parentPids = new Set();
  for (const c of matched) {
    const parent = matched.find((p) => p.pid === c.ppid && providerOf.get(p) === providerOf.get(c));
    if (parent) parentPids.add(parent.pid);
  }
  matched = matched.filter((p) => !parentPids.has(p.pid));

  // Resolve cwds once for the surviving set.
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
