import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

/** ICICI Bank CC statement format */
export class IciciParser implements IBankParser {
  readonly accountType = 'CREDIT_CARD' as const;

  canParse(text: string): boolean {
    return /ICICI/i.test(text.slice(0, 2000));
  }

  parseMetadata(text: string): StatementMeta {
    const cardMatch = /(\d{4})XXXXXXXX(\d{4})/.exec(text);
    const cardLast4 = cardMatch ? cardMatch[2] : '';

    const periodMatch = /Statement period\s*:\s*(\w+ \d+, \d{4}) to (\w+ \d+, \d{4})/i.exec(text);
    const periodFrom = periodMatch ? new Date(`${periodMatch[1]} 00:00`) : new Date(0);
    const periodTo = periodMatch ? new Date(`${periodMatch[2]} 23:59:59`) : new Date(0);

    const headerRe = /Previous Balance.*?Purchases\s*\/\s*Charges.*?Cash Advances.*?Payments\s*\/\s*Credits/is;
    let statementTotal = 0;
    const headerMatch = text.match(headerRe);
    if (headerMatch) {
      const after = text.slice(headerMatch.index! + headerMatch[0].length, headerMatch.index! + headerMatch[0].length + 400);
      const amountsRe = /([\d,]+\.\d{2})/g;
      const amounts = [...after.matchAll(amountsRe)].map((m) => parseFloat(m[1].replace(/,/g, '')));
      if (amounts.length >= 2) statementTotal = amounts[1]; // 2nd amount = Purchases/Charges
    }

    return { bank: 'ICICI', cardLast4, periodFrom, periodTo, statementTotal, currency: 'INR', accountType: 'CREDIT_CARD' };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    /* Normalise multi-line UPI rows first: when a UPI line ends with a truncated
       description (no trailing "IN" flag, no reward points, no amount), the
       continuation is on the next line(s): first "IN" (or "KOMPAL IN"),
       then "<pts> <amount> [CR]".
       Strategy: iterate over lines; if the line starts a transaction but is
       incomplete, glue it with the next 1–2 lines until it matches. */
    const lines = text.split('\n');
    const normalised: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      // bare transaction start without terminal amount at the end
      const startsTxn = /^\d{2}[./\-]\d{2}[./\-]\d{4}\s+\d{9,}/.test(ln);
      const endsWithAmt = /[\d,]+\.\d{2}\s*(CR|Cr|DR|Dr|DR|Dr|DR|Dr)?\s*$/.test(ln);
      if (startsTxn && !endsWithAmt) {
        // glue up to 2 extra lines to complete the row
        let combined = ln;
        let ends = 0;
        while (ends < 2 && !/[\d,]+\.\d{2}\s*(CR|Cr|DR|Dr|DR|Dr|DR|Dr)?\s*$/.test(combined)) {
          combined += ' ' + (lines[++i] ?? '');
          ends++;
        }
        normalised.push(combined.trim());
      } else {
        normalised.push(ln);
      }
    }

    const re = /(\d{2}[./\-]\d{2}[./\-]\d{4})\s+(\d{9,})\s+(.+?)\s+(?:IN\s+)?(?:\d+\s+)?([\d,]+\.\d{2})\s*(CR|Cr)?\s*$/gm;
    const transactions: ParsedTransaction[] = [];
    for (const ln of normalised) {
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(ln)) !== null) {
        const [, dateStr, serial, desc, amtStr, cr] = m;
        const normalizedDate = dateStr.replace(/[.\-]/g, '/');
        const [dd, mm, yyyy] = normalizedDate.split('/').map(Number);
        if (serial.length < 9 || serial.length > 18) continue;
        transactions.push({
          serialNumber: serial,
          date: new Date(Date.UTC(yyyy, mm - 1, dd)),
          rawDescription: desc.trim(),
          amount: parseFloat(amtStr.replace(/,/g, '')),
          isCredit: /cr/i.test(cr || ''),
        });
        if (!re.exec(ln)) break;
      }
    }
    return transactions;
  }
}
