import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';
import { cleanSpace, normalizeAmount, parseDateToken } from './shared-utils';

export class GenericCcParser implements IBankParser {
  readonly accountType = 'CREDIT_CARD' as const;

  canParse(text: string): boolean {
    return true;
  }

  parseMetadata(text: string): StatementMeta {
    const cardMatch = /(?:Card\s+No|Account\s+No|XXXX)[:\s]\s*([\dX\s]{6,}[\dX]{4})/i.exec(text);
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

    const totalMatch = /(?:Total\s+Amount\s+Due|Total\s+Dues|Amount\s+Due)\s*[:\-]?\s*[`\u20b9]?\s*([\d,]+\.\d{2})/i.exec(text);
    const statementTotal = totalMatch ? parseFloat(normalizeAmount(totalMatch[1]).replace(/,/g, '')) : 0;

    return { bank: 'GENERIC', cardLast4, periodFrom, periodTo, statementTotal, currency: 'INR', accountType: 'CREDIT_CARD' };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const re = /^(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR|Cr|DR|Dr)?\s*$/gm;
    const transactions: ParsedTransaction[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const [, dateStr, desc, amtStr, cr] = m;
      const normalizedDate = dateStr.replace(/[.\-]/g, '/');
      const parts = normalizedDate.split('/');
      const dd = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10) - 1;
      let yy = parseInt(parts[2], 10);
      if (yy < 100) yy += yy < 50 ? 2000 : 1900;
      transactions.push({
        serialNumber: `${normalizedDate}-${cleanSpace(desc).replace(/\s+/g, ' ').trim().slice(0, 20)}`,
        date: new Date(Date.UTC(yy, mm, dd)),
        rawDescription: cleanSpace(desc).trim(),
        amount: parseFloat(amtStr.replace(/,/g, '')),
        isCredit: Boolean(cr && /cr/i.test(cr)),
      });
    }
    return transactions;
  }
}
