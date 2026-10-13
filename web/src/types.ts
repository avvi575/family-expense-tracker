export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type Role = 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface FamilySummary {
  id: string;
  name: string;
  role: Role;
}

export interface FamilyMember {
  id: string;
  role: Role;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  familyId: string | null;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  children?: { id: string; name: string; icon: string }[];
}

export type PaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'BANK_TRANSFER' | 'OTHER';

export interface Expense {
  id: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  notes: string | null;
  receiptUrl: string | null;
  paidBy: { id: string; name: string };
  category: Category;
  recurringId?: string | null;
  recurring?: { id: string; name: string; interval: string } | null;
}

export interface ExpensePage {
  items: Expense[];
  total: number;
  page: number;
  limit: number;
}

export interface BudgetItem {
  id: string;
  categoryId: string;
  amount: number | string;
  month: string;
  category: Category;
  spent: number;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  memberId: string;
  memberName: string;
  amount: number | string;
  note: string | null;
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number | string;
  savedAmount: number | string;
  deadline: string | null;
  contributions?: GoalContribution[];
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface ReportSummary {
  totalSpent: number;
  recurringTotal: number;
  oneTimeTotal: number;
  byCategory: { categoryId: string; name: string; color: string; total: number }[];
  byMember: { userId: string; name: string; total: number }[];
  byRecurring: { id: string; name: string; total: number }[];
  dailyTotals: { date: string; total: number }[];
  // Aggregated data for dashboard charts
  aggregatedTotals?: { period: string; total: number }[];
  // Aggregated data per member for contributor breakdown
  aggregatedByMember?: Record<string, { period: string; total: number }[]>;
}

export type RecurringInterval = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'ANNUAL';

export const RECURRING_INTERVALS: RecurringInterval[] = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'ANNUAL',
];

export type AggregationType = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

export const AGGREGATION_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export interface RecurringExpense {
  id: string;
  familyId: string;
  name: string;
  categoryId: string;
  paidById: string;
  amount: number | string;
  interval: RecurringInterval;
  startDate: string;
  endDate: string | null;
  paymentMethod: PaymentMethod;
  notes: string | null;
  active: boolean;
  nextDue: string | null;
  category: Category;
  paidBy: { id: string; name: string };
}

export const INCOME_TYPES = ['SALARY','RENTAL','BUSINESS','INVESTMENT','GIFT','BONUS','FREELANCE','OTHER'] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export interface Income {
  id: string;
  familyId: string;
  memberId: string;
  declaredById: string;
  amount: number | string;
  type: IncomeType;
  source: string;
  isRecurring: boolean;
  date: string;
  endDate: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  member: { id: string; name: string; email: string };
  declaredBy: { id: string; name: string };
}

export interface IncomeSummary {
  totalIncome: number;
  recurringTotal: number;
  adhocTotal: number;
  months: number;
  byMember: { userId: string; name: string; recurring: number; adhoc: number; total: number }[];
  byType: { type: string; total: number }[];
  recurringItems: Income[];
  adhocItems: Income[];
}

export interface StatementImport {
  id: string;
  status: string;
  sourceType: 'UPLOAD' | 'INBOX';
  fileName: string;
  fileUrl: string;
  bank: string;
  cardLast4: string;
  periodFrom: string;
  periodTo: string;
  statementTotal: number | string;
  extractedDebit: number | string;
  validationDelta: number | string;
  validationPass: boolean;
  importedCount: number | null;
  skippedCount: number | null;
  errorMessage: string | null;
  createdAt: string;
  rowCount?: number;
}

export interface StatementRow {
  id: string;
  serialNumber: string;
  date: string;
  rawDescription: string;
  description: string;
  amount: number | string;
  isCredit: boolean;
  duplicate: boolean;
  excluded: boolean;
  reviewed: boolean;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewer?: { id: string; name: string } | null;
  suggestedCategoryId: string | null;
  categoryId: string | null;
  expenseId: string | null;
  suggestedCategory?: { id: string; name: string; icon: string } | null;
  confirmedCategory?: { id: string; name: string; icon: string } | null;
}

export interface StatementImportDetail extends StatementImport {
  rows: StatementRow[];
}

export interface ScanResult {
  processed: number;
  failed: number;
  results: { fileName: string; status: 'ok' | 'error'; importId?: string; error?: string }[];
}

// --- Bank Statements (savings/current/credit-card via unified API) ---
export type AccountType = 'SAVINGS' | 'CURRENT' | 'CREDIT_CARD';

export interface BankStatementImport {
  id: string;
  status: string;
  sourceType: 'UPLOAD' | 'INBOX';
  accountType: AccountType;
  fileName: string;
  bank: string;
  accountLast4: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number | string | null;
  closingBalance: number | string | null;
  totalCredits: number | string;
  totalDebits: number | string;
  validationPass: boolean;
  validationDelta: number | string;
  importedCount: number | null;
  skippedCount: number | null;
  errorMessage: string | null;
  passwordHint: string | null;
  createdAt: string;
  rowCount?: number;
}

export interface BankStatementSplit {
  id: string;
  rowId: string;
  categoryId: string;
  amount: number | string;
  notes: string | null;
  category?: { id: string; name: string; icon: string };
}

export interface BankStatementRow {
  id: string;
  serialNumber: string;
  date: string;
  valueDate: string | null;
  rawDescription: string;
  description: string;
  refNumber: string | null;
  amount: number | string;
  isCredit: boolean;
  balanceAfter: number | string | null;
  duplicate: boolean;
  excluded: boolean;
  reviewed: boolean;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewer?: { id: string; name: string } | null;
  suggestedCategoryId: string | null;
  categoryId: string | null;
  reconciledExpenseId: string | null;
  suggestedCategory?: { id: string; name: string; icon: string } | null;
  confirmedCategory?: { id: string; name: string; icon: string } | null;
  reconciledExpense?: { id: string; amount: number; date: string; notes: string | null; category: { id: string; name: string; icon: string } } | null;
  splits?: BankStatementSplit[];
}

export interface BankStatementImportDetail extends BankStatementImport {
  rows: BankStatementRow[];
}

export interface RecurringPattern {
  id: string;
  familyId: string;
  merchant: string;
  amountAvg: number | string;
  intervalDays: number;
  occurrences: number;
  lastSeen: string;
  categoryId: string | null;
  category?: { id: string; name: string; icon: string } | null;
}
