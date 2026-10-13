import { client } from './client';
import type {
  AccountType,
  AggregationType,
  AppNotification,
  BankStatementImport,
  BankStatementImportDetail,
  BudgetItem,
  Category,
  ExpensePage,
  FamilyMember,
  FamilySummary,
  Goal,
  Income,
  IncomeSummary,
  IncomeType,
  PaymentMethod,
  RecurringExpense,
  RecurringInterval,
  RecurringPattern,
  ReportSummary,
  ScanResult,
  StatementImport,
  StatementImportDetail,
  StatementRow,
} from '../types';

export const fetchFamilies = () => client.get<FamilySummary[]>('/families/me').then((r) => r.data);
export const createFamily = (name: string) => client.post('/families', { name });
export const fetchMembers = (familyId: string) =>
  client.get<FamilyMember[]>(`/families/${familyId}/members`).then((r) => r.data);
export const inviteMember = (familyId: string, email: string, role: string, mobile?: string, message?: string) =>
  client.post(`/families/${familyId}/invite`, { email, role, mobile, message }).then((r) => r.data);
export const joinFamily = (token: string) => client.post('/families/join', { token });

export const fetchCategories = (familyId: string) =>
  client.get<Category[]>('/categories', { params: { familyId } }).then((r) => r.data);

export const createCategory = (body: { familyId: string; name: string; icon?: string; color?: string; parentId?: string }) =>
  client.post<Category>('/categories', body).then((r) => r.data);

export const updateCategory = (id: string, body: { name?: string; icon?: string; color?: string }) =>
  client.patch<Category>(`/categories/${id}`, body).then((r) => r.data);

export const deleteCategory = (id: string) => client.delete(`/categories/${id}`);

export const fetchReportCsv = async (familyId: string, range: { month?: string; from?: string; to?: string }) => {
  const res = await client.get<Blob>('/reports/summary.csv', {
    params: { familyId, ...range },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const cd = String(res.headers['content-disposition'] ?? '');
  const match = /filename="?([^";]+)"?/.exec(cd);
  const ct = String(res.headers['content-type'] ?? '');
  const isXlsx = ct.includes('spreadsheetml');
  const a = document.createElement('a');
  a.href = url;
  a.download =
    match?.[1] ??
    (isXlsx ? `report-${range.month ?? `${range.from}_${range.to}`}.xlsx` : `report-${range.month ?? `${range.from}_${range.to}`}.csv`);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const fetchExpenses = (params: { familyId: string; month?: string; from?: string; to?: string; page?: number; categoryId?: string }) =>
  client.get<ExpensePage>('/expenses', { params }).then((r) => r.data);
export const createExpense = (body: {
  familyId: string;
  categoryId: string;
  amount: number;
  date: string;
  paymentMethod: PaymentMethod;
  notes?: string;
  receiptUrl?: string;
}) => client.post('/expenses', body).then((r) => r.data);
export const updateExpense = (id: string, body: {
  amount?: number;
  date?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  categoryId?: string;
  receiptUrl?: string;
}) => client.patch(`/expenses/${id}`, body).then((r) => r.data);
export const deleteExpense = (id: string) => client.delete(`/expenses/${id}`);

export const uploadReceipt = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return client.post<{ url: string }>('/uploads', form).then((r) => r.data.url);
};

export const fetchRecurring = (familyId: string) =>
  client.get<RecurringExpense[]>('/recurring', { params: { familyId } }).then((r) => r.data);

export const createRecurring = (body: {
  familyId: string;
  name: string;
  categoryId: string;
  amount: number;
  interval: RecurringInterval;
  startDate: string;
  endDate?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}) => client.post<RecurringExpense>('/recurring', body).then((r) => r.data);

export const deleteRecurring = (id: string) => client.delete(`/recurring/${id}`);

export const fetchBudgets = (familyId: string, month: string) =>
  client.get<{ items: BudgetItem[] }>('/budgets', { params: { familyId, month } }).then((r) => r.data.items);
