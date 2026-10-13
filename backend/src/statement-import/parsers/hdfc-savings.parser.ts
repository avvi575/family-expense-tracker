import { IBankParser, ParsedTransaction, StatementMeta } from './bank-parser.interface';

/** HDFC Bank savings/current account statement format (from 66858960 reference):
 *  - Header: "HDFC BANK LIMITED", "Statement of account From: DD/MM/YYYY To: DD/MM/YYYY"
 *  - Account last4 from masked account number
 *  - Transactions: "DD/MM/YY  <narration>\n<ref number>  DD/MM/YY  <withdrawal>  <deposit>  <balance>"
 *    Narration often wraps across multiple lines. Withdrawal+deposit+balance are 2-3 trailing amounts.
 */
export class HdfcSavingsParser implements IBankParser {
  readonly accountType = 'SAVINGS' as const;

  canParse(text: string): boolean {
    return /HDFC\s*BANK/i.test(text.slice(0, 4000)) && /Statement\s+of\s+account/i.test(text);
  }

  parseMetadata(text: string): StatementMeta {
    const periodMatch = /Statement\s+of\s+account\s+From\s*:\s*(\d{2}\/\d{2}\/\d{4})\s+To\s*:\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
    let periodFrom = new Date(0);
    let periodTo = new Date(0);
    if (periodMatch) {
      periodFrom = this.parseDate(periodMatch[1]);
      periodTo = this.parseDate(periodMatch[2]);
    }

    const acctMatch = /Account\s+No\s*:\s*(\d{6,})/i.exec(text);
    const accountLast4 = acctMatch ? acctMatch[1].slice(-4) : '';

    let openingBalance: number | undefined;
    let closingBalance: number | undefined;
    const summaryMatch = /Opening\s+Balance[^0-9]*([\d,]+\.\d{2})/i.exec(text);
    if (summaryMatch) openingBalance = parseFloat(summaryMatch[1].replace(/,/g, ''));
    const closingMatch = /Closing\s+Bal[^0-9]*([\d,]+\.\d{2})/i.exec(text);
    if (closingMatch) closingBalance = parseFloat(closingMatch[1].replace(/,/g, ''));

    return {
      bank: 'HDFC',
      cardLast4: '',
      accountLast4,
      periodFrom,
      periodTo,
      statementTotal: 0,
      currency: 'INR',
      accountType: 'SAVINGS',
      openingBalance,
      closingBalance,
    };
  }

  parseTransactions(text: string): ParsedTransaction[] {
    const summaryMatch = /Opening\s+Balance[^0-9]*([\d,]+\.\d{2})/i.exec(text);
    let runningBalance = summaryMatch ? parseFloat(summaryMatch[1].replace(/,/g, '')) : undefined;

    const lines = text.split('\n');
    const blocks: string[][] = [];
    let current: string[] = [];

    const isSummaryLine = (line: string): boolean => {
      const upper = line.toUpperCase();
      if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(line)) return true;
      if (/PAGE\s+NO/.test(upper)) return true;
      if (/OPENING\s+BALANCE|CLOSING\s+BAL|DR\s+COUNT|CR\s+COUNT|DEBITS|CREDITS/.test(upper)) return true;
      if (/GENERATED\s+ON|GENERATED\s+BY|COMPUTER\s+GENERATED/.test(upper)) return true;
      if (/^\^TOP$/.test(upper)) return true;
      const amtMatches = line.match(/[\d,]+\.\d{2}/g);
      if (amtMatches && amtMatches.length >= 4) return true;
      return false;
    };

    for (const ln of lines) {
      const trimmed = ln.trim();
      if (!trimmed) continue;
      if (isSummaryLine(trimmed)) {
        if (current.length > 0) blocks.push(current);
        current = [];
        continue;
      }
      if (/^\d{2}\/\d{2}\/\d{2}\b/.test(trimmed)) {
        if (current.length > 0) blocks.push(current);
        current = [trimmed];
      } else if (trimmed) {
        current.push(trimmed);
      }
    }
    if (current.length > 0) blocks.push(current);

