import { ParsedTransaction } from '../parsers/bank-parser.interface';

export interface PreprocessResult {
  readonly text: string;
  readonly transactions: ParsedTransaction[];
}

const TRANSACTION_START = /^\d{2}[./\-]\d{2}[./\-]\d{4}\s+\d{9,}/;

function isAmountTerminated(line: string): boolean {
  return /[\d,]+\.\d{2}\s*(CR|Cr|DR|Dr)?\s*$/.test(line);
}

export function preprocessCreditText(text: string): PreprocessResult {
  const lines = text.split('\n');
  const normalised: string[] = [];
  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!TRANSACTION_START.test(ln)) {
      normalised.push(ln);
      continue;
    }

    let combined = ln;
    let glued = 0;
    while (glued < 2 && !isAmountTerminated(combined)) {
      const next = lines[++i];
      if (next === undefined) break;
      combined += ' ' + next;
      glued++;
    }

    const trimmed = combined.trim();
    normalised.push(trimmed);

    const m = trimmed.match(/(\d{2}[./\-]\d{2}[./\-]\d{4})\s+(\d{9,})\s+(.+?)\s+(?:IN\s+)?(?:\d+\s+)?([\d,]+\.\d{2})\s*(CR|Cr)?\s*$/);
    if (m) {
      const [, dateStr, serial, desc, amtStr, cr] = m;
      const normalizedDate = dateStr.replace(/[.\-]/g, '/');
      const [dd, mm, yyyy] = normalizedDate.split('/').map(Number);
      if (serial.length >= 9 && serial.length <= 18) {
        transactions.push({
          serialNumber: serial,
          date: new Date(Date.UTC(yyyy, mm - 1, dd)),
          rawDescription: desc.trim(),
          amount: parseFloat(amtStr.replace(/,/g, '')),
          isCredit: /cr/i.test(cr || ''),
        });
      }
    }
  }

  return { text: normalised.join('\n'), transactions };
}
