import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  confirmBankImport, deleteBankStatement, detectRecurring, exportBankStatement, fetchBankStatement,
  fetchBankStatements, fetchCategories, fetchRecurringPatterns, fetchRowMatches, fetchSettings,
  patchBankRows, promotePatternToRecurring, reconcileRow, scanBankInbox, setRowSplits,
  unlockBankStatement, uploadBankStatement, type BankRowPatch,
} from '../api';
import { fmtMoney, useAuth } from '../stores/auth';
import { errMessage } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';
import type {
  AccountType, BankStatementImport, BankStatementImportDetail, BankStatementRow, Category,
  RecurringPattern, User,
} from '../types';
import { isEligibleRow, effectiveCategoryId, setRowsState, useRowsStore, type RowState } from './bankStatements.helpers';

function statusBadge(status: string) {
  if (status === 'IMPORTED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'FAILED' || status === 'PASSWORD_REQUIRED') return 'bg-amber-100 text-amber-700';
  return 'bg-amber-100 text-amber-700';
}

type View = 'IDLE' | 'LOADING' | 'PARSED' | 'CONFIRMING';
type Tab = 'expense' | 'income' | 'duplicate' | 'recurring';

interface SplitDraft {
  categoryId: string;
  amount: number;
  notes?: string;
}

export default function BankStatementsPage() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const currentUser = useAuth((s) => s.user);
  const isAdmin = activeFamily?.role === 'ADMIN';
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = (searchParams.get('type') as AccountType) || 'SAVINGS';

  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [inboxDir, setInboxDir] = useState<string>('');

  useEffect(() => {
    fetchSettings().then((s) => setInboxDir(s.statementInboxDir || '')).catch(() => {});
  }, []);
  const [view, setView] = useState<View>('IDLE');
  const [imports, setImports] = useState<(BankStatementImport & { rowCount: number })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeImport, setActiveImport] = useState<BankStatementImportDetail | null>(null);
  const rows = useRowsStore((s) => s.rows);
  const setRows = useRowsStore((s) => s.setRows);
  const [tab, setTab] = useState<Tab>('expense');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const [passwordPrompt, setPasswordPrompt] = useState<{ importId: string; fileName: string } | null>(null);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringPattern[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowPatchVersions = useRef(new Map<string, number>());

  function descriptionPatch(row: RowState): Partial<BankRowPatch> {
    return row.description === row.committedDescription ? {} : { description: row.description };
  }

  function reviewedFields(user: User | null, reviewed: boolean) {
    return reviewed
      ? {
          reviewedAt: new Date().toISOString(),
          reviewedById: user?.id ?? null,
          reviewer: user ? { id: user.id, name: user.name } : null,
        }
      : {
          reviewedAt: null as string | null,
          reviewedById: null as string | null,
          reviewer: null as { id: string; name: string } | null,
        };
  }

  async function patchRowsOptimistically(
    patches: BankRowPatch[],
    updater: (previous: RowState[]) => RowState[],
  ): Promise<boolean> {
    if (!activeImport || !isAdmin || patches.length === 0) return false;

    const before = useRowsStore.getState().rows;
    const beforeById = new Map(before.map((row) => [row.id, row]));
    const versions = new Map<string, number>();
    for (const patch of patches) {
      const version = (rowPatchVersions.current.get(patch.id) ?? 0) + 1;
      rowPatchVersions.current.set(patch.id, version);
      versions.set(patch.id, version);
    }

    setRowsState(updater);
    setError('');
    try {
      await patchBankRows(activeImport.id, patches);
      for (const patch of patches) {
        const version = versions.get(patch.id);
        if (version !== undefined && rowPatchVersions.current.get(patch.id) === version) {
          rowPatchVersions.current.delete(patch.id);
          if (patch.description !== undefined) {
            setRowsState((current) => current.map((row) =>
              row.id === patch.id ? { ...row, committedDescription: patch.description as string } : row,
            ));
          }
        }
      }
      return true;
    } catch (e) {
      let rolledBack = false;
      setRowsState((current) => current.map((row) => {
        const version = versions.get(row.id);
        if (version !== undefined && rowPatchVersions.current.get(row.id) === version) {
          rolledBack = true;
          rowPatchVersions.current.delete(row.id);
          return beforeById.get(row.id) ?? row;
        }
        return row;
      }));
      setError(errMessage(e));
      return rolledBack;
    }
  }

  function addToast(msg: string) {
    setToasts((t) => [...t, msg]);
    setTimeout(() => setToasts((t) => t.slice(1)), 4000);
  }

  function loadHistory() {
    if (!activeFamily) return;
    fetchBankStatements(activeFamily.id, accountType).then(setImports).catch(() => {});
    if (accountType !== 'CREDIT_CARD') {
      fetchRecurringPatterns(activeFamily.id).then(setRecurringPatterns).catch(() => {});
    }
  }

  useEffect(() => {
    if (activeFamily) fetchCategories(activeFamily.id).then(setCategories).catch(() => {});
  }, [activeFamily]);

  useEffect(() => {
    loadHistory();
    setView('IDLE');
    setActiveImport(null);
    setRows([]);
  }, [activeFamily, accountType]);

  async function openFile(file: File) {
    if (!activeFamily || !isAdmin) return;
    setError('');
    setView('LOADING');
    try {
      const imp = await uploadBankStatement(activeFamily.id, accountType, file);
      if (imp.status === 'PASSWORD_REQUIRED') {
        setPasswordPrompt({ importId: imp.id, fileName: imp.fileName });
        setView('IDLE');
      } else {
        await showImportDetail(imp.id);
      }
      loadHistory();
    } catch (e) {
      setError(errMessage(e));
      setView('IDLE');
    }
  }

  async function unlockWithPassword(password: string) {
    if (!passwordPrompt) return;
    setBusy(true);
    try {
      const result = await unlockBankStatement(passwordPrompt.importId, password);
      setPasswordPrompt(null);
      await showImportDetail(result.id);
      loadHistory();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function scanFolder() {
    if (!activeFamily || !isAdmin) return;
    setError('');
    setView('LOADING');
    try {
      const result = await scanBankInbox(activeFamily.id, accountType);
      loadHistory();
      const failed = result.results.filter((r: any) => r.status === 'error');
      const pwRequired = result.results.filter((r: any) => r.status === 'password_required');
      if (failed.length > 0) {
        setError(`${failed.length} file(s) failed: ` + failed.map((e: any) => `${e.fileName}: ${e.error}`).join('; '));
      } else if (pwRequired.length > 0) {
        addToast(`${pwRequired.length} file(s) need a password — open them from the list to unlock`);
      } else if (result.processed === 0) {
        addToast('Inbox empty — drop PDF statements into the inbox folder first, then scan again.');
      } else {
        addToast(`Parsed ${result.processed} file(s) from inbox`);
      }
      setView('IDLE');
    } catch (e) {
      setError(errMessage(e));
      setView('IDLE');
    }
  }

  async function showImportDetail(id: string) {
    const detail = await fetchBankStatement(id);
    setActiveImport(detail);
    setRows(
      detail.rows.map((r) => {
        const eligible = !r.isCredit && !r.duplicate;
        const reviewed = r.reviewed ?? (eligible && !!r.suggestedCategoryId);
        const catId = r.categoryId ?? r.suggestedCategoryId ?? '';
        const cat = categories.find((c) => c.id === catId);
        return {
          ...r,
          reviewed,
          excluded: eligible ? !reviewed : r.excluded,
          parentSelected: cat?.parentId ?? cat?.id ?? '',
          subSelected: cat?.parentId ? cat.id : '',
          committedDescription: r.description,
        };
      }),
    );
    setView('PARSED');
    setTab('expense');
  }

  // Refresh rows with category mapping when categories finish loading
  useEffect(() => {
    if (rows.length > 0 && categories.length > 0) {
      setRows(useRowsStore.getState().rows.map((r) => {
        if (r.parentSelected) return r;
        const catId = r.categoryId ?? r.suggestedCategoryId ?? '';
        if (!catId) return r;
        const cat = categories.find((c) => c.id === catId);
        if (!cat) return r;
        return {
          ...r,
          parentSelected: cat.parentId ?? cat.id,
          subSelected: cat.parentId ? cat.id : '',
        };
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  async function toggleParent(id: string, parentId: string) {
    const row = useRowsStore.getState().rows.find((r) => r.id === id);
    if (!row || !isEligibleRow(row) || !isAdmin) return;
    const categoryId = parentId || null;
    const patch: BankRowPatch = {
      id,
      categoryId,
      reviewed: true,
      excluded: false,
      ...descriptionPatch(row),
    };
    await patchRowsOptimistically([patch], (previous) =>
      previous.map((r) => r.id === id
        ? {
            ...r,
            parentSelected: parentId,
            subSelected: '',
            categoryId,
            reviewed: true,
            excluded: false,
            ...reviewedFields(currentUser, true),
          }
        : r),
    );
  }

  async function toggleSub(id: string, subId: string) {
    const row = useRowsStore.getState().rows.find((r) => r.id === id);
    if (!row || !isEligibleRow(row) || !isAdmin) return;
    const categoryId = subId || row.parentSelected || null;
    const patch: BankRowPatch = {
      id,
      categoryId,
      reviewed: true,
      excluded: false,
      ...descriptionPatch(row),
    };
    await patchRowsOptimistically([patch], (previous) =>
      previous.map((r) => r.id === id
        ? {
            ...r,
            subSelected: subId,
            categoryId,
            reviewed: true,
            excluded: false,
            ...reviewedFields(currentUser, true),
          }
        : r),
    );
  }

  function toggleDescription(id: string, description: string) {
    setRows(useRowsStore.getState().rows.map((r) => (r.id === id ? { ...r, description } : r)));
  }

  async function commitDescription(id: string, description: string) {
    const row = useRowsStore.getState().rows.find((r) => r.id === id);
    if (!row || row.description === row.committedDescription || !isAdmin) return;
    await patchRowsOptimistically([{ id, description }], (previous) =>
      previous.map((r) => r.id === id ? { ...r, description, committedDescription: description } : r),
    );
  }

  async function toggleReviewed(id: string) {
    const row = useRowsStore.getState().rows.find((r) => r.id === id);
    if (!row || !isEligibleRow(row) || !isAdmin) return;
    const reviewed = !row.reviewed;
    const patch: BankRowPatch = {
      id,
      reviewed,
      excluded: !reviewed,
      ...descriptionPatch(row),
    };
    await patchRowsOptimistically([patch], (previous) =>
      previous.map((r) => r.id === id
        ? { ...r, reviewed, excluded: !reviewed, ...reviewedFields(currentUser, reviewed) }
        : r),
    );
  }

  async function bulkReview(checked: boolean) {
    const eligible = filteredRows.expense;
    if (eligible.length === 0 || !isAdmin) return;
    const patches: BankRowPatch[] = eligible.map((r) => ({
      id: r.id,
      reviewed: checked,
      excluded: !checked,
      ...descriptionPatch(r),
    }));
    await patchRowsOptimistically(patches, (previous) =>
      previous.map((r) => eligible.some((item) => item.id === r.id)
        ? { ...r, reviewed: checked, excluded: !checked, ...reviewedFields(currentUser, checked) }
        : r),
    );
  }

  const filteredRows = {
    expense: rows.filter((r) => !r.isCredit && !r.duplicate),
    income: rows.filter((r) => r.isCredit),
    duplicate: rows.filter((r) => r.duplicate),
  };

  const reviewedRows = filteredRows.expense.filter((r) => r.reviewed);
  const pendingRows = filteredRows.expense.filter((r) => !r.reviewed);
  const reviewedSum = reviewedRows.reduce((s, r) => s + Number(r.amount), 0);

  async function confirmImport() {
    if (!activeImport || !isAdmin) return;
    if (reviewedRows.length === 0) return;
    setBusy(true);
    setError('');
    try {
      // First persist all row changes (category, description, reviewed, excluded)
      const patches: BankRowPatch[] = rows.map((r) => {
        const eligible = isEligibleRow(r);
        return {
          id: r.id,
          reviewed: r.reviewed,
          excluded: eligible ? !r.reviewed : r.excluded,
          categoryId: eligible ? (effectiveCategoryId(r) ?? undefined) : undefined,
          ...descriptionPatch(r),
        };
      });
      const persisted = await patchRowsOptimistically(patches, (previous) =>
        previous.map((r) => {
          const eligible = isEligibleRow(r);
          return eligible
            ? { ...r, reviewed: r.reviewed, excluded: !r.reviewed, categoryId: effectiveCategoryId(r) ?? r.categoryId }
            : r;
        }),
      );
      if (!persisted) return;
      const res = await confirmBankImport(activeImport.id);
      addToast(`Imported ${res.imported} reviewed expenses. ${res.skipped} skipped (pending/credits/duplicates/excluded).`);
      setActiveImport(null);
      setRows([]);
      setView('IDLE');
      loadHistory();
      setTimeout(() => navigate('/expenses'), 2000);
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this import?')) return;
    await deleteBankStatement(id).catch((e) => addToast(errMessage(e)));
    loadHistory();
  }

  async function runDetection() {
    if (!activeFamily) return;
    setBusy(true);
    try {
      const res = await detectRecurring(activeFamily.id);
      addToast(`Detected ${res.patterns} recurring pattern(s)`);
      await fetchRecurringPatterns(activeFamily.id).then(setRecurringPatterns);
    } catch (e) {
      addToast(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!activeFamily) return <p className="text-slate-500">Create or join a family first.</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-100 border border-slate-200 px-4 py-2 text-xs text-slate-600 flex items-center justify-between gap-3">
        <div className="min-w-0">
          📂 Statement inbox folder: <code className="font-mono">{inboxDir || 'backend/statement-inbox (default)'}</code>
        </div>
        {isAdmin && (
          <Link
            to="/settings"
            className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ⚙️ Change…
          </Link>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{accountType === 'CREDIT_CARD' ? 'Credit Card Statement Import' : accountType === 'CURRENT' ? 'Current Account Statement Import' : 'Debit (Savings) Statement Import'}</h1>
          <p className="text-sm text-slate-500">Import credit card and savings account statements (HDFC, ICICI, SBI, Citi, and more).</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Upload {accountType === 'CREDIT_CARD' ? 'Credit Card' : accountType === 'CURRENT' ? 'Current A/c' : 'Savings A/c'}
            </button>
            <button
              onClick={scanFolder}
              title="Parses all PDFs placed in the configured inbox folder"
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Scan Inbox
            </button>
          </div>
        )}
      </div>

      {/* Account type tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['SAVINGS', 'CURRENT', 'CREDIT_CARD'] as AccountType[]).map((t) => (
          <button
            key={t}
            onClick={() => setAccountType(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${
              accountType === t ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'
            }`}
          >
            {t === 'SAVINGS' ? '🏦 Savings' : t === 'CURRENT' ? '🏢 Current' : '💳 Credit Card'}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      {toasts.length > 0 && (
        <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{toasts[toasts.length - 1]}</p>
      )}

      {passwordPrompt && (
        <PasswordPrompt
          fileName={passwordPrompt.fileName}
          onSubmit={unlockWithPassword}
          onCancel={() => setPasswordPrompt(null)}
          busy={busy}
        />
      )}

      {view === 'LOADING' && (
        <p className="rounded-lg bg-slate-50 p-6 text-center text-slate-500">Processing…</p>
      )}

      {view === 'PARSED' && activeImport && (
        <ReviewView
          detail={activeImport}
          rows={rows}
          categories={categories}
          tab={tab}
          setTab={setTab}
          filteredRows={filteredRows}
          reviewedRows={reviewedRows}
          pendingRows={pendingRows}
          reviewedSum={reviewedSum}
          toggleReviewed={toggleReviewed}
          toggleParent={toggleParent}
          toggleSub={toggleSub}
          toggleDescription={toggleDescription}
          commitDescription={commitDescription}
          bulkReview={bulkReview}
          onConfirm={confirmImport}
          busy={busy}
          onBack={() => { setActiveImport(null); setView('IDLE'); }}
          canConfirm={isAdmin && reviewedRows.length > 0}
        />
      )}

      {view === 'IDLE' && (
        <>
          {/* Recurring patterns (only for savings/current) */}
          {accountType !== 'CREDIT_CARD' && (
            <RecurringPatternsSection
              patterns={recurringPatterns}
              categories={categories}
              onPromote={async (patternId, categoryId) => {
                if (!activeFamily) return;
                try {
                  await promotePatternToRecurring(activeFamily.id, patternId, categoryId);
                  addToast('Pattern promoted to Recurring Expense');
                } catch (e) { addToast(errMessage(e)); }
              }}
              onDetect={runDetection}
              isAdmin={isAdmin}
              busy={busy}
            />
          )}

          {/* History list */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Import history ({imports.length})</h2>
            {imports.length === 0 ? (
              <p className="text-sm text-slate-400">
                No imports yet. {isAdmin ? 'Upload a PDF statement, or drop PDFs into the inbox folder and hit "Scan Inbox".' : ''}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Bank</th>
                    <th className="px-4 py-2">{accountType === 'CREDIT_CARD' ? 'Card' : 'Account'}</th>
                    <th className="px-4 py-2">Period</th>
                    <th className="px-4 py-2 text-right">Credits / Debits</th>
                    <th className="px-4 py-2">Rows</th>
                    <th className="px-4 py-2">Status</th>
                    {isAdmin && <th className="px-4 py-2" />}
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id} className="border-t border-slate-100">
                      <td className="px-4 py-2.5">{imp.createdAt.slice(0, 10)}</td>
                      <td className="px-4 py-2.5">{imp.bank}</td>
                      <td className="px-4 py-2.5">••••{imp.accountLast4 || '—'}</td>
                      <td className="px-4 py-2.5">{imp.periodFrom.slice(0, 10)} → {imp.periodTo.slice(0, 10)}</td>
                      <td className="px-4 py-2.5 text-right text-xs">
                        <div className="text-emerald-700">+{fmtMoney(imp.totalCredits)}</div>
                        <div className="text-slate-700">-{fmtMoney(imp.totalDebits)}</div>
                      </td>
                      <td className="px-4 py-2.5">{imp.rowCount ?? imp.importedCount ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(imp.status)}`}>
                          {imp.status}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          {imp.status === 'PASSWORD_REQUIRED' ? (
                            <button
                              onClick={() => setPasswordPrompt({ importId: imp.id, fileName: imp.fileName })}
                              className="text-xs text-amber-600 hover:underline"
                            >
                              Unlock
                            </button>
                          ) : (
                            <>
                              <button onClick={() => showImportDetail(imp.id)} className="text-xs text-indigo-500 hover:underline">Review</button>
                              <button onClick={() => exportBankStatement(imp.id, 'csv')} className="ml-2 text-xs text-emerald-600 hover:underline">CSV</button>
                              {imp.status !== 'IMPORTED' && (
                                <button onClick={() => handleDelete(imp.id)} className="ml-2 text-xs text-red-500 hover:underline">Delete</button>
                              )}
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function PasswordPrompt({ fileName, onSubmit, onCancel, busy }: { fileName: string; onSubmit: (p: string) => void; onCancel: () => void; busy: boolean }) {
  const [pwd, setPwd] = useState('');
  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-3">
      <p className="text-sm text-amber-800">
        🔒 <strong>{fileName}</strong> is password-protected. Enter the PDF password to continue.
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          placeholder="PDF password"
          className="flex-1 rounded border border-amber-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => onSubmit(pwd)}
          disabled={busy || !pwd}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {busy ? 'Decrypting…' : 'Unlock'}
        </button>
        <button onClick={onCancel} className="rounded border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function RecurringPatternsSection({
  patterns, categories, onPromote, onDetect, isAdmin, busy,
}: {
  patterns: RecurringPattern[];
  categories: Category[];
  onPromote: (patternId: string, categoryId?: string) => Promise<void>;
  onDetect: () => Promise<void>;
  isAdmin: boolean;
  busy: boolean;
}) {
  if (patterns.length === 0) {
    return (
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">🔁 Recurring Patterns</h2>
          {isAdmin && (
            <button
              onClick={onDetect}
              disabled={busy}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Detecting…' : 'Detect Patterns'}
            </button>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-400">No recurring patterns detected yet. Import at least one statement and click "Detect Patterns".</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700">🔁 Recurring Patterns ({patterns.length})</h2>
        {isAdmin && (
          <button onClick={onDetect} disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Detecting…' : 'Re-detect'}
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-500">
          <tr>
            <th className="px-3 py-2">Merchant</th>
            <th className="px-3 py-2">Amount</th>
            <th className="px-3 py-2">Interval</th>
            <th className="px-3 py-2">Occurrences</th>
            <th className="px-3 py-2">Category</th>
            {isAdmin && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {patterns.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="px-3 py-2 font-medium">{p.merchant}</td>
              <td className="px-3 py-2">{fmtMoney(p.amountAvg)}</td>
              <td className="px-3 py-2">{labelForInterval(p.intervalDays)}</td>
              <td className="px-3 py-2">{p.occurrences}</td>
              <td className="px-3 py-2">{p.category?.icon ?? ''} {p.category?.name ?? '—'}</td>
              {isAdmin && (
                <td className="px-3 py-2">
                  <button
                    onClick={() => onPromote(p.id, p.categoryId ?? undefined)}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    → Make Recurring
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function labelForInterval(days: number): string {
  if (days === 7) return 'Weekly';
  if (days === 30) return 'Monthly';
  if (days === 90) return 'Quarterly';
  if (days === 180) return 'Half-yearly';
  if (days === 365) return 'Annual';
  return `~${days}d`;
}

function ReviewView({
  detail, rows, categories, tab, setTab, filteredRows, reviewedRows, pendingRows, reviewedSum,
  toggleReviewed, toggleParent, toggleSub, toggleDescription, commitDescription, bulkReview, onConfirm, busy, onBack, canConfirm,
}: {
  detail: BankStatementImportDetail;
  rows: RowState[];
  categories: Category[];
  tab: Tab;
  setTab: (t: Tab) => void;
  filteredRows: { expense: RowState[]; income: RowState[]; duplicate: RowState[] };
  reviewedRows: RowState[];
  pendingRows: RowState[];
  reviewedSum: number;
  toggleReviewed: (id: string) => void;
  toggleParent: (id: string, parentId: string) => void;
  toggleSub: (id: string, subId: string) => void;
  toggleDescription: (id: string, description: string) => void;
  commitDescription: (id: string, description: string) => void;
  bulkReview: (checked: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
  onBack: () => void;
  canConfirm: boolean;
}) {
  const autoSuggestedCount = filteredRows.expense.filter((r) => !r.categoryId && !!r.suggestedCategoryId).length;
  const parentOptions = categories.filter((c) => !c.parentId).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  const subOptionsFor = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId).map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));
  const findCat = (id: string | null | undefined) => id ? categories.find((c) => c.id === id) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-indigo-500 hover:underline text-sm">← History</button>
        <h2 className="text-xl font-bold">Review import</h2>
      </div>

      <div className={`rounded-lg p-4 text-sm ${detail.validationPass ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {detail.validationPass
          ? '✅ Validation passed — extracted debits match the expected closing balance.'
          : `⚠️ Validation delta ₹${detail.validationDelta} — review carefully before confirming.`}
      </div>

      <div className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-800">
        🤖 Auto-categorised <strong>{autoSuggestedCount}</strong> of {filteredRows.expense.length} expense rows based on
        transaction description. <strong>{reviewedRows.length}</strong> reviewed · <strong>{pendingRows.length}</strong> pending.
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Bank', value: detail.bank },
          { label: detail.accountType === 'CREDIT_CARD' ? 'Card' : 'Account', value: `••••${detail.accountLast4 || '—'}` },
          { label: 'Total Credits', value: fmtMoney(detail.totalCredits) },
          { label: 'Total Debits', value: fmtMoney(detail.totalDebits) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 font-semibold">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(['expense', 'income', 'duplicate'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          >
            {t === 'expense' ? `Expenses (${filteredRows.expense.length})` : t === 'income' ? `Credits (${filteredRows.income.length})` : `Duplicates (${filteredRows.duplicate.length})`}
          </button>
        ))}
      </div>

      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        {tab === 'expense' && (
          <>
            <div className="flex gap-3 px-4 py-2 text-xs border-b border-slate-100">
              <button onClick={() => bulkReview(true)} className="text-emerald-600 hover:underline">Mark all reviewed</button>
              <button onClick={() => bulkReview(false)} className="text-rose-600 hover:underline">Mark all unreviewed</button>
              <span className="ml-auto text-slate-400">{detail.accountType === 'CREDIT_CARD' ? 'CARD' : 'UPI'} payment method</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 w-8" title="Reviewed" />
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 min-w-[200px]">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 min-w-[140px]">Category</th>
                    <th className="px-3 py-2 min-w-[140px]">Subcategory</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.expense.map((r) => {
                    const detected = findCat(r.categoryId ?? r.suggestedCategoryId);
                    return (
                      <RowLine
                        key={r.id}
                        row={r}
                        categories={categories}
                        detected={detected}
                        parentOptions={parentOptions}
                        subOptionsFor={subOptionsFor}
                        toggleReviewed={toggleReviewed}
                        toggleParent={toggleParent}
                        toggleSub={toggleSub}
                        toggleDescription={toggleDescription}
                        commitDescription={commitDescription}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <span>Reviewed: {reviewedRows.length} · {fmtMoney(reviewedSum)} <span className="text-slate-400">· Pending: {pendingRows.length}</span></span>
              <span className="text-xs text-slate-400">Only reviewed expenses import; duplicates auto-skipped; credits excluded</span>
            </div>
          </>
        )}
        {tab === 'income' && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Amount (CR)</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.income.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 bg-slate-50">
                  <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700">-{fmtMoney(r.amount)}</td>
                  <td className="px-4 py-2 text-right text-xs text-slate-500">{r.balanceAfter ? fmtMoney(r.balanceAfter) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'duplicate' && (
          <p className="p-4 text-sm text-slate-500">
            {filteredRows.duplicate.length === 0
              ? 'No duplicates found. Re-uploading the same statement will mark every transaction here.'
              : `${filteredRows.duplicate.length} duplicate transaction(s) will be auto-skipped from the import.`}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onBack} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
          Back to history
        </button>
        <button
          disabled={!canConfirm || busy}
          onClick={onConfirm}
          className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy ? 'Importing…' : `Import ${reviewedRows.length} reviewed expenses →`}
        </button>
      </div>
    </div>
  );
}

function RowLine({
  row, categories, detected, parentOptions, subOptionsFor, toggleReviewed, toggleParent, toggleSub, toggleDescription, commitDescription,
}: {
  row: RowState;
  categories: Category[];
  detected?: Category;
  parentOptions: { value: string; label: string }[];
  subOptionsFor: (parentId: string) => { value: string; label: string }[];
  toggleReviewed: (id: string) => void;
  toggleParent: (id: string, parentId: string) => void;
  toggleSub: (id: string, subId: string) => void;
  toggleDescription: (id: string, description: string) => void;
  commitDescription: (id: string, description: string) => void;
}) {
  const [splitOpen, setSplitOpen] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [matchOpen, setMatchOpen] = useState(false);

  return (
    <>
      <tr className={`border-t border-slate-100 ${!row.reviewed ? 'bg-slate-50 opacity-70' : ''}`}>
        <td className="px-3 py-2">
          <input
            type="checkbox"
            checked={row.reviewed}
            onChange={() => toggleReviewed(row.id)}
            className="accent-emerald-600"
            title={row.reviewed ? `Reviewed${row.reviewer?.name ? ` by ${row.reviewer.name}` : ''}` : 'Mark reviewed'}
          />
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{row.date.slice(0, 10)}</td>
        <td className="px-3 py-2">
          <input
            value={row.description}
            onChange={(e) => toggleDescription(row.id, e.target.value)}
            onBlur={(e) => commitDescription(row.id, e.target.value)}
            className="w-full border-0 bg-transparent focus:outline-none"
          />
          {row.splits && row.splits.length > 0 && (
            <div className="text-xs text-indigo-600 mt-0.5">Split into {row.splits.length} parts</div>
          )}
          {row.reconciledExpense && (
            <div className="text-xs text-emerald-600 mt-0.5">
              ↔ Matched expense: {row.reconciledExpense.category.icon} {row.reconciledExpense.category.name} · {fmtMoney(row.reconciledExpense.amount)}
            </div>
          )}
          {detected && !row.categoryId && (
            <div className="text-xs text-indigo-600 mt-0.5">🤖 detected: {detected.icon} {detected.name}</div>
          )}
        </td>
        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{fmtMoney(row.amount)}</td>
        <td className="px-3 py-2">
          <SearchableSelect
            options={parentOptions}
            value={row.parentSelected}
            onChange={(id) => toggleParent(row.id, id)}
            placeholder="Category…"
          />
        </td>
        <td className="px-3 py-2">
          {row.parentSelected ? (
            <SearchableSelect
              options={subOptionsFor(row.parentSelected)}
              value={row.subSelected}
              onChange={(id) => toggleSub(row.id, id)}
              placeholder="Subcategory…"
            />
          ) : (
            <span className="text-xs text-slate-400">Pick a category first</span>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setSplitOpen(!splitOpen)}
              className="text-xs text-slate-500 hover:text-indigo-600"
              title="Split into multiple parts"
            >
              ⎘
            </button>
            <button
              onClick={async () => {
                setMatchOpen(!matchOpen);
                if (!matchOpen && matches.length === 0) {
                  try {
                    const m = await fetchRowMatches(row.id);
                    setMatches(m);
                  } catch {}
                }
              }}
              className="text-xs text-slate-500 hover:text-indigo-600"
              title="Find matching existing expenses"
            >
              🔗
            </button>
          </div>
        </td>
      </tr>
      {splitOpen && (
        <SplitEditor
          row={row}
          categories={categories}
          onSave={async (splits) => {
            try {
              await setRowSplits(row.id, splits);
              // refresh this row in shared store
              const detail = await fetchBankStatement((row as any).importId);
              const updated = detail.rows.find((r) => r.id === row.id);
              if (updated) {
                useRowsStore.getState().setRowsState((prev) =>
                  prev.map((p) => p.id === row.id
                    ? { ...p, ...updated, reviewed: p.reviewed, parentSelected: p.parentSelected, subSelected: p.subSelected }
                    : p));
              }
              setSplitOpen(false);
            } catch (e) {
              alert(errMessage(e));
            }
          }}
          onCancel={() => setSplitOpen(false)}
        />
      )}
      {matchOpen && (
        <tr className="bg-indigo-50">
          <td colSpan={6} className="px-4 py-3">
            <p className="text-xs font-semibold text-slate-700 mb-1">Existing expense matches</p>
            {matches.length === 0 ? (
              <p className="text-xs text-slate-500">No matches found within ±2 days for ₹{row.amount}.</p>
            ) : (
              <div className="space-y-1">
                {matches.slice(0, 5).map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded bg-white p-2 text-xs">
                    <span>
                      {m.category.icon} {m.category.name} · {m.date.slice(0, 10)} · {fmtMoney(m.amount)} · {m.notes ?? '—'}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-slate-500">{Math.round(m.similarity * 100)}% match</span>
                      <button
                        onClick={async () => {
                          await reconcileRow(row.id, m.id);
                          setMatchOpen(false);
                        }}
                        className="rounded bg-indigo-600 px-2 py-0.5 text-white"
                      >
                        Link
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function buildCategoryOptions(categories: Category[]) {
  return categories.map((c) => ({ value: c.id, label: `${c.icon} ${c.parentId ? '↳ ' : ''}${c.name}` }));
}

function SplitEditor({
  row, categories, onSave, onCancel,
}: {
  row: RowState;
  categories: Category[];
  onSave: (splits: SplitDraft[]) => void;
  onCancel: () => void;
}) {
  const initial: SplitDraft[] = row.splits && row.splits.length > 0
    ? row.splits.map((s) => ({ categoryId: s.categoryId, amount: Number(s.amount), notes: s.notes ?? undefined }))
    : [{ categoryId: row.subSelected || row.parentSelected || '', amount: Number(row.amount) }];
  const [splits, setSplits] = useState<SplitDraft[]>(initial);
  const sum = splits.reduce((s, x) => s + x.amount, 0);
  const valid = Math.abs(sum - Number(row.amount)) < 0.01;

  return (
    <tr className="bg-indigo-50">
      <td colSpan={6} className="px-4 py-3">
        <p className="text-xs font-semibold text-slate-700 mb-2">Split ₹{fmtMoney(row.amount)} into multiple categories</p>
        <div className="space-y-2">
          {splits.map((s, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex-1">
                <SearchableSelect
                  options={buildCategoryOptions(categories)}
                  value={s.categoryId}
                  onChange={(id) => setSplits((prev) => prev.map((p, j) => j === i ? { ...p, categoryId: id } : p))}
                  placeholder="Category…"
                />
              </div>
              <input
                type="number"
                value={s.amount}
                onChange={(e) => setSplits((prev) => prev.map((p, j) => j === i ? { ...p, amount: parseFloat(e.target.value) || 0 } : p))}
                className="w-32 rounded border border-slate-300 px-2 py-1 text-sm"
              />
              {splits.length > 1 && (
                <button onClick={() => setSplits((prev) => prev.filter((_, j) => j !== i))} className="text-red-500 px-2">×</button>
              )}
            </div>
          ))}
          {splits.length < 5 && (
            <button
              onClick={() => setSplits((prev) => [...prev, { categoryId: '', amount: 0 }])}
              className="text-xs text-indigo-600 hover:underline"
            >
              + Add split
            </button>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className={`text-xs ${valid ? 'text-emerald-700' : 'text-red-600'}`}>
            Sum: ₹{sum.toFixed(2)} / ₹{Number(row.amount).toFixed(2)} {valid ? '✓' : '✗'}
          </span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">Cancel</button>
            <button
              disabled={!valid || splits.some((s) => !s.categoryId)}
              onClick={() => onSave(splits.filter((s) => s.categoryId))}
              className="rounded bg-indigo-600 px-3 py-1 text-xs text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Save splits
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}