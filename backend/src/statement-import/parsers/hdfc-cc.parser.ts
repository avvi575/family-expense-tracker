import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

/** HDFC Bank Credit Card statement format:
 *  - Header contains "HDFC BANK" + "Credit Card Statement" / "Statement for HDFC Credit Card"
 *  - Transactions: "DD/MM/YYYY  <ref>  <merchant>  <amount> [CR]"
 *    (often split across multiple lines due to PDF reflow)
 */
export class HdfcCcParser implements IBankParser {
  readonly accountType = 'CREDIT_CARD' as const;

  canParse(text: string): boolean {
    return /HDFC\s*BANK/i.test(text.slice(0, 4000));
  }

  parseMetadata(text: string): StatementMeta {
    const cardMatch = /(\d{4})\s*X{4,}\s*(\d{4})/.exec(text);
    const cardLast4 = cardMatch ? cardMatch[2] : '';

    const periodMatch = /Statement\s*(?:period|from)\s*[:\-]?\s*(.{10,30})\s*(?:to|-)\s*(.{10,30})/i.exec(text)
      ?? /From\s+(.{10,24})\s+to\s+(.{10,24})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      periodFrom = this.looseDate(periodMatch[1]);
      periodTo = this.looseDate(periodMatch[2]);
    }

    const totalMatch = /Total\s+(?:Amount\s+)?Due\s*[:\-]?\s*[`\u20b9]?\s*([\d,]+\.\d{2})/i.exec(text);
    const statementTotal = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;

    return { bank: 'HDFC', cardLast4, periodFrom, periodTo, statementTotal, currency: 'INR', accountType: 'CREDIT_CARD' };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    // Glue continuation lines: any line that does NOT start with a date and
    // does not contain a trailing amount (decimal) is part of the previous row.
    const normalised: string[] = [];
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed) continue;
      const startsWithDate = /^\d{2}[./\-]\d{2}[./\-]\d{4}/.test(trimmed);
      const last = normalised[normalised.length - 1];
      if (startsWithDate) {
        normalised.push(trimmed);
      } else if (last && !/[\d,]+\.\d{2}\s*(CR|DR)?\s*$/.test(last)) {
        normalised[normalised.length - 1] = last + ' ' + trimmed;
      } else if (last) {
        normalised[normalised.length - 1] = last + ' ' + trimmed;
      }
    }

    const re = /^(\d{2}[./\-]\d{2}[./\-]\d{4})\s+(\d{9,16})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR|DR|Dr|Cr)?\s*$/;
    const transactions: ParsedTransaction[] = [];
    for (const ln of normalised) {
      const m = re.exec(ln);
      if (!m) continue;
      const [, dateStr, serial, desc, amtStr, cr] = m;
      const normalizedDate = dateStr.replace(/[.\-]/g, '/');
      const [dd, mm, yyyy] = normalizedDate.split('/').map(Number);
      transactions.push({
        serialNumber: serial,
        date: new Date(Date.UTC(yyyy, mm - 1, dd)),
        rawDescription: desc.trim(),
        amount: parseFloat(amtStr.replace(/,/g, '')),
        isCredit: Boolean(cr && /cr/i.test(cr)),
      });
    }
    return transactions;
  }

  private looseDate(str: string): Date {
    const m = /(\d{1,2})\s*(\w{3,9})\s*,?\s*(\d{4})/.exec(str);
    if (!m) return new Date(0);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = parseInt(m[1], 10);
    const monIdx = months.findIndex((mn) => mn.startsWith(m[2].toLowerCase().slice(0, 3)));
    const year = parseInt(m[3], 10);
    return new Date(Date.UTC(year, monIdx >= 0 ? monIdx : 0, day));
  }
}