export const saveBudget = (body: { familyId: string; categoryId: string; month: string; amount: number }) =>
  client.post('/budgets', body);
export const updateBudget = (id: string, amount: number) => client.patch(`/budgets/${id}`, { amount });
export const deleteBudget = (id: string) => client.delete(`/budgets/${id}`);

export const fetchGoals = (familyId: string) =>
  client.get<Goal[]>('/goals', { params: { familyId } }).then((r) => r.data);
export const createGoal = (body: { familyId: string; name: string; targetAmount: number; deadline?: string }) =>
  client.post('/goals', body);
export const updateGoal = (
  id: string,
  body: { name?: string; targetAmount?: number; deadline?: string | null },
) => client.patch(`/goals/${id}`, body).then((r) => r.data);
export const deleteGoal = (id: string) => client.delete(`/goals/${id}`).then((r) => r.data);
export const contributeGoal = (id: string, amount: number, note?: string) =>
  client.post(`/goals/${id}/contribute`, { amount, note }).then((r) => r.data);
export const deleteGoalContribution = (goalId: string, contributionId: string) =>
  client.delete(`/goals/${goalId}/contributions/${contributionId}`).then((r) => r.data);

export const fetchNotifications = () =>
  client.get<AppNotification[]>('/notifications').then((r) => r.data);
export const markRead = (id: string) => client.post(`/notifications/${id}/read`);

export const fetchSummary = (familyId: string, range: { month?: string; from?: string; to?: string; aggregation?: AggregationType; memberId?: string }) =>
  client
    .get<ReportSummary>('/reports/summary', { params: { familyId, ...range } })
    .then((r) => r.data);

export const fetchInviteInfo = (token: string) =>
  client
    .get<{ email: string; mobile: string | null; message: string | null; role: 'ADMIN' | 'MEMBER' | 'VIEWER'; familyName: string }>(
      `/families/invites/${token}`,
    )
    .then((r) => r.data);

export const acceptInvite = (token: string, name: string, password: string) =>
  client
    .post<{ accessToken: string; user: { id: string; email: string; name: string } }>('/auth/accept-invite', {
      token,
      name,
      password,
    })
    .then((r) => r.data);

export const fetchIncomes = (familyId: string) =>
  client.get<Income[]>('/incomes', { params: { familyId } }).then((r) => r.data);

export const fetchIncomeSummary = (familyId: string, range: { month?: string; from?: string; to?: string }) =>
  client.get<IncomeSummary>('/incomes/summary', { params: { familyId, ...range } }).then((r) => r.data);

export const createIncome = (body: {
  familyId: string;
  memberId?: string;
  amount: number;
  type: IncomeType;
  source: string;
  isRecurring: boolean;
  date: string;
  endDate?: string;
  notes?: string;
}) => client.post<Income>('/incomes', body).then((r) => r.data);

export const updateIncome = (id: string, body: { amount?: number; type?: IncomeType; source?: string; active?: boolean; notes?: string }) =>
  client.patch<Income>(`/incomes/${id}`, body).then((r) => r.data);

export const deleteIncome = (id: string) => client.delete(`/incomes/${id}`);

export const uploadStatement = (familyId: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return client
    .post<StatementImport & { rows: StatementRow[] }>(`/statement-imports/upload?familyId=${familyId}`, form)
    .then((r) => r.data);
};

export const scanInbox = (familyId: string) =>
  client.post<ScanResult>('/statement-imports/scan-inbox', { familyId }).then((r) => r.data);

export const fetchStatementImports = (familyId: string) =>
  client.get<(StatementImport & { rowCount: number })[]>('/statement-imports', { params: { familyId } }).then((r) => r.data);

export const fetchStatementImport = (id: string) =>
  client.get<StatementImportDetail>(`/statement-imports/${id}`).then((r) => r.data);

export interface StatementRowPatch {
  id: string;
  categoryId?: string | null;
  description?: string;
  excluded?: boolean;
  reviewed?: boolean;
}

