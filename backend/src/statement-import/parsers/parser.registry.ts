import { IBankParser } from './bank-parser.interface';
import { IciciParser } from './icici.parser';
import { HdfcCcParser } from './hdfc-cc.parser';
import { CitiCcParser } from './citi-cc.parser';
import { GenericCcParser } from './generic.parser';
import { GenericSavingsParser } from './generic-savings.parser';
import { HdfcSavingsParser } from './hdfc-savings.parser';
import { SbiSavingsParser } from './sbi-savings.parser';
import { HdfcParser } from './hdfc.parser';
import { SbiParser } from './sbi.parser';
import { IdbcParser } from './idfc.parser';
import { AxisParser } from './axis.parser';
import { HsbcParser } from './hsbc.parser';
import { IndusindParser } from './indusind.parser';
import { JupiterParser } from './jupiter.parser';
import { SliceParser } from './slice.parser';
import { SsfbParser } from './ssfb.parser';
import { BobParser } from './bob.parser';
import { YesbankParser } from './yesbank.parser';
import { EquitasParser } from './equitas.parser';

// Order matters: more specific bank parsers first; generic fallbacks last.
const CREDIT_CARD_PARSERS: IBankParser[] = [
  new IciciParser(),
  new HdfcParser(),
  new HdfcCcParser(),
  new SbiParser(),
  new IdbcParser(),
  new AxisParser(),
  new HsbcParser(),
  new IndusindParser(),
  new JupiterParser(),
  new SliceParser(),
  new SsfbParser(),
  new BobParser(),
  new YesbankParser(),
  new EquitasParser(),
  new CitiCcParser(),
  new GenericCcParser(),
];

const SAVINGS_PARSERS: IBankParser[] = [
  new HdfcSavingsParser(),
  new SbiSavingsParser(),
  new GenericSavingsParser(),
];

/** Find the first parser that claims to handle the given text for the account type.
 *  accountType === undefined → try CC parsers then savings parsers.
 */
export function detectParser(text: string, accountType?: 'CREDIT_CARD' | 'SAVINGS'): IBankParser {
  if (accountType === 'SAVINGS') {
    return SAVINGS_PARSERS.find((p) => p.canParse(text)) ?? new GenericSavingsParser();
  }
  if (accountType === 'CREDIT_CARD') {
    return CREDIT_CARD_PARSERS.find((p) => p.canParse(text)) ?? new GenericCcParser();
  }
  // unspecified: prefer credit card parsers first; if none claims it, try savings
  const cc = CREDIT_CARD_PARSERS.slice(0, -1).find((p) => p.canParse(text));
  if (cc) return cc;
  const sv = SAVINGS_PARSERS.slice(0, -1).find((p) => p.canParse(text));
  if (sv) return sv;
  return new GenericCcParser();
}
