import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';
import { cleanSpace, normalizeAmount, parseAmountToken, parseDateToken, parseMultiTokenDate, buildNarration, isCreditByMarker, normalizeToken } from './shared-utils';

export class IdbcParser implements IBankParser {
  readonly accountType = 'CREDIT_CARD' as const;

  canParse(text: string): boolean {
    return /IDBC|IDFC/i.test(text.slice(0, 3000));
  }

  parseMetadata(text: string): StatementMeta {
    const cardMatch = /(\d{4})\s*X{8}\s*(\d{4})/i.exec(text) || /(\d{4})\*{8}(\d{4})/i.exec(text);
    const cardLast4 = cardMatch ? cardMatch[2] : '';

    const periodMatch = /Statement\s+Period\s*[:\-]?\s*(.{10,30})\s*to\s*(.{10,30})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      const from = parseDateToken(periodMatch[1].trim());
      const to = parseDateToken(periodMatch[2].trim());
      if (from) periodFrom = new Date(from + 'T00:00:00');
      if (to) periodTo = new Date(to + 'T23:59:59');
    }

    const totalMatch = /Total\s+Amount\s+Due\s*[:\-]?\s*[`\u20b9]?\s*([\d,]+\.\d{2})/i.exec(text);
    const statementTotal = totalMatch ? parseFloat(normalizeAmount(totalMatch[1]).replace(/,/g, '')) : 0;

    return { bank: 'IDFC', cardLast4, periodFrom, periodTo, statementTotal, currency: 'INR', accountType: 'CREDIT_CARD' };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const transactions: ParsedTransaction[] = [];

    for (const rawLine of lines) {
      const line = cleanSpace(rawLine);
      if (!line) continue;

      const tokens = line.split(/\s+/);
      const dateMatch = parseMultiTokenDate(tokens, 0);
      if (!dateMatch[0]) continue;

      const dateStr = dateMatch[0];
      const [dd, mm, yyyy] = dateStr.split('/').map(Number);
      const date = new Date(Date.UTC(yyyy, mm - 1, dd));

      const amountResult = extractAmountFromTokens(tokens, dateMatch[1]);
      if (!amountResult) continue;

      const narration = buildNarration(tokens, dateMatch[1], amountResult.index);
      const isCredit = isCreditByMarker(tokens);

      transactions.push({
        serialNumber: `${dateStr}-${tokens.slice(1, 4).join('-')}`,
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
    const cleaned = normalizeToken(tokens[i]).replace(/^(CR|DR|Cr|Dr)$/i, '').trim();
    const amt = parseAmountToken(cleaned);
    if (amt) {
      return { amount: parseFloat(normalizeAmount(amt).replace(/,/g, '')), index: i };
    }
  }
  return null;
}
