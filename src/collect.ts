import { listAllProcesses, resolveCwds } from './processes.ts';
import { sanitizeAgentRecord } from './provider-utils.ts';
import { classifyState } from './state.ts';
import * as claude from './providers/claude.ts';
import * as codex from './providers/codex.ts';
import * as grok from './providers/grok.ts';
import * as gemini from './providers/gemini.ts';
import * as agy from './providers/agy.ts';
import * as pi from './providers/pi.ts';
import * as hermes from './providers/hermes.ts';
import * as opencode from './providers/opencode.ts';
import type { Agent, Proc, Provider } from './types.ts';

const PROVIDERS: Provider[] = [claude, codex, grok, gemini, agy, pi, hermes, opencode];

// Build the list of running-agent records across all providers.
export function collectAgents(): Agent[] {
  const all = listAllProcesses();

  // Map each process to the first provider that claims it.
  const providerOf = new Map<Proc, Provider>();
  let matched: Proc[] = [];
  for (const p of all) {
    const provider = PROVIDERS.find((pr) => pr.matchProcess(p.args));
    if (provider) {
      providerOf.set(p, provider);
      matched.push(p);
    }
  }

  // Drop launcher shims: a matched process that is the parent of another matched
  // process of the same provider. Keep the leaf.
  const parentPids = new Set<number>();
  for (const c of matched) {
    const parent = matched.find((p) => p.pid === c.ppid && providerOf.get(p) === providerOf.get(c));
    if (parent) parentPids.add(parent.pid);
  }
  matched = matched.filter((p) => !parentPids.has(p.pid));

  // Resolve cwds once for the surviving set.
  resolveCwds(matched);

  const now = Date.now();
  const agents: Agent[] = [];
  for (const provider of PROVIDERS) {
    const procs = matched.filter((p) => providerOf.get(p) === provider);
    if (!procs.length) continue;
    for (const a of provider.collect(procs)) {
      const idleSec = a.lastTs ? Math.max(0, (now - a.lastTs) / 1000) : null;
      agents.push(
        sanitizeAgentRecord({ ...a, idleSec, state: classifyState(a.rawState, idleSec) }),
      );
    }
  }
  return agents;
}

export { classifyState };
