const CAPABILITY_KEYS = [
  'process',
  'cwd',
  'model',
  'session',
  'state',
  'idle',
  'activity',
  'json',
  'tui',
  'docs',
  'tests',
] as const;

export type Capability = typeof CAPABILITY_KEYS[number];
export type ProviderStatus = 'current' | 'planned' | 'conditional';

export interface ProviderCapability {
  name: string;
  status: ProviderStatus;
  capabilities: readonly Capability[];
  source: string;
  condition?: string;
}

export const CAPABILITIES: readonly Capability[] = CAPABILITY_KEYS;

export const PROVIDERS: readonly ProviderCapability[] = [
  {
    name: 'claude',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/claude.ts',
  },
  {
    name: 'codex',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/codex.ts',
  },
  {
    name: 'grok',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/grok.ts',
  },
  {
    name: 'gemini',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/gemini.ts',
  },
  {
    name: 'agy',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/agy.ts',
  },
  {
    name: 'hermes',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/hermes.ts',
  },
  {
    name: 'pi',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/pi.ts',
  },
  {
    name: 'opencode',
    status: 'current',
    capabilities: CAPABILITIES,
    source: 'src/providers/opencode.ts',
  },
  {
    name: 'gsd-pi',
    status: 'conditional',
    condition: 'Add only if base Pi cannot expose required GSD-specific state.',
    capabilities: CAPABILITIES,
    source: 'planned: GSD-Pi local .gsd/runtime state',
  },
];

export function allProviders(): ProviderCapability[] {
  return PROVIDERS.map((provider) => ({
    ...provider,
    capabilities: provider.capabilities.slice(),
  }));
}

export function plannedProviders(): ProviderCapability[] {
  return allProviders().filter((p) => p.status === 'planned' || p.status === 'conditional');
}
