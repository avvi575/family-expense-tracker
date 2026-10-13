import { FormEvent, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  createExpense,
  deleteExpense,
  fetchCategories,
  fetchExpenses,
  updateExpense,
  uploadReceipt,
} from '../api';
import { fmtMoney, useAuth } from '../stores/auth';
import { errMessage } from '../api/client';
import type { Category, Expense, PaymentMethod, RecurringInterval, RecurringExpense } from '../types';
import {
  createRecurring,
  deleteRecurring,
  fetchRecurring,
} from '../api';
import CategoryPicker from '../components/CategoryPicker';
import SearchableSelect from '../components/SearchableSelect';
import { monthOf } from './Dashboard';

function dayStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function downloadCsv(filename: string, rows: string[]) {
  const csv = rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const METHODS: PaymentMethod[] = ['CASH', 'CARD', 'UPI', 'BANK_TRANSFER', 'OTHER'];

const INTERVAL_OPTIONS: { value: RecurringInterval; label: string }[] = [
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'ANNUAL', label: 'Annual' },
];

/** Preset ranges relative to today. */
const PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  {
    label: 'This month',
    range: () => {
      const now = new Date();
      return { from: dayStr(new Date(now.getFullYear(), now.getMonth(), 1)), to: dayStr(now) };
    },
  },
  {
    label: 'Last month',
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: dayStr(start), to: dayStr(end) };
    },
  },
  {
    label: 'Last 30 days',
    range: () => {
      const now = new Date();
      return { from: dayStr(new Date(now.getTime() - 29 * 86400000)), to: dayStr(now) };
    },
  },
  {
    label: 'Year to date',
    range: () => {
      const now = new Date();
      return { from: dayStr(new Date(now.getFullYear(), 0, 1)), to: dayStr(now) };
    },
  },
];

