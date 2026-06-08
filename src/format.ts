import c from './colors.ts';

// claude-opus-4-8 -> opus-4-8 ; claude-haiku-4-5-20251001 -> haiku-4-5 ;
// gemini-3-flash-preview -> gemini-3-flash
export function shortModel(model: string | null | undefined): string {
  if (!model) return '?';
  return String(model)
    .replace(/^claude-/, '')
    .replace(/-\d{8}$/, '') // drop trailing date stamp
    .replace(/-(preview|exp|latest)$/, '') // drop channel suffixes
    .replace(/\[1m\]$/, ''); // drop context-window suffix
}

// Parse ps ELAPSED format ([[DD-]HH:]MM:SS) into seconds.
export function parseEtime(etime: string): number {
  if (!etime) return 0;
  let days = 0;
  let rest = etime;
  if (rest.includes('-')) {
    const [d, r] = rest.split('-');
    days = parseInt(d, 10) || 0;
    rest = r;
  }
  const parts = rest.split(':').map((n) => parseInt(n, 10) || 0);
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) [h, m, s] = parts;
  else if (parts.length === 2) [m, s] = parts;
  else [s] = parts;
  return days * 86400 + h * 3600 + m * 60 + s;
}

// Compact duration: 9s, 3m, 1h12, 2d3h
export function dur(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds)) return '-';
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  if (h < 24) return remM ? `${h}h${String(remM).padStart(2, '0')}` : `${h}h`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d}d${remH}h` : `${d}d`;
}

// KB (as reported by ps rss) -> human readable.
export function memFromKb(kb: number | null | undefined): string {
  if (kb == null) return '-';
  return bytes2human(kb * 1024);
}

export function bytes2human(bytes: number): string {
  const units = ['B', 'K', 'M', 'G', 'T'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  const val = n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1);
  return `${val}${units[i]}`;
}

// Pad/truncate a string to an exact visible width (ANSI-aware).
export function fit(str: unknown, width: number, align: 'left' | 'right' = 'left'): string {
  const s = str == null ? '' : String(str);
  const w = c.width(s);
  if (w === width) return s;
  if (w > width) {
    // Truncate raw text (assumes no color in truncated cells; we color after fit).
    const plain = c.strip(s);
    if (width <= 1) return plain.slice(0, width);
    return plain.slice(0, width - 1) + '…';
  }
  const pad = ' '.repeat(width - w);
  return align === 'right' ? pad + s : s + pad;
}