    const transactions: ParsedTransaction[] = [];
    for (const block of blocks) {
      const joined = block.join(' ');

      const txnDateMatch = /^(\d{2}\/\d{2}\/\d{2})/.exec(joined);
      if (!txnDateMatch) continue;
      const txnDate = txnDateMatch[1];

      const afterTxn = joined.slice(txnDate.length).trim();
      const valueDateMatch = /(\d{2}\/\d{2}\/\d{2})/.exec(afterTxn);
      if (!valueDateMatch) continue;
      const valueDate = valueDateMatch[1];
      const tail = afterTxn.slice(valueDateMatch.index! + valueDate.length).trim();

      const amts = [...tail.matchAll(/(-?[\d,]+\.\d{2})/g)].map((m) => m[1]);
      if (amts.length < 2) continue;

      const middle = afterTxn.slice(0, valueDateMatch.index).trim();

      let withdrawal = 0, deposit = 0, closing = 0;
      const lastAmts = amts.slice(-3);
      if (lastAmts.length === 3) {
        withdrawal = parseFloat(lastAmts[0].replace(/,/g, ''));
        deposit = parseFloat(lastAmts[1].replace(/,/g, ''));
        closing = parseFloat(lastAmts[2].replace(/,/g, ''));
      } else if (lastAmts.length === 2) {
        const a = parseFloat(lastAmts[0].replace(/,/g, ''));
        const c = parseFloat(lastAmts[1].replace(/,/g, ''));
        closing = c;
        if (runningBalance !== undefined) {
          const creditMatch = Math.abs(runningBalance + a - c) < 0.01;
          const debitMatch = Math.abs(runningBalance - a - c) < 0.01;
          if (creditMatch && !debitMatch) {
            deposit = a;
          } else if (debitMatch && !creditMatch) {
            withdrawal = a;
          } else if (this.isCreditDescription(middle + ' ' + tail)) {
            deposit = a;
          } else {
            withdrawal = a;
          }
        } else if (this.isCreditDescription(middle + ' ' + tail)) {
          deposit = a;
        } else {
          withdrawal = a;
        }
      }
      const isCredit = deposit > 0 && withdrawal === 0;
      const amount = isCredit ? deposit : withdrawal;

      if (!isNaN(closing)) {
        runningBalance = closing;
      }

      const refMatch = /(\d{10,18})/.exec(joined);
      const refNumber = refMatch ? refMatch[1] : '';
      const desc = middle.replace(/\s*\d{10,18}\s*$/, '').trim();

      transactions.push({
        serialNumber: refNumber || `${txnDate}-${amount}-${desc.slice(0, 20)}`,
        date: this.parseDate(txnDate),
        valueDate: this.parseDate(valueDate),
        rawDescription: desc,
        amount,
        isCredit,
        balanceAfter: closing,
        refNumber,
      });
    }
    return transactions;
  }

  private parseDate(str: string): Date {
    const m = /^(\d{2})\/(\d{2})\/(\d{2,4})$/.exec(str.trim());
    if (!m) return new Date(0);
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1;
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += yy < 50 ? 2000 : 1900;
    return new Date(Date.UTC(yy, mm, dd));
  }

  private isCreditDescription(text: string): boolean {
    const upper = text.toUpperCase();
    if (/\bCREDIT\b/.test(upper)) return true;
    if (/\bINTEREST\b/.test(upper)) return true;
    if (/\bCLOSURE\b/.test(upper)) return true;
    if (/RD\s+CLOSURE/i.test(upper)) return true;
    if (/\bREFUND\b/i.test(upper)) return true;
    if (/\bRECEIVED\b/i.test(upper)) return true;
    if (/TRANSFER\s+FROM\b/i.test(text)) return true;
    return false;
  }
}