'use strict';

const { collectAgents } = require('./collect');
const { buildFrame, sortAgents, SORTS } = require('./render');

const ALT_ON = '\x1b[?1049h';
const ALT_OFF = '\x1b[?1049l';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const HOME = '\x1b[H';
const CLEAR_BELOW = '\x1b[0J';

const CTRL_C = String.fromCharCode(3);
const ESC = String.fromCharCode(27);

// Run the live, top-style dashboard until the user quits.
function runLive(opts) {
  const state = {
    interval: opts.interval,
    sort: opts.sort,
    reverse: opts.reverse,
  };

  const out = process.stdout;
  out.write(ALT_ON + HIDE_CURSOR);

  let timer = null;
  let stopped = false;

  function cleanup() {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch (e) {
        /* ignore */
      }
    }
    process.stdin.pause();
    out.write(SHOW_CURSOR + ALT_OFF);
  }

  function draw() {
    const agents = sortAgents(collectAgents(), state.sort, state.reverse);
    const frame = buildFrame(agents, {
      width: out.columns,
      height: out.rows,
      interval: state.interval,
      sort: state.sort,
      reverse: state.reverse,
      once: false,
    });
    out.write(HOME + frame + CLEAR_BELOW);
  }

  function reschedule() {
    if (timer) clearInterval(timer);
    timer = setInterval(draw, state.interval * 1000);
  }

  // Keyboard handling (raw mode).
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (data) => {
      const key = data.toString();
      if (key === CTRL_C || key === 'q' || key === ESC) {
        cleanup();
        process.exit(0);
      } else if (key === 's') {
        const i = SORTS.indexOf(state.sort);
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

  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);
  out.on('resize', draw);

  draw();
  reschedule();
}

module.exports = { runLive };
