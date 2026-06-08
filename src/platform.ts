// Runtime abstraction over the two Node-specific seams (subprocess + terminal),
// so the rest of agentop is identical on Node and Deno. Detects the runtime via
// `globalThis.Deno`; the Node branch uses `node:` built-ins, the Deno branch uses
// `Deno.*`.

import { execFileSync } from 'node:child_process';
import type { Buffer } from 'node:buffer';
import process from 'node:process';

// Untyped handle to Deno's globals — keeps the npm (tsc) build from needing Deno
// types, while still running natively under Deno.
// deno-lint-ignore no-explicit-any
const D: any = (globalThis as any).Deno;
const isDeno = typeof D !== 'undefined';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Run a command and return its stdout. stderr is discarded; '' on failure. */
export function capture(cmd: string, args: string[]): string {
  try {
    if (isDeno) {
      const out = new D.Command(cmd, { args, stdout: 'piped', stderr: 'null' }).outputSync();
      return out.success || out.stdout ? decoder.decode(out.stdout) : '';
    }
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

export function env(name: string): string | undefined {
  return isDeno ? D.env.get(name) : process.env[name];
}

/** 'linux' | 'darwin' | … — used to choose /proc vs lsof for cwd resolution. */
export function osName(): string {
  return isDeno ? D.build.os : process.platform;
}

export function isTTY(which: 'stdin' | 'stdout'): boolean {
  if (isDeno) return which === 'stdin' ? D.stdin.isTerminal() : D.stdout.isTerminal();
  return Boolean(which === 'stdin' ? process.stdin.isTTY : process.stdout.isTTY);
}

export function consoleSize(): { columns: number; rows: number } {
  if (isDeno) {
    try {
      const { columns, rows } = D.consoleSize();
      return { columns, rows };
    } catch {
      return { columns: 100, rows: 30 };
    }
  }
  return { columns: process.stdout.columns || 100, rows: process.stdout.rows || 30 };
}

export function write(s: string): void {
  if (isDeno) D.stdout.writeSync(encoder.encode(s));
  else process.stdout.write(s);
}

export function setRaw(on: boolean): void {
  try {
    if (isDeno) D.stdin.setRaw(on);
    else if (process.stdin.isTTY) process.stdin.setRawMode(on);
  } catch {
    /* ignore */
  }
}

/** Stream raw keypresses (as decoded strings) to `cb`. Runs until the process exits. */
export function onKey(cb: (key: string) => void): void {
  if (isDeno) {
    (async () => {
      const buf = new Uint8Array(1024);
      while (true) {
        let n: number | null;
        try {
          n = await D.stdin.read(buf);
        } catch {
          break;
        }
        if (n === null) break;
        cb(decoder.decode(buf.subarray(0, n)));
      }
    })();
  } else {
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d: Buffer | string) => cb(d.toString()));
  }
}

export function pauseInput(): void {
  if (!isDeno) process.stdin.pause();
}

export function onResize(cb: () => void): void {
  if (isDeno) {
    try {
      D.addSignalListener('SIGWINCH', cb);
    } catch {
      /* unsupported */
    }
  } else {
    process.stdout.on('resize', cb);
  }
}

export function onSignal(name: 'SIGINT' | 'SIGTERM', cb: () => void): void {
  if (isDeno) {
    try {
      D.addSignalListener(name, cb);
    } catch {
      /* ignore */
    }
  } else {
    process.on(name, cb);
  }
}

export function onExit(cb: () => void): void {
  // deno-lint-ignore no-explicit-any
  if (isDeno) (globalThis as any).addEventListener('unload', cb);
  else process.on('exit', cb);
}

export function exit(code: number): void {
  if (isDeno) D.exit(code);
  else process.exit(code);
}
