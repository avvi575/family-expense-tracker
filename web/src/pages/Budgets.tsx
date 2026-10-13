import { FormEvent, useEffect, useState } from 'react';
import { deleteBudget, fetchBudgets, fetchCategories, saveBudget, updateBudget } from '../api';
import { fmtMoney, useAuth } from '../stores/auth';
import { errMessage } from '../api/client';
import type { Category, BudgetItem } from '../types';
import CategoryPicker from '../components/CategoryPicker';
import { monthOf } from './Dashboard';

export default function Budgets() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const [month, setMonth] = useState(monthOf());
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const isViewer = activeFamily?.role === 'VIEWER';
  const isAdmin = activeFamily?.role === 'ADMIN';

  function load() {
    if (!activeFamily) return;
    fetchBudgets(activeFamily.id, month).then(setItems).catch(() => {});
  }

  useEffect(() => {
    load();
    if (activeFamily) fetchCategories(activeFamily.id).then(setCategories).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFamily, month]);

  async function saveEdit(id: string) {
    const amount = Number(editAmount);
    if (!amount || amount <= 0) return;
    await updateBudget(id, amount).catch(() => {});
    setEditingId(null);
    setEditAmount('');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Budgets</h1>
        <div className="flex gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          {!isViewer && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Set budget
            </button>
          )}
        </div>
      </div>

      {!activeFamily && <p className="text-slate-500">Create or join a family first.</p>}

      <div className="space-y-3">
        {items.map((b) => {
          const pct = Math.min(100, Math.round((b.spent / Number(b.amount)) * 100));
          const over = b.spent > Number(b.amount);
          return (
            <div key={b.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">
                  {b.category.icon} {b.category.name}
                </span>
                {editingId === b.id ? (
                  <span className="flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      autoFocus
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(b.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(b.id)}
                      className="text-sm font-medium text-emerald-600 hover:underline"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-sm text-slate-400 hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className={`text-sm font-medium ${over ? 'text-red-600' : 'text-slate-500'}`}>
                    {fmtMoney(b.spent)} / {fmtMoney(b.amount)} ({pct}%)
                  </span>
                )}
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              {!isViewer && editingId !== b.id && (
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(b.id);
                      setEditAmount(String(Number(b.amount)));
                    }}
                    className="text-xs text-indigo-500 hover:underline"
                  >
                    Edit
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (confirm('Remove budget?')) {
                          await deleteBudget(b.id).catch(() => {});
                          load();
                        }
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {items.length === 0 && activeFamily && (
          <p className="text-sm text-slate-400">No budgets set for this month.</p>
        )}
      </div>

      {showForm && activeFamily && (
        <BudgetForm
          familyId={activeFamily.id}
          month={month}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function BudgetForm({
  familyId,
  month,
  categories,
  onClose,
  onSaved,
}: {
  familyId: string;
  month: string;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const firstParent = categories.find((c) => !c.parentId);
  const [parentId, setParentId] = useState(firstParent?.id ?? '');
  const [childId, setChildId] = useState('');
  const categoryId = childId || parentId;
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      await saveBudget({ familyId, categoryId, month, amount: Number(fd.get('amount')) });
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    }
  }

  return (
    <form
      onSubmit={submit}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-bold">Set monthly budget</h2>
        <CategoryPicker
          categories={categories}
          parentId={parentId}
          childId={childId}
          onParentChange={setParentId}
          onChildChange={setChildId}
        />
        <input
          name="amount"
          type="number"
          min="1"
          required
          placeholder="Amount"
          className="w-full rounded-lg border border-slate-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Save</button>
        </div>
      </div>
    </form>
  );
}
