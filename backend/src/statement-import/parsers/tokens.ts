export function cleanSpace(value: string): string {
  return value.split(/\s+/).filter(Boolean).join(' ').trim();
}

export function normalizeToken(token: string): string {
  return token.trim().replace(/^\|+|\|+$/g, '');
}

export function normalizeAmount(value: string): string {
  return value.replace(/[`\u20b9]/g, '').trim();
}

export function parseAmountToken(token: string): string | null {
  const cleaned = normalizeToken(token).replace(/[`\u20b9]/g, '').trim();
  const match = /[-+]?\d[\d,]*\.\d{2}/.exec(cleaned);
  return match ? match[0] : null;
}

export function parseDateToken(token: string): string | null {
  const cleaned = normalizeToken(token).replace(/[.\-]/g, '/');
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(cleaned);
  if (match) return cleaned;
  return null;
}

export function parseMultiTokenDate(tokens: string[], start: number): [string | null, number] {
  if (start + 2 >= tokens.length) return [null, 0];
  const raw = tokens.slice(start, start + 3).join(' ').replace(/[.\-]/g, '/');
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw);
  if (match) return [raw, 3];
  return [null, 0];
}

export function parseTimeToken(token: string): string | null {
  const cleaned = normalizeToken(token);
  return /^\d{1,2}:\d{2}(?::\d{2})?$/.test(cleaned) ? cleaned : null;
}

export const MONTH_ABBREVS: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

export const SEPARATOR_TOKENS = new Set(['|', '||', ':', '-', '--']);