export interface BankRowPatch {
  id: string;
  categoryId?: string | null;
  description?: string;
  excluded?: boolean;
  reviewed?: boolean;
}

export const patchStatementRows = (id: string, rows: StatementRowPatch[]) =>
  client.patch(`/statement-imports/${id}/rows`, { rows });

export const confirmStatementImport = (id: string) =>
  client.post<{ imported: number; skipped: number }>(`/statement-imports/${id}/confirm`).then((r) => r.data);

export const deleteStatementImport = (id: string) =>
  client.delete(`/statement-imports/${id}`);

// --- Bank Statement API (savings / current / credit-card via unified parser) ---
export const uploadBankStatement = (familyId: string, accountType: AccountType, file: File, password?: string) => {
  const form = new FormData();
  form.append('file', file);
  if (password) form.append('password', password);
  return client
    .post<BankStatementImport & { rows?: any[] }>(`/bank-statements/upload?familyId=${familyId}&accountType=${accountType}`, form)
    .then((r) => r.data);
};

export const scanBankInbox = (familyId: string, accountType: AccountType) =>
  client.post<ScanResult & { results: any[] }>('/bank-statements/scan-inbox', { familyId, accountType }).then((r) => r.data);

export const fetchBankStatements = (familyId: string, accountType?: AccountType) =>
  client.get<(BankStatementImport & { rowCount: number })[]>('/bank-statements', { params: { familyId, accountType } }).then((r) => r.data);

export const fetchBankStatement = (id: string) =>
  client.get<BankStatementImportDetail>(`/bank-statements/${id}`).then((r) => r.data);

export const unlockBankStatement = (id: string, password: string) =>
  client.post<BankStatementImport>(`/bank-statements/${id}/unlock`, { password }).then((r) => r.data);

export const patchBankRows = (id: string, rows: BankRowPatch[]) =>
  client.patch(`/bank-statements/${id}/rows`, { rows });

export const setRowSplits = (rowId: string, splits: { categoryId: string; amount: number; notes?: string }[]) =>
  client.post(`/bank-statements/rows/${rowId}/splits`, { splits }).then((r) => r.data);

export const reconcileRow = (rowId: string, expenseId: string | null) =>
  client.post(`/bank-statements/rows/${rowId}/reconcile`, { expenseId }).then((r) => r.data);

export const fetchRowMatches = (rowId: string) =>
  client.get<{ id: string; amount: number; date: string; notes: string | null; similarity: number; category: { id: string; name: string; icon: string } }[]>(`/bank-statements/rows/${rowId}/matches`).then((r) => r.data);

export const confirmBankImport = (id: string) =>
  client.post<{ imported: number; skipped: number }>(`/bank-statements/${id}/confirm`).then((r) => r.data);

export const deleteBankStatement = (id: string) =>
  client.delete(`/bank-statements/${id}`);

export const exportBankStatement = async (id: string, format: 'csv' | 'json' = 'csv') => {
  const res = await client.get<Blob>(`/bank-statements/${id}/export`, {
    params: { format },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `statement-${id}.${format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const fetchRecurringPatterns = (familyId: string) =>
  client.get<RecurringPattern[]>(`/bank-statements/recurring/family/${familyId}`).then((r) => r.data);

export interface AppSettings {
  statementInboxDir: string;
}

export const fetchSettings = () => client.get<AppSettings>('/settings').then((r) => r.data);

export const updateSettings = (dto: Partial<AppSettings>) =>
  client.put<AppSettings>('/settings', dto).then((r) => r.data);

export const detectRecurring = (familyId: string) =>
  client.post<{ patterns: number }>(`/bank-statements/recurring/family/${familyId}/detect`).then((r) => r.data);

export const promotePatternToRecurring = (familyId: string, patternId: string, categoryId?: string) =>
  client.post<RecurringExpense>(`/bank-statements/recurring/family/${familyId}/promote`, { patternId, categoryId }).then((r) => r.data);
