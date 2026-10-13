import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

/** SBI savings account statement format (from SBI-STATEMENT_20-21 reference):
 *  - Header: "Account Number : <num>", "Account Statement from <date> to <date>"
 *  - Each row starts with: "DD Mon YYYY  DD Mon YYYY  <first line of description>"
 *  - Description wraps across multiple lines
 *  - Ref number is on its own line (10-13 digits)
 *  - Last line: "<amount> <balance>" (only 2 amounts, no separate debit/credit column)
 *  - "BY TRANSFER" / "CREDIT INTEREST" / "RD CLOSURE" / "INB" = credit (CR)
 *  - "TO TRANSFER" / "by debit card" / "ATM WDL" / "CASH WITHDRAWAL" = debit (DR)
 */
export class SbiSavingsParser implements IBankParser {
  readonly accountType = 'SAVINGS' as const;

  canParse(text: string): boolean {
    return (/State\s+Bank\s+of\s+India/i.test(text) || /\bSBI\b/i.test(text) || /\bSBIN\b/i.test(text))
      && /Account\s+(Number|Statement)/i.test(text);
  }

  parseMetadata(text: string): StatementMeta {
    const periodMatch = /Account\s+Statement\s+from\s+(.{10,30})\s+to\s+(.{10,30})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      periodFrom = this.parseDate(periodMatch[1]);
      periodTo = this.parseDate(periodMatch[2]);
    }

    const acctMatch = /Account\s+Number\s*:\s*(\d{8,})/i.exec(text);
    const accountLast4 = acctMatch ? acctMatch[1].slice(-4) : '';

    const openingMatch = /Balance\s+as\s+on\s+(.{10,30})\s*:\s*([\d,]+\.\d{2})/i.exec(text);
    const openingBalance = openingMatch ? parseFloat(openingMatch[2].replace(/,/g, '')) : undefined;

    return {
      bank: 'SBI',
      cardLast4: '',
      accountLast4,
      periodFrom,
      periodTo,
      statementTotal: 0,
      currency: 'INR',
      accountType: 'SAVINGS',
      openingBalance,
    };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const rawLines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const monthName = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
    // A row begins with a line like "4 Apr 2020 4 Apr 2020 <rest>"
    const rowStartRe = new RegExp(`^(\\d{1,2}\\s+${monthName}\\s+\\d{4})\\s+(\\d{1,2}\\s+${monthName}\\s+\\d{4})\\s+(.*)$`, 'i');

    const transactions: ParsedTransaction[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const ln = rawLines[i];
      const m = rowStartRe.exec(ln);
      if (!m) continue;

      const txnDateStr = m[1];
      const valueDateStr = m[2];
      const firstDescLine = m[3];

      // Collect lines until we find a line with 2 decimal amounts (amount + balance)
      let descLines: string[] = [firstDescLine];
      let amount = 0;
      let balance: number | undefined;
      let ref = '';
      for (let j = i + 1; j < rawLines.length && j < i + 30; j++) {
        const next = rawLines[j];
        const refMatch = /^(\d{10,18})$/.exec(next);
        if (refMatch && !ref) {
          ref = refMatch[1];
          continue;
        }
        const amounts = [...next.matchAll(/(-?[\d,]+\.\d{2})/g)].map((mm) => mm[1]);
        if (amounts.length >= 2) {
          // Last 2 are amount + balance
          amount = parseFloat(amounts[amounts.length - 2].replace(/,/g, ''));
          balance = parseFloat(amounts[amounts.length - 1].replace(/,/g, ''));
          i = j; // advance past
          break;
        }
        descLines.push(next);
      }
      if (amount === 0 && balance === undefined) continue;

      // Determine credit vs debit from description keywords
      const fullDesc = descLines.join(' ');
      const isCredit = this.isCreditDescription(fullDesc);

      transactions.push({
        serialNumber: ref || `${txnDateStr}-${amount}-${fullDesc.slice(0, 20)}`,
        date: this.parseDate(txnDateStr),
        valueDate: this.parseDate(valueDateStr),
        rawDescription: fullDesc,
        amount,
        isCredit,
        balanceAfter: balance,
        refNumber: ref,
      });
    }
    return transactions;
  }

  private isCreditDescription(desc: string): boolean {
    const upper = desc.toUpperCase();
    // Credit indicators
    if (/\bBY\s+TRANSFER\b/.test(upper)) return true;
    if (/\bCREDIT\s+INTEREST\b/.test(upper)) return true;
    if (/\bRD\s+CLOSURE\b/.test(upper)) return true;
    if (/\bINB\b/.test(upper) && /\bclosing\b/i.test(desc)) return true; // closing savings transfer
    // Explicit "TRANSFER FROM" (vs "TRANSFER TO")
    if (/TRANSFER\s+FROM\b/i.test(desc)) return true;
    // "ATM CASH" / "withdrawal" are debits, already excluded by the first two checks
    return false;
  }

  private parseDate(str: string): Date {
    const m = /(\d{1,2})\s+(\w{3,9})\s+(\d{4})/.exec(str);
    if (!m) return new Date(0);
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = parseInt(m[1], 10);
    const monIdx = months.findIndex((mn) => mn.startsWith(m[2].toLowerCase().slice(0, 3)));
    const year = parseInt(m[3], 10);
    return new Date(Date.UTC(year, monIdx >= 0 ? monIdx : 0, day));
  }
}