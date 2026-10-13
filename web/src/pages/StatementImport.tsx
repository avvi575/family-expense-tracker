import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  confirmStatementImport,
  deleteStatementImport,
  fetchCategories,
  fetchSettings,
  fetchStatementImport,
  fetchStatementImports,
  patchStatementRows,
  scanInbox,
  uploadStatement,
  type StatementRowPatch,
} from '../api';
import { fmtMoney, useAuth } from '../stores/auth';
import { errMessage } from '../api/client';
import SearchableSelect from '../components/SearchableSelect';
import type { Category, StatementImport, StatementImportDetail, StatementRow, User } from '../types';

function statusBadge(status: string) {
  if (status === 'IMPORTED') return 'bg-emerald-100 text-emerald-700';
  if (status === 'FAILED') return 'bg-red-100 text-red-700';
  return 'bg-amber-100 text-amber-700';
}

type View = 'IDLE' | 'LOADING' | 'PARSED' | 'CONFIRMING';

interface RowState extends StatementRow {
  parentSelected: string; // parent category id
  subSelected: string;    // subcategory id (child of parentSelected)
  committedDescription: string;
}

function isEligibleRow(row: { isCredit: boolean; duplicate: boolean }) {
  return !row.isCredit && !row.duplicate;
}

function effectiveCategoryId(row: Pick<RowState, 'subSelected' | 'parentSelected' | 'categoryId' | 'suggestedCategoryId'>) {
  return row.subSelected || row.parentSelected || row.categoryId || row.suggestedCategoryId || null;
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

export default function StatementImportPage() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const currentUser = useAuth((s) => s.user);
  const isAdmin = activeFamily?.role === 'ADMIN';
  const navigate = useNavigate();

  const [view, setView] = useState<View>('IDLE');
  const [imports, setImports] = useState<(StatementImport & { rowCount: number })[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeImport, setActiveImport] = useState<StatementImportDetail | null>(null);
  const [rows, setRows] = useState<RowState[]>([]);
  const [tab, setTab] = useState<'debit' | 'credit' | 'duplicate'>('debit');
  const [error, setError] = useState('');
  const [inboxDir, setInboxDir] = useState<string>('');

  useEffect(() => {
    fetchSettings().then((s) => setInboxDir(s.statementInboxDir || '')).catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<RowState[]>([]);
  const rowPatchVersions = useRef(new Map<string, number>());

  type RowsUpdater = (previous: RowState[]) => RowState[];

  function setRowsState(updater: RowsUpdater) {
    setRows((previous) => {
      const next = updater(previous);
      rowsRef.current = next;
      return next;
    });
  }

  function descriptionPatch(row: RowState): Partial<StatementRowPatch> {
    return row.description === row.committedDescription ? {} : { description: row.description };
  }

  async function patchRowsOptimistically(
    patches: StatementRowPatch[],
    updater: RowsUpdater,
  ): Promise<boolean> {
    if (!activeImport || !isAdmin || patches.length === 0) return false;

    const before = rowsRef.current;
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
      await patchStatementRows(activeImport.id, patches);
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
    fetchStatementImports(activeFamily.id).then(setImports).catch(() => {});
  }

  useEffect(() => {
    if (activeFamily) fetchCategories(activeFamily.id).then(setCategories).catch(() => {});
    loadHistory();
  }, [activeFamily]);

  async function openFile(file: File) {
    if (!activeFamily || !isAdmin) return;
    setError('');
    setView('LOADING');
    try {
      const imp = await uploadStatement(activeFamily.id, file);
      showImportDetail(imp.id);
      loadHistory();
    } catch (e) {
      setError(errMessage(e));
      setView('IDLE');
    }
  }

  async function scanFolder() {
    if (!activeFamily || !isAdmin) return;
    setError('');
    setView('LOADING');
    try {
      const result = await scanInbox(activeFamily.id);
      loadHistory();
      if (result.failed === 0 && result.processed === 0) {
        addToast('Inbox empty — drop PDF statements into the inbox folder first, then scan again.');
      } else if (result.failed === 0) {
        addToast(`Parsed ${result.processed} file(s) from inbox`);
      } else {
        const errs = result.results.filter((r) => r.status === 'error');
        setError(`${result.processed} parsed, ${result.failed} failed: ` + errs.map((e) => `${e.fileName}: ${e.error}`).join('; '));
      }
      setView('IDLE');
    } catch (e) {
      setError(errMessage(e));
      setView('IDLE');
    }
  }

  async function showImportDetail(id: string) {
    const detail = await fetchStatementImport(id);
    setActiveImport(detail);
    setRowsState(() =>
      detail.rows.map((r) => {
        const eligible = isEligibleRow(r);
        const reviewed = r.reviewed ?? (eligible && !!r.suggestedCategoryId);
        const catId = r.categoryId ?? r.suggestedCategoryId ?? '';
        const cat = categories.find((c) => c.id === catId);
        const parentId = cat?.parentId ?? cat?.id ?? '';
        const childId = cat?.parentId ? cat.id : '';
        return {
          ...r,
          reviewed,
          excluded: eligible ? !reviewed : r.excluded,
          parentSelected: parentId,
          subSelected: childId,
          committedDescription: r.description,
        };
      }),
    );
    setView('PARSED');
    setTab('debit');
  }

  // Refresh rows with category mapping when categories finish loading
  useEffect(() => {
    if (rows.length > 0 && categories.length > 0) {
      setRowsState((prev) =>
        prev.map((r) => {
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
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  async function toggleReviewed(id: string) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || !isEligibleRow(row) || !isAdmin) return;
    const reviewed = !row.reviewed;
    const patch: StatementRowPatch = {
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

  async function toggleParent(id: string, parentId: string) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || !isEligibleRow(row) || !isAdmin) return;
    const patch: StatementRowPatch = {
      id,
      categoryId: parentId || null,
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
            categoryId: parentId || null,
            reviewed: true,
            excluded: false,
            ...reviewedFields(currentUser, true),
          }
        : r),
    );
  }

  async function toggleSub(id: string, subId: string) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || !isEligibleRow(row) || !isAdmin) return;
    const categoryId = subId || row.parentSelected || null;
    const patch: StatementRowPatch = {
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
    setRowsState((rs) => rs.map((r) => (r.id === id ? { ...r, description } : r)));
  }

  async function commitDescription(id: string, description: string) {
    const row = rowsRef.current.find((r) => r.id === id);
    if (!row || row.description === row.committedDescription || !isAdmin) return;
    await patchRowsOptimistically([{ id, description }], (previous) =>
      previous.map((r) => r.id === id ? { ...r, description, committedDescription: description } : r),
    );
  }

  const filteredRows = {
    debit: rows.filter((r) => !r.isCredit && !r.duplicate),
    credit: rows.filter((r) => r.isCredit),
    duplicate: rows.filter((r) => r.duplicate),
  };

  const reviewedRows = filteredRows.debit.filter((r) => r.reviewed);
  const pendingRows = filteredRows.debit.filter((r) => !r.reviewed);
  const reviewedSum = reviewedRows.reduce((s, r) => s + Number(r.amount), 0);

  // Count rows that have an auto-detected category
  const autoSuggestedCount = filteredRows.debit.filter(
    (r) => !r.categoryId && !!r.suggestedCategoryId,
  ).length;

  async function bulkReview(checked: boolean) {
    const eligible = filteredRows.debit;
    if (eligible.length === 0 || !isAdmin) return;
    const patches: StatementRowPatch[] = eligible.map((r) => ({
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

  async function confirmImport() {
    if (!activeImport || !isAdmin || reviewedRows.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const patches: StatementRowPatch[] = rows.map((r) => {
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
      const res = await confirmStatementImport(activeImport.id);
      addToast(`Imported ${res.imported} reviewed expenses. ${res.skipped} skipped (pending/credits/duplicates/excluded).`);
      setActiveImport(null);
      setRowsState(() => []);
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
    await deleteStatementImport(id).catch((e) => addToast(errMessage(e)));
    loadHistory();
  }

  if (!activeFamily) return <p className="text-slate-500">Create or join a family first.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Credit Statement Import</h1>
          <p className="text-sm text-slate-500">Upload or scan credit card statements (HDFC, ICICI, SBI, Citi, Amex, and more).</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && openFile(e.target.files[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Upload Statement
            </button>
            <button
              onClick={scanFolder}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Scan Inbox Folder
            </button>
          </div>
        )}
        {error && <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-600">{error}</p>}
      </div>

      {/* Inbox folder path */}
      <div className="rounded-lg bg-slate-100 border border-slate-200 px-4 py-3 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-700">📂 Statement inbox folder:</p>
            <p className="mt-1 font-mono text-xs text-slate-600 break-all">
              {inboxDir || <span className="italic text-slate-400">backend/statement-inbox (default)</span>}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Drop PDF statements into this folder, then click "Scan Inbox Folder" to auto-import them.
            </p>
          </div>
          {isAdmin && (
            <Link
              to="/settings"
              className="shrink-0 rounded border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              ⚙️ Change…
            </Link>
          )}
        </div>
      </div>

      {toasts.length > 0 && (
        <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{toasts[toasts.length - 1]}</p>
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
          autoSuggestedCount={autoSuggestedCount}
          toggleReviewed={toggleReviewed}
          toggleParent={toggleParent}
          toggleSub={toggleSub}
          toggleDescription={toggleDescription}
          commitDescription={commitDescription}
          bulkReview={bulkReview}
          onConfirm={confirmImport}
          busy={busy}
          validationPassed={activeImport.validationPass}
          delta={activeImport.validationDelta}
          onBack={() => { setActiveImport(null); setView('IDLE'); }}
          canConfirm={isAdmin && reviewedRows.length > 0}
        />
      )}

      {view === 'IDLE' && (
        <div className="rounded-xl bg-white p-5 shadow-sm">
          {imports.length === 0 ? (
            <p className="text-sm text-slate-400">
              No hits yet. {isAdmin ? 'Upload your CC statement PDF, or drop PDFs into backend/statement-inbox/ and hit "Scan Inbox Folder".' : ''}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Bank</th>
                  <th className="px-4 py-3">Card</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Rows</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{imp.createdAt.slice(0, 10)}</td>
                    <td className="px-4 py-2.5">{imp.bank}</td>
                    <td className="px-4 py-2.5">••••{imp.cardLast4}</td>
                    <td className="px-4 py-2.5">{imp.periodFrom.slice(0, 7)} → {imp.periodTo.slice(0, 7)}</td>
                    <td className="px-4 py-2.5">{imp.rowCount ?? (imp.importedCount ?? '—')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(imp.status)}`}>
                        {imp.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{imp.sourceType === 'INBOX' ? '📥 Inbox' : '📤 Upload'}</td>
                    {isAdmin && (
                      <td className="px-4 py-2.5">
                        <button onClick={() => showImportDetail(imp.id)} className="text-xs text-indigo-500 hover:underline">
                          Review
                        </button>
                        {imp.status !== 'IMPORTED' && (
                          <button onClick={() => handleDelete(imp.id)} className="ml-2 text-xs text-red-500 hover:underline">
                            Delete
                          </button>
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
      )}
    </div>
  );
}

function ReviewView({
  detail,
  rows,
  categories,
  tab,
  setTab,
  filteredRows,
  reviewedRows,
  pendingRows,
  reviewedSum,
  autoSuggestedCount,
  toggleReviewed,
  toggleParent,
  toggleSub,
  toggleDescription,
  commitDescription,
  bulkReview,
  onConfirm,
  busy,
  validationPassed,
  delta,
  onBack,
  canConfirm,
}: {
  detail: StatementImportDetail;
  rows: RowState[];
  categories: Category[];
  tab: 'debit' | 'credit' | 'duplicate';
  setTab: (t: 'debit' | 'credit' | 'duplicate') => void;
  filteredRows: { debit: RowState[]; credit: RowState[]; duplicate: RowState[] };
  reviewedRows: RowState[];
  pendingRows: RowState[];
  reviewedSum: number;
  autoSuggestedCount: number;
  toggleReviewed: (id: string) => void;
  toggleParent: (id: string, parentId: string) => void;
  toggleSub: (id: string, subId: string) => void;
  toggleDescription: (id: string, description: string) => void;
  commitDescription: (id: string, description: string) => void;
  bulkReview: (checked: boolean) => void;
  onConfirm: () => void;
  busy: boolean;
  validationPassed: boolean;
  delta: number | string;
  onBack: () => void;
  canConfirm: boolean;
}) {
  // Build category maps for the dropdowns
  const parentOptions = useMemo(
    () =>
      categories
        .filter((c) => !c.parentId)
        .map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` })),
    [categories],
  );

  const subOptionsFor = (parentId: string) =>
    categories
      .filter((c) => c.parentId === parentId)
      .map((c) => ({ value: c.id, label: `${c.icon} ${c.name}` }));

  const findCat = (id: string) => categories.find((c) => c.id === id);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-indigo-500 hover:underline text-sm">← History</button>
        <h2 className="text-xl font-bold">Review import</h2>
      </div>

      {/* validation banner */}
      <div className={`rounded-lg p-4 text-sm ${validationPassed ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {validationPassed
          ? '✅ Validation passed — extracted total matches statement Purchases/Charges figure.'
          : `⚠️ Delta ₹${delta} — amounts don't match; review carefully before confirming.`}
      </div>

      {/* auto-categorisation banner */}
      <div className="rounded-lg bg-indigo-50 p-4 text-sm text-indigo-800">
        🤖 Auto-categorised <strong>{autoSuggestedCount}</strong> of {filteredRows.debit.length} expense rows based on
        transaction description. <strong>{reviewedRows.length}</strong> reviewed · <strong>{pendingRows.length}</strong> pending.
      </div>

      {/* metadata cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Bank', value: detail.bank },
          { label: 'Card', value: `••••${detail.cardLast4}` },
          { label: 'Statement Total', value: fmtMoney(detail.statementTotal) },
          { label: 'Extracted Total', value: fmtMoney(detail.extractedDebit) },
        ].map((c) => (
          <div key={c.label} className="rounded-xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="mt-1 font-semibold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* tab bar */}
      <div className="flex gap-2 border-b border-slate-200">
        {(['debit', 'credit', 'duplicate'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          >
            {t === 'debit' ? `Expenses (${filteredRows.debit.length})` : t === 'credit' ? `Credits (${filteredRows.credit.length})` : `Duplicates (${filteredRows.duplicate.length})`}
          </button>
        ))}
      </div>

      {/* table */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        {tab === 'debit' && (
          <>
            <div className="flex gap-3 px-4 py-2 text-xs border-b border-slate-100">
              <button onClick={() => bulkReview(true)} className="text-emerald-600 hover:underline">Mark all reviewed</button>
              <button onClick={() => bulkReview(false)} className="text-rose-600 hover:underline">Mark all unreviewed</button>
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
                  {filteredRows.debit.map((r) => {
                    const suggested = findCat(r.suggestedCategoryId ?? '');
                    const confirmed = findCat(r.categoryId ?? '');
                    const detected = confirmed ?? suggested;
                    return (
                      <tr key={r.id} className={`border-t border-slate-100 ${!r.reviewed ? 'bg-slate-50 opacity-70' : ''}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={r.reviewed}
                            onChange={() => toggleReviewed(r.id)}
                            className="accent-emerald-600"
                            title={r.reviewed ? `Reviewed${r.reviewer?.name ? ` by ${r.reviewer.name}` : ''}` : 'Mark reviewed'}
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{r.date.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <input
                            value={r.description}
                            onChange={(e) => toggleDescription(r.id, e.target.value)}
                            onBlur={(e) => commitDescription(r.id, e.target.value)}
                            className="w-full border-0 bg-transparent focus:outline-none"
                          />
                          {detected && !r.categoryId && (
                            <div className="mt-0.5 text-xs text-indigo-600">
                              🤖 detected: {detected.icon} {detected.name}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{fmtMoney(r.amount)}</td>
                        <td className="px-3 py-2">
                          <SearchableSelect
                            options={parentOptions}
                            value={r.parentSelected}
                            onChange={(id) => toggleParent(r.id, id)}
                            placeholder="Category…"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {r.parentSelected ? (
                            <SearchableSelect
                              options={subOptionsFor(r.parentSelected)}
                              value={r.subSelected}
                              onChange={(id) => toggleSub(r.id, id)}
                              placeholder="Subcategory…"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">Pick a category first</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <span>Reviewed: {reviewedRows.length} · {fmtMoney(reviewedSum)} <span className="text-slate-400">· Pending: {pendingRows.length}</span></span>
              <span className="text-xs text-slate-400">
                Only reviewed expenses import; duplicates auto-skipped; credits excluded
              </span>
            </div>
          </>
        )}
        {tab === 'credit' && (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Amount (CR)</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.credit.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 bg-slate-50">
                  <td className="px-4 py-2">{r.date.slice(0, 10)}</td>
                  <td className="px-4 py-2">{r.description}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700">-{fmtMoney(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'duplicate' && (
          <p className="p-4 text-sm text-slate-500">
            {filteredRows.duplicate.length === 0
              ? 'No duplicates found. If you re-upload the same statement, every transaction will appear here.'
              : `${filteredRows.duplicate.length} duplicate transaction(s) will be auto-skipped from the import.`}
          </p>
        )}
      </div>

      {/* confirm */}
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