import assert from 'node:assert/strict';
import { composeDraw } from '../src/ui.ts';

const CLEAR_ALL = '\x1b[2J';
const HOME = '\x1b[H';

Deno.test('composeDraw prefixes a full-screen clear only when the size changed', () => {
  const frame = 'HEADER\nrow1\nrow2';

  // Steady state: no full clear (would flicker); just reposition + redraw.
  const steady = composeDraw(frame, false);
  assert.ok(!steady.includes(CLEAR_ALL), 'steady-state draw must not clear the whole screen');
  assert.ok(steady.startsWith(HOME));
  assert.ok(steady.includes(frame));

  // On resize: a full clear comes first so a scrolled/taller prior frame can't
  // leave stale rows behind (the stacked-footer mess).
  const resized = composeDraw(frame, true);
  assert.ok(resized.startsWith(CLEAR_ALL), 'resize draw must clear the screen first');
  assert.ok(resized.indexOf(CLEAR_ALL) < resized.indexOf(HOME));
  assert.ok(resized.includes(frame));
});
