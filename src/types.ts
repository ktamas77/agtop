// Shared types across agentop.

/** A loose JSON object — session transcripts are heterogeneous external data. */
export type Rec = Record<string, any>;

/** The agent frameworks agentop knows how to detect. */
export type Framework =
  | 'claude'
  | 'codex'
  | 'grok'
  | 'gemini'
  | 'agy'
  | 'pi'
  | 'hermes'
  | 'opencode';

/** What a provider reports an agent is doing, before it's aged into a display state. */
export type RawState = 'tool' | 'thinking' | 'replied' | 'unknown' | 'no-session' | string;

/** The display state shown in the STATE column. */
export type DisplayState =
  | 'working'
  | 'thinking'
  | 'replied'
  | 'active'
  | 'waiting'
  | 'idle'
  | 'stalled'
  | 'live';

/** A raw OS process row from `ps`, with its working directory resolved. */
export interface Proc {
  pid: number;
  ppid: number;
  cpu: number;
  rssKb: number;
  uptimeSec: number;
  args: string;
  cwd: string | null;
}

/** A provider's per-process record, before collect() ages it into a final state. */
export interface PartialAgent {
  agent: Framework;
  pid: number;
  cpu: number;
  rssKb: number;
  uptimeSec: number;
  cwd: string | null;
  project: string;
  args: string;
  model: string | null;
  version: string | null;
  gitBranch: string | null;
  sessionId: string | null;
  lastPrompt: string | null;
  lastTs: number | null;
  rawState: RawState;
  detail: string;
}

/** A fully-resolved agent row, ready to render. */
export interface Agent extends PartialAgent {
  idleSec: number | null;
  state: DisplayState;
}

/** The shape every framework provider implements. */
export interface Provider {
  name: Framework;
  matchProcess(args: string): boolean;
  collect(procs: Proc[]): PartialAgent[];
}

/** A provider's derived activity for one session. */
export interface Activity {
  rawState: RawState;
  detail: string;
}
