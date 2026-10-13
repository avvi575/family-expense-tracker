import { createHash } from 'crypto';
import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

/** Generic fallback parser for savings/current account statements.
 *  Assumes rows of: DD/MM/YYYY <description> <amount> [CR/DR]
 *  Heuristically detects DR vs CR by amount sign or marker.
 */
export class GenericSavingsParser implements IBankParser {
  readonly accountType = 'SAVINGS' as const;

  canParse(text: string): boolean {
    return text.length > 0;
  }

  parseMetadata(text: string): StatementMeta {
    const periodMatch = /From\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s+(?:to|-)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      periodFrom = this.parseDate(periodMatch[1]);
      periodTo = this.parseDate(periodMatch[2]);
    }

    const acctMatch = /(?:Account|A\/c|A\/c\.)\s*(?:No|Number)?\s*[:\-]?\s*(\d{6,})/i.exec(text);
    const accountLast4 = acctMatch ? acctMatch[1].slice(-4) : '';

    const openMatch = /Opening\s+Balance\s*[:\-]?\s*[`\u20b9]?\s*([\d,]+\.\d{2})/i.exec(text);
    const closeMatch = /Closing\s+Balance\s*[:\-]?\s*[`\u20b9]?\s*([\d,]+\.\d{2})/i.exec(text);

    return {
      bank: 'UNKNOWN',
      cardLast4: '',
      accountLast4,
      periodFrom,
      periodTo,
      statementTotal: 0,
      currency: 'INR',
      accountType: 'SAVINGS',
      openingBalance: openMatch ? parseFloat(openMatch[1].replace(/,/g, '')) : undefined,
      closingBalance: closeMatch ? parseFloat(closeMatch[1].replace(/,/g, '')) : undefined,
    };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const re = /^(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*(CR|CR\.|DR|DR\.|Cr|Dr|cr|dr)?\s*$/gm;
    const transactions: ParsedTransaction[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const [dateStr, desc, amtStr, cr] = [m[1], m[2], m[3], m[4]];
      const date = this.parseDate(dateStr);
      const amount = parseFloat(amtStr.replace(/,/g, ''));
      const serialSource = `${dateStr}|${desc}|${amtStr}`;
      const serialNumber = createHash('sha1').update(serialSource).digest('hex').slice(0, 16);
      transactions.push({
        serialNumber,
        date,
        rawDescription: desc.trim(),
        amount: Math.abs(amount),
        isCredit: Boolean(cr && /cr/i.test(cr)),
      });
    }
    return transactions;
  }

  private parseDate(str: string): Date {
    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(str.trim());
    if (!m) return new Date(0);
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1;
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += yy < 50 ? 2000 : 1900;
    return new Date(Date.UTC(yy, mm, dd));
  }
}