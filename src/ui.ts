import { collectAgents } from './collect.ts';
import { demoAgents } from './demo.ts';
import { buildFrame, sortAgents, SORTS } from './render.ts';
import * as platform from './platform.ts';

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const HOME = '\x1b[H';
const CLEAR_BELOW = '\x1b[0J';
const CLEAR_ALL = '\x1b[2J';

// Compose the terminal write for one frame. In steady state a redraw is just
// HOME + frame + clear-below. But on a size change (terminal resize) the previous
// frame may have had more lines — and a mid-resize size query can briefly report
// a taller terminal, so a frame can scroll the screen. A plain HOME redraw then
// leaves stale rows behind (the stacked-footer mess), which persists even after
// the size is restored. Prefix a full-screen clear whenever the size changed so
// every resize starts from a blank screen.
export function composeDraw(frame: string, resized: boolean): string {
  return (resized ? CLEAR_ALL : '') + HOME + frame + CLEAR_BELOW;
}

const CTRL_C = String.fromCharCode(3);
const ESC = String.fromCharCode(27);

export interface LiveOpts {
  interval: number;
  sort: string;
  reverse: boolean;
  demo: boolean;
}

// Run the live, top-style dashboard until the user quits.
export function runLive(opts: LiveOpts): void {
  const state = { interval: opts.interval, sort: opts.sort, reverse: opts.reverse };
  const collect = opts.demo ? demoAgents : collectAgents;

  platform.write(ALT_ON + HIDE_CURSOR);

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let lastCols = -1;
  let lastRows = -1;

  function cleanup(): void {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    platform.setRaw(false);
    platform.pauseInput();
    platform.write(SHOW_CURSOR + ALT_OFF);
  }

  function draw(): void {
    const { columns, rows } = platform.consoleSize();
    const resized = columns !== lastCols || rows !== lastRows;
    lastCols = columns;
    lastRows = rows;
    const agents = sortAgents(collect(), state.sort, state.reverse);
    const frame = buildFrame(agents, {
      width: columns,
      height: rows,
      interval: state.interval,
      sort: state.sort,
      reverse: state.reverse,
      once: false,
    });
    platform.write(composeDraw(frame, resized));
  }

  function reschedule(): void {
    if (timer) clearInterval(timer);
    timer = setInterval(draw, state.interval * 1000);
  }

  function quit(): void {
    cleanup();
    platform.exit(0);
  }

  if (platform.isTTY('stdin')) {
    platform.setRaw(true);
    platform.onKey((key) => {
      if (key === CTRL_C || key === 'q' || key === ESC) {
        quit();
      } else if (key === 's') {
        const i = SORTS.indexOf(state.sort as never);
        state.sort = SORTS[(i + 1) % SORTS.length];
        draw();
      } else if (key === 'r') {
        state.reverse = !state.reverse;
        draw();
      } else if (key === '+' || key === '=') {
        state.interval = Math.min(60, state.interval + 1);
        reschedule();
        draw();
      } else if (key === '-' || key === '_') {
        state.interval = Math.max(1, state.interval - 1);
        reschedule();
        draw();
      }
    });
  }

  platform.onSignal('SIGINT', quit);
  platform.onSignal('SIGTERM', quit);
  platform.onExit(cleanup);
  platform.onResize(draw);

  draw();
  reschedule();
}
