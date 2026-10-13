import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';
import { cleanSpace, normalizeAmount, parseAmountToken, parseDateToken } from './shared-utils';

export class IndusindParser implements IBankParser {
  readonly accountType = 'CREDIT_CARD' as const;

  canParse(text: string): boolean {
    return /INDUSIND\s+BANK/i.test(text.slice(0, 3000));
  }

  parseMetadata(text: string): StatementMeta {
    const cardMatch = /(?:Card\s+No|Account\s+No)[:\s]\s*([\dX\s]{6,}[\dX]{4})/i.exec(text);
    const cardLast4 = cardMatch ? cardMatch[1].replace(/\s+/g, '').slice(-4) : '';

    const periodMatch = /Statement\s+(?:Period|Date)\s*[:\-]?\s*(.{6,12})\s*to\s*(.{6,12})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      const from = parseDateToken(periodMatch[1].trim());
      const to = parseDateToken(periodMatch[2].trim());
      if (from) periodFrom = new Date(from + 'T00:00:00');
      if (to) periodTo = new Date(to + 'T23:59:59');
    }

    const totalMatch = /(?:Total\s+Amount\s+Due|Total\s+Dues)\s*[:\-]?\s*[`\u20b9]?\s*([\d,]+\.\d{2})/i.exec(text);
    const statementTotal = totalMatch ? parseFloat(normalizeAmount(totalMatch[1]).replace(/,/g, '')) : 0;

    return { bank: 'INDUSIND', cardLast4, periodFrom, periodTo, statementTotal, currency: 'INR', accountType: 'CREDIT_CARD' };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const transactions: ParsedTransaction[] = [];

    for (const rawLine of lines) {
      const line = cleanSpace(rawLine);
      if (!line) continue;

      const tokens = line.split(/\s+/);
      const dateStr = parseDateToken(tokens[0]);
      if (!dateStr) continue;

      const [dd, mm, yyyy] = dateStr.split('/').map(Number);
      const date = new Date(Date.UTC(yyyy, mm - 1, dd));

      const amountResult = extractAmountFromTokens(tokens, 1);
      if (!amountResult) continue;

      const narration = buildNarration(tokens, 1, amountResult.index);
      const isCredit = /cr$/i.test(tokens[tokens.length - 1] || '');

      transactions.push({
        serialNumber: `${dateStr}-${tokens[1] || ''}`,
        date,
        rawDescription: narration,
        amount: amountResult.amount,
        isCredit,
      });
    }

    return transactions;
  }
}

function extractAmountFromTokens(tokens: string[], start: number): { amount: number; index: number } | null {
  for (let i = tokens.length - 1; i >= start; i--) {
    const cleaned = tokens[i].replace(/^(CR|DR|Cr|Dr)$/i, '').trim();
    const amt = parseAmountToken(cleaned);
    if (amt) return { amount: parseFloat(normalizeAmount(amt).replace(/,/g, '')), index: i };
  }
  return null;
}

function buildNarration(tokens: string[], start: number, end: number): string {
  const parts: string[] = [];
  for (let i = start; i < end && i < tokens.length; i++) {
    const t = tokens[i].replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (/^(CR|DR|Cr|Dr|INR|Rs)$/i.test(t)) continue;
    if (parseAmountToken(t) !== null) continue;
    if (parseDateToken(t) !== null) continue;
    parts.push(t);
  }
  return parts.join(' ');
}
