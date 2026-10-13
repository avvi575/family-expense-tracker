export interface ParsedTransaction {
  serialNumber: string;
  date: Date;
  valueDate?: Date;
  rawDescription: string;
  amount: number;
  isCredit: boolean;
  balanceAfter?: number;
  refNumber?: string;
}

export interface StatementMeta {
  bank: string;
  cardLast4: string;
  accountLast4?: string;
  periodFrom: Date;
  periodTo: Date;
  statementTotal: number;
  currency: string;
  accountType: 'CREDIT_CARD' | 'SAVINGS' | 'CURRENT';
  openingBalance?: number;
  closingBalance?: number;
}

export interface IBankParser {
  canParse(text: string): boolean;
  parseMetadata(text: string): StatementMeta;
  parseTransactions(text: string): ParsedTransaction[];
  /** Whether this parser targets credit card statements (vs savings/current accounts) */
  readonly accountType: 'CREDIT_CARD' | 'SAVINGS' | 'CURRENT';
}