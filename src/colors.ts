// Minimal, dependency-free ANSI styling. Disabled by default; the CLI enables it
// based on the platform's TTY/NO_COLOR check so this module stays runtime-agnostic.

type Styler = (s: unknown) => string;

const CODES = {
  bold: 1,
  dim: 2,
  italic: 3,
  underline: 4,
  inverse: 7,
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
} as const;

type ColorName = keyof typeof CODES;

let enabled = false;

// deno-lint-ignore no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

type Colors = {
  setEnabled(value: boolean): void;
  readonly enabled: boolean;
  strip(s: unknown): string;
  width(s: unknown): number;
} & Record<ColorName, Styler>;

const colors = {
  setEnabled(value: boolean) {
    enabled = Boolean(value);
  },
  get enabled() {
    return enabled;
  },
  strip: (s: unknown) => String(s).replace(ANSI_RE, ''),
  width: (s: unknown) => String(s).replace(ANSI_RE, '').length,
} as Colors;

for (const name of Object.keys(CODES) as ColorName[]) {
  const code = CODES[name];
  colors[name] = (s: unknown) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
}

export default colors;
