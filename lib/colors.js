'use strict';

// Minimal, dependency-free ANSI styling. Honors NO_COLOR and non-TTY output.
let enabled = process.stdout.isTTY && !process.env.NO_COLOR;

function setEnabled(value) {
  enabled = Boolean(value);
}

const CODES = {
  reset: 0,
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
};

function wrap(name) {
  return (str) => (enabled ? `\x1b[${CODES[name]}m${str}\x1b[0m` : String(str));
}

const colors = { setEnabled, get enabled() { return enabled; } };
for (const name of Object.keys(CODES)) {
  if (name === 'reset') continue;
  colors[name] = wrap(name);
}

// Strip ANSI for width calculations.
const ANSI_RE = /\x1b\[[0-9;]*m/g;
colors.strip = (str) => String(str).replace(ANSI_RE, '');
colors.width = (str) => colors.strip(str).length;

module.exports = colors;
