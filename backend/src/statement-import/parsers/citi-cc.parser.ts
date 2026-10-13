import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

/** Citibank credit card statement format (from CreditCard_APR_2021 reference):
 *  - Header: "CITIBANK", "Statement Period: <from> to <to>"
 *  - Card: "************3459"
 *  - Transactions: "DD/MM  <refno>  <merchant city>  <amount> [CR]"
 */
export class CitiCcParser implements IBankParser {
  readonly accountType = 'CREDIT_CARD' as const;

  canParse(text: string): boolean {
    return /CITIBANK/i.test(text.slice(0, 4000)) && /Statement\s*Period/i.test(text);
  }

  parseMetadata(text: string): StatementMeta {
    const cardMatch = /(\*{4,}\d{4})|(\d{4}\*{6,}\d{4})/.exec(text);
    let cardLast4 = '';
    if (cardMatch) {
      const digits = cardMatch[1] ?? cardMatch[2] ?? '';
      const tail = digits.match(/(\d{4})\s*$/);
      cardLast4 = tail ? tail[1] : '';
    }

    const periodMatch = /Statement\s*Period\s*[:\-]?\s*(.{10,30})\s*to\s*(.{10,30})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      periodFrom = this.looseDate(periodMatch[1]);
      periodTo = this.looseDate(periodMatch[2]);
    }

    const totalMatch = /Total\s+Amount\s+Due\s*[:\-]?\s*Rs?\.\s*([\d,]+\.\d{2})/i.exec(text);
    const statementTotal = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;

    return { bank: 'CITI', cardLast4, periodFrom, periodTo, statementTotal, currency: 'INR', accountType: 'CREDIT_CARD' };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const lines = text.split('\n');
    const normalised: string[] = [];
    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed) continue;
      const startsWithTxn = /^\d{2}\/\d{2}\b/.test(trimmed);
      const last = normalised[normalised.length - 1];
      if (startsWithTxn) {
        normalised.push(trimmed);
      } else if (last && !/[\d,]+\.\d{2}\s*(CR|DR)?\s*$/i.test(last)) {
        normalised[normalised.length - 1] = last + ' ' + trimmed;
      }
    }

    const re = /^(\d{2}\/\d{2})\s+([A-Z0-9]{9,16})\s+(.+?)\s+([\d,]+\.\d{2})\s*(CR|DR|Dr|Cr)?\s*$/;
    const transactions: ParsedTransaction[] = [];
    for (const ln of normalised) {
      const m = re.exec(ln);
      if (!m) continue;
      const [, ddmm, serial, desc, amtStr, cr] = m;
      const [dd, mm] = ddmm.split('/').map(Number);
      // Year: use periodTo's year if available, else current - 1
      const year = this.statementYear;
      transactions.push({
        serialNumber: serial,
        date: new Date(Date.UTC(year, mm - 1, dd)),
        rawDescription: desc.trim(),
        amount: parseFloat(amtStr.replace(/,/g, '')),
        isCredit: Boolean(cr && /cr/i.test(cr)),
      });
    }
    return transactions;
  }

  private statementYear: number;
  constructor() {
    this.statementYear = new Date().getUTCFullYear();
  }

  private looseDate(str: string): Date {
    const m = /(\d{1,2})\s*(\w{3,9})\s*,?\s*(\d{4})/.exec(str);
    if (!m) return new Date(0);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = parseInt(m[1], 10);
    const monIdx = months.findIndex((mn) => mn.startsWith(m[2].toLowerCase().slice(0, 3)));
    const year = parseInt(m[3], 10);
    this.statementYear = year;
    return new Date(Date.UTC(year, monIdx >= 0 ? monIdx : 0, day));
  }
}