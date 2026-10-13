import { cleanSpace, normalizeAmount, normalizeToken, parseAmountToken, parseDateToken, parseMultiTokenDate, parseTimeToken, MONTH_ABBREVS, SEPARATOR_TOKENS } from './tokens';
import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

export { cleanSpace, normalizeAmount, normalizeToken, parseAmountToken, parseDateToken, parseMultiTokenDate, parseTimeToken, MONTH_ABBREVS, SEPARATOR_TOKENS };

export interface RawPage {
  text: string;
  words?: Array<{ text: string; x0?: number }>;
}

export interface ParseContext {
  fullText: string;
  pages: RawPage[];
}

export function textFromPages(pages: RawPage[]): string {
  return pages.map(p => p.text ?? '').join('\n');
}

export function isCreditByMarker(tokens: string[]): boolean {
  const upper = tokens.map(t => t.toUpperCase());
  if (upper.includes('CR') || upper.some(t => t.endsWith('CR') && t.length > 2)) return true;
  if (upper.some(t => t === '+' && upper[upper.indexOf(t) + 1] === 'CR')) return true;
  return false;
}

export function buildNarration(tokens: string[], start: number, end: number): string {
  const parts: string[] = [];
  for (let i = start; i < end && i < tokens.length; i++) {
    const t = normalizeToken(tokens[i]);
    if (!t || SEPARATOR_TOKENS.has(t) || t === '+' || t === 'l' || t === 'I' || t === 'C' || t === 'CR' || t === 'DR') continue;
    if (parseAmountToken(t) !== null) continue;
    if (parseDateToken(t) !== null) continue;
    if (parseTimeToken(t) !== null) continue;
    parts.push(t);
  }
  return cleanSpace(parts.join(' '));
}

export function extractAmount(tokens: string[], start: number, end: number): { amount: string; index: number } | null {
  for (let i = end - 1; i >= start; i--) {
    const cleaned = normalizeToken(tokens[i]).replace(/^(CR|DR|Cr|Dr|CR|Dr)$/i, '').trim();
    const amt = parseAmountToken(cleaned);
    if (amt) return { amount: normalizeAmount(amt), index: i };
  }
  return null;
}

export function assertMinLength(arr: ParsedTransaction[], min: number): asserts arr is ParsedTransaction[] {
  if (arr.length < min) throw new Error(`Expected at least ${min} parsed transactions`);
}