export default function Expenses() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const location = useLocation();
  const [from, setFrom] = useState(() => PRESETS[0].range().from);
  const [to, setTo] = useState(() => PRESETS[0].range().to);
  const [items, setItems] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [recurring, setRecurring] = useState<RecurringExpense[]>([]);
  const [showRecurring, setShowRecurring] = useState(false);
  const [lockedRecurring, setLockedRecurring] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isAdmin = activeFamily?.role === 'ADMIN';

  function load() {
    if (!activeFamily) return;
    fetchExpenses({ familyId: activeFamily.id, from, to }).then((r) => setItems(r.items)).catch(() => {});
    fetchRecurring(activeFamily.id).then(setRecurring).catch(() => {});
  }

  useEffect(() => {
    load();
    if (activeFamily) fetchCategories(activeFamily.id).then(setCategories).catch(() => {});
  }, [activeFamily, from, to]);

  useEffect(() => {
    if (location.pathname === '/' || location.pathname === '/expenses') {
      if (activeFamily) fetchCategories(activeFamily.id).then(setCategories).catch(() => {});
    }
  }, [location.pathname, activeFamily]);

  async function handleDelete(e: Expense) {
    if (e.recurringId) {
      // Don't even attempt the API call — show a friendly modal pointing the
      // user to the Recurring Expenses section, where the rule itself lives.
      setLockedRecurring(e);
      return;
    }
    if (!confirm('Delete this expense?')) return;
    await deleteExpense(e.id).catch((err) => alert(errMessage(err)));
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Expenses</h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="text-slate-500">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-slate-500">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                const r = p.range();
                setFrom(r.from);
                setTo(r.to);
              }}
              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-100"
            >
              {p.label}
            </button>
          ))}
          <input
            type="search"
            placeholder="Search expenses…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => {
              const label = from && to ? `${from}_${to}` : 'report';
              const header = 'Date,Category,Notes,Paid by,Method,Amount\n';
              const rows = items
                .filter((e) => {
                  if (!searchQuery.trim()) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    e.notes?.toLowerCase().includes(q) ||
                    e.category.name.toLowerCase().includes(q) ||
                    e.paidBy.name.toLowerCase().includes(q) ||
                    e.paymentMethod.toLowerCase().includes(q) ||
                    e.date.includes(q)
                  );
                })
                .map((e) =>
                  `${e.date.slice(0, 10)},"${e.category.name}","${(e.notes || '').replace(/"/g, '""')}","${e.paidBy.name}","${e.paymentMethod.replace('_', ' ')}",${Number(e.amount).toFixed(2)}`,
                );
              downloadCsv(`expenses-${label}.csv`, [header, ...rows]);
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ⬇ Export
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + Add expense
          </button>
        </div>
      </div>

      {!activeFamily && <p className="text-slate-500">Create or join a family first.</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Paid by</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items
              .filter((e) => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  e.notes?.toLowerCase().includes(q) ||
                  e.category.name.toLowerCase().includes(q) ||
                  e.paidBy.name.toLowerCase().includes(q) ||
                  e.paymentMethod.toLowerCase().includes(q) ||
                  e.date.includes(q)
                );
              })
              .map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="px-4 py-2.5">{e.date.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: e.category.color }}
                    >
                      {e.category.icon} {e.category.name}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2.5 text-slate-500">
                    {e.notes}
                    {e.recurringId && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700"
                        title={`Auto-generated by recurring rule "${e.recurring?.name ?? e.recurringId}" (${e.recurring?.interval ?? ''})`}
                      >
                        🔁 Recurring
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{e.paidBy.name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{e.paymentMethod.replace('_', ' ')}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{fmtMoney(e.amount)}</td>
                  <td className="px-4 py-2.5">
                    {!e.recurringId && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingExpense(e)}
                          className="text-indigo-500 hover:underline"
                          title="Edit expense"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(e)}
                          className="text-red-500 hover:underline"
                          title={e.recurringId ? 'This expense is auto-generated by a recurring rule' : 'Delete this expense'}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No expenses this month.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {activeFamily && (
        <div id="recurring-section" className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Recurring expenses</h2>
            {isAdmin && (
              <button
                onClick={() => setShowRecurring(true)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + New recurring
              </button>
            )}
          </div>
          <div className="space-y-2">
            {recurring.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: r.category.color }}
                  >
                    {r.category.icon} {r.category.name}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs text-slate-500">
                      {INTERVAL_OPTIONS.find((o) => o.value === r.interval)?.label ?? r.interval} ·
                      starts {r.startDate.slice(0, 10)}
                      {r.endDate ? ` · ends ${r.endDate.slice(0, 10)}` : ''} · next due{' '}
                      {r.nextDue ? r.nextDue.slice(0, 10) : '—'}
                      {!r.active && ' · inactive'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">{fmtMoney(r.amount)}</span>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        if (!confirm('Delete this recurring expense?')) return;
                        await deleteRecurring(r.id).catch(() => {});
                        load();
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
            {recurring.length === 0 && (
              <p className="text-sm text-slate-400">
                No recurring expenses yet. {isAdmin ? 'Add one (e.g. monthly maintenance, quarterly LIC).' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {showForm && activeFamily && (
        <ExpenseForm
          categories={categories}
          familyId={activeFamily.id}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      {editingExpense && activeFamily && (
        <EditExpenseForm
          expense={editingExpense}
          categories={categories}
          onClose={() => setEditingExpense(null)}
          onSaved={() => {
            setEditingExpense(null);
            load();
          }}
        />
      )}

      {showRecurring && activeFamily && (
        <RecurringForm
          categories={categories}
          familyId={activeFamily.id}
          onClose={() => setShowRecurring(false)}
          onSaved={() => {
            setShowRecurring(false);
            load();
          }}
        />
      )}

      {lockedRecurring && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setLockedRecurring(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-lg"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">🔁</span>
              <div className="flex-1">
                <h2 className="text-lg font-bold">Recurring expense — can't delete here</h2>
                <p className="mt-1 text-sm text-slate-600">
                  This expense was auto-generated by the recurring rule{' '}
                  <span className="font-semibold">"{lockedRecurring.recurring?.name ?? lockedRecurring.recurringId}"</span>
                  {lockedRecurring.recurring?.interval ? ` (${lockedRecurring.recurring.interval.toLowerCase().replace('_', ' ')})` : ''}.
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  To stop it from being created in future months, edit or delete the rule from the
                  <span className="font-medium"> Recurring expenses</span> section on this page
                  (or below in <em>Monthly recurring</em>).
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Note: when you delete a rule, its past materialised expenses remain in history
                  so the audit trail stays intact.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                onClick={() => setLockedRecurring(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              >
                Got it
              </button>
              <button
                onClick={() => {
                  setLockedRecurring(null);
                  setShowRecurring(true);
                  // give the section a chance to mount, then scroll it into view
                  setTimeout(() => {
                    const el = document.getElementById('recurring-section');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 50);
                }}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Manage Recurring →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecurringForm({
  categories,
  familyId,
  onClose,
  onSaved,
}: {
  categories: Category[];
  familyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const firstParent = categories.find((c) => !c.parentId);
  const [parentId, setParentId] = useState(firstParent?.id ?? '');
  const [childId, setChildId] = useState('');
  const categoryId = childId || parentId;
  const [interval, setInterval] = useState<RecurringInterval>('MONTHLY');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createRecurring({
        familyId,
        name,
        categoryId,
        amount: Number(amount),
        interval,
        startDate,
        endDate: endDate || undefined,
        paymentMethod: method,
        notes: notes || undefined,
      });
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-bold">New recurring expense</h2>
        <input
          required
          placeholder="Name (e.g. Apartment maintenance, LIC policy)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          required
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount per cycle"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <CategoryPicker
          categories={categories}
          parentId={parentId}
          childId={childId}
          onParentChange={setParentId}
          onChildChange={setChildId}
        />
        <SearchableSelect
          options={METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') }))}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethod)}
          placeholder="Payment method…"
        />
        <SearchableSelect
          options={INTERVAL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={interval}
          onChange={(v) => setInterval(v as RecurringInterval)}
          placeholder="Interval…"
        />
        <div className="flex gap-2">
          <label className="w-1/2">
            <span className="text-xs text-slate-500">Start date</span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="w-1/2">
            <span className="text-xs text-slate-500">End date (optional)</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <input
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function EditExpenseForm({
  expense, categories, onClose, onSaved,
}: {
  expense: Expense;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(Number(expense.amount)));
  const parentCategory = categories.find((c) => c.id === expense.category.id)?.parentId
    ? categories.find((c) => c.id === expense.category.parentId)
    : expense.category;
  const [parentId, setParentId] = useState(parentCategory?.id ?? '');
  const [childId, setChildId] = useState(parentCategory?.id === expense.category.id ? '' : expense.category.id);
  const categoryId = childId || parentId;
  const [date, setDate] = useState(expense.date.slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>(expense.paymentMethod as PaymentMethod);
  const [notes, setNotes] = useState(expense.notes || '');
  const [receiptUrl, setReceiptUrl] = useState(expense.receiptUrl || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateExpense(expense.id, {
        amount: Number(amount),
        date,
        paymentMethod: method,
        notes: notes || undefined,
        categoryId,
        receiptUrl: receiptUrl || undefined,
      });
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    try {
      const url = await uploadReceipt(file);
      setReceiptUrl(url);
    } catch {
      setError('Upload failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-bold">Edit expense</h2>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <CategoryPicker
          categories={categories}
          parentId={parentId}
          childId={childId}
          onParentChange={setParentId}
          onChildChange={setChildId}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <SearchableSelect
          options={METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') }))}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethod)}
          placeholder="Payment method…"
        />
        <input
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="w-full text-sm"
        />
        {receiptUrl && <p className="text-xs text-green-600">Receipt uploaded ✓</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function ExpenseForm({
  categories,
  familyId,
  onClose,
  onSaved,
}: {
  categories: Category[];
  familyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const firstParent = categories.find((c) => !c.parentId);
  const [parentId, setParentId] = useState(firstParent?.id ?? '');
  const [childId, setChildId] = useState('');
  const categoryId = childId || parentId;
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [notes, setNotes] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createExpense({
        familyId,
        categoryId,
        amount: Number(amount),
        date,
        paymentMethod: method,
        notes: notes || undefined,
        receiptUrl: receiptUrl || undefined,
      });
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    try {
      const url = await uploadReceipt(file);
      setReceiptUrl(url);
    } catch {
      setError('Upload failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-bold">Add expense</h2>
        <input
          required
          type="number"
          step="0.01"
          min="0"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <CategoryPicker
          categories={categories}
          parentId={parentId}
          childId={childId}
          onParentChange={setParentId}
          onChildChange={setChildId}
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <SearchableSelect
          options={METHODS.map((m) => ({ value: m, label: m.replace('_', ' ') }))}
          value={method}
          onChange={(v) => setMethod(v as PaymentMethod)}
          placeholder="Payment method…"
        />
        <input
          placeholder="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        <input
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.pdf"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="w-full text-sm"
        />
        {receiptUrl && <p className="text-xs text-green-600">Receipt uploaded ✓</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
