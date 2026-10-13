import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createIncome,
  deleteIncome,
  fetchIncomeSummary,
  fetchIncomes,
  fetchSummary,
  updateIncome,
  fetchMembers,
} from '../api';
import { fmtMoney, useAuth } from '../stores/auth';
import { errMessage } from '../api/client';
import type { FamilyMember, Income, IncomeType, IncomeSummary } from '../types';
import { INCOME_TYPES } from '../types';
import SearchableSelect from '../components/SearchableSelect';

const TYPE_LABEL: Record<IncomeType, string> = {
  SALARY: '🪔 Salary',
  RENTAL: '🏠 Rental',
  BUSINESS: '🏢 Business',
  INVESTMENT: '📈 Investment',
  GIFT: '🎁 Gift',
  BONUS: '🎉 Bonus',
  FREELANCE: '💻 Freelance',
  OTHER: '📦 Other',
};

function dayStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PRESETS = [
  { label: 'This month', range: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), n.getMonth(), 1)), to: dayStr(n) }; } },
  { label: 'Last month', range: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), n.getMonth()-1, 1)), to: dayStr(new Date(n.getFullYear(), n.getMonth(), 0)) }; } },
  { label: 'Last 90 days', range: () => { const n = new Date(); return { from: dayStr(new Date(n.getTime()-89*86400000)), to: dayStr(n) }; } },
  { label: 'Year to date', range: () => { const n = new Date(); return { from: dayStr(new Date(n.getFullYear(), 0, 1)), to: dayStr(n) }; } },
];

export default function IncomePage() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const currentUser = useAuth((s) => s.user);
  const isAdmin = activeFamily?.role === 'ADMIN';
  const isViewer = activeFamily?.role === 'VIEWER';

  const initial = PRESETS[0].range();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [summary, setSummary] = useState<IncomeSummary | null>(null);
  const [expenseSummary, setExpenseSummary] = useState<{ totalSpent: number } | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editActive, setEditActive] = useState(true);

  function load() {
    if (!activeFamily) return;
    fetchIncomes(activeFamily.id).then(setIncomes).catch(() => {});
    fetchIncomeSummary(activeFamily.id, { from, to }).then(setSummary).catch(() => {});
    fetchSummary(activeFamily.id, { from, to }).then(setExpenseSummary).catch(() => {});
  }

  useEffect(() => {
    if (!activeFamily) return;
    load();
    fetchMembers(activeFamily.id).then(setMembers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFamily, from, to]);

  const recurringList = useMemo(() => incomes.filter((i) => i.isRecurring), [incomes]);
  const adhocList = useMemo(() => incomes.filter((i) => !i.isRecurring), [incomes]);
  const netSavings = summary && expenseSummary != null ? summary.totalIncome - expenseSummary.totalSpent : null;

  async function saveEdit(id: string) {
    await updateIncome(id, { amount: Number(editAmount), active: editActive }).catch(() => {});
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this income entry?')) return;
    await deleteIncome(id).catch(() => {});
    load();
  }

  if (!activeFamily) return <p className="text-slate-500">Create or join a family first (Members page).</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Family Income</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="text-slate-500">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-slate-500">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5" />
          </span>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => { const r = p.range(); setFrom(r.from); setTo(r.to); }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-600 hover:bg-slate-100">
              {p.label}
            </button>
          ))}
          {!isViewer && (
            <button onClick={() => setShowForm(true)} className="rounded-lg bg-indigo-600 px-4 py-1.5 font-medium text-white hover:bg-indigo-700">
              + Add income
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-emerald-50 p-5 shadow-sm">
          <p className="text-sm text-emerald-700">Total income</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{fmtMoney(summary?.totalIncome ?? 0)}</p>
          {(summary?.months ?? 1) > 1 && <p className="mt-0.5 text-xs text-emerald-600">across {summary!.months} months</p>}
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Monthly declarations</p>
          <p className="mt-1 text-2xl font-bold">{fmtMoney(summary?.recurringTotal ?? 0)}</p>
          <p className="mt-0.5 text-xs text-slate-400">Adhoc {fmtMoney(summary?.adhocTotal ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total expenses</p>
          <p className="mt-1 text-2xl font-bold">{fmtMoney(expenseSummary?.totalSpent ?? 0)}</p>
        </div>
        <div className={`rounded-xl p-5 shadow-sm ${netSavings !== null && netSavings >= 0 ? 'bg-blue-50' : 'bg-red-50'}`}>
          <p className={`text-sm ${netSavings !== null && netSavings >= 0 ? 'text-blue-700' : 'text-red-700'}`}>Net savings</p>
          <p className={`mt-1 text-2xl font-bold ${netSavings !== null && netSavings >= 0 ? 'text-blue-800' : 'text-red-800'}`}>
            {netSavings !== null ? fmtMoney(Math.abs(netSavings)) : '—'}
            {netSavings !== null && netSavings < 0 && <span className="ml-1 text-sm font-normal text-red-600">(deficit)</span>}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Monthly income declarations</h2>
        <p className="mb-4 text-xs text-slate-400">Declared once, counted every month automatically (salary, rental income etc.).</p>
        {recurringList.length === 0 ? (
          <p className="text-sm text-slate-400">No monthly declarations yet. {!isViewer && 'Click "+ Add income" and choose "Monthly (recurring)".'}</p>
        ) : (
          <div className="space-y-2">
            {recurringList.map((inc) => (
              <div key={inc.id} className={`flex items-center justify-between rounded-lg px-4 py-3 ${inc.active ? 'bg-slate-50' : 'bg-slate-100 opacity-60'}`}>
                <div>
                  <p className="text-sm font-medium">{inc.source} <span className="ml-2 text-xs text-slate-400">{TYPE_LABEL[inc.type as IncomeType]}</span></p>
                  <p className="text-xs text-slate-500">{inc.member.name} · since {inc.date.slice(0, 10)}{inc.endDate ? ` – ${inc.endDate.slice(0, 10)}` : ''}{!inc.active && ' · inactive'}</p>
                  {inc.notes && <p className="text-xs italic text-slate-400">{inc.notes}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {editingId === inc.id ? (
                    <>
                      <input type="number" min="1" value={editAmount} autoFocus onChange={(e) => setEditAmount(e.target.value)} className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                      <label className="flex items-center gap-1 text-xs text-slate-500">
                        <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} /> Active
                      </label>
                      <button type="button" onClick={() => saveEdit(inc.id)} className="text-sm text-emerald-600 hover:underline">Save</button>
                      <button type="button" onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:underline">Cancel</button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">{fmtMoney(inc.amount)}<span className="ml-0.5 text-xs text-slate-400">/mo</span></span>
                      {(isAdmin || inc.declaredById === currentUser?.id) && !isViewer && (
                        <>
                          <button type="button" onClick={() => { setEditingId(inc.id); setEditAmount(String(Number(inc.amount))); setEditActive(inc.active); }} className="text-xs text-indigo-500 hover:underline">Edit</button>
                          <button type="button" onClick={() => handleDelete(inc.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Adhoc income in period</h2>
        <p className="mb-4 text-xs text-slate-400">One-time income events: gifts from relatives, investment returns, bonuses, freelance etc.</p>
        {adhocList.length === 0 ? (
          <p className="text-sm text-slate-400">No adhoc income recorded for this period.</p>
        ) : (
          <div className="overflow-hidden rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Member</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {adhocList.map((inc) => (
                  <tr key={inc.id} className="border-t border-slate-100">
                    <td className="px-4 py-2.5">{inc.date.slice(0, 10)}</td>
                    <td className="px-4 py-2.5 font-medium">{inc.source}</td>
                    <td className="px-4 py-2.5 text-slate-500">{TYPE_LABEL[inc.type as IncomeType]}</td>
                    <td className="px-4 py-2.5">{inc.member.name}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-emerald-700">{fmtMoney(inc.amount)}</td>
                    <td className="px-4 py-2.5">
                      {(isAdmin || inc.declaredById === currentUser?.id) && !isViewer && (
                        <button type="button" onClick={() => handleDelete(inc.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {summary && summary.totalIncome > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">By member</h2>
            <ul className="space-y-2">
              {summary.byMember.map((m) => (
                <li key={m.userId} className="rounded-lg bg-slate-50 px-4 py-2">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-sm font-medium text-emerald-700">{fmtMoney(m.total)}</span>
                  </div>
                  <div className="mt-0.5 flex gap-4 text-xs text-slate-400">
                    {m.recurring > 0 && <span>Monthly: {fmtMoney(m.recurring)}</span>}
                    {m.adhoc > 0 && <span>Adhoc: {fmtMoney(m.adhoc)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-semibold">By type</h2>
            <ul className="space-y-2">
              {summary.byType.map((t) => (
                <li key={t.type} className="flex justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                  <span>{TYPE_LABEL[t.type as IncomeType] ?? t.type}</span>
                  <span className="font-medium text-emerald-700">{fmtMoney(t.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {showForm && (
        <IncomeForm
          familyId={activeFamily.id}
          members={members}
          currentUserId={currentUser?.id ?? ''}
          isAdmin={isAdmin}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function IncomeForm({ familyId, members, currentUserId, isAdmin, onClose, onSaved }: {
  familyId: string; members: FamilyMember[]; currentUserId: string; isAdmin: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [isRecurring, setIsRecurring] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const memberIdRaw = fd.get('memberId');
    const endDateRaw = fd.get('endDate');
    const notesRaw = fd.get('notes');
    try {
      await createIncome({
        familyId,
        memberId: memberIdRaw ? String(memberIdRaw) : undefined,
        amount: Number(fd.get('amount')),
        type: String(fd.get('type')) as IncomeType,
        source: String(fd.get('source')),
        isRecurring,
        date: String(fd.get('date')),
        endDate: endDateRaw ? String(endDateRaw) : undefined,
        notes: notesRaw ? String(notesRaw) : undefined,
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
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md space-y-3 rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-bold">Add income</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setIsRecurring(false)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${!isRecurring ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            One-time / Adhoc
          </button>
          <button type="button" onClick={() => setIsRecurring(true)} className={`flex-1 rounded-lg py-2 text-sm font-medium ${isRecurring ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            Monthly (recurring)
          </button>
        </div>
        {isAdmin && (
          <SearchableSelect
            options={members.map((m) => ({
              value: m.user.id,
              label: `${m.user.name}${m.user.id === currentUserId ? ' (me)' : ''}`,
            }))}
            value={currentUserId}
            onChange={(id) => {
              // set hidden form field value for FormData
              const hidden = document.getElementById('income-member-id') as HTMLInputElement | null;
              if (hidden) hidden.value = id;
            }}
            placeholder="Member…"
          />
        )}
        <input id="income-member-id" name="memberId" type="hidden" defaultValue={currentUserId} />
        <input name="source" required placeholder={isRecurring ? "Source (e.g. Salary, House Rent income)" : "Source (e.g. Gift from uncle, LIC maturity payout)"} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input name="amount" type="number" min="1" step="0.01" required placeholder="Amount" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <SearchableSelect
          options={INCOME_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
          value={isRecurring ? 'SALARY' : 'OTHER'}
          onChange={(v) => {
            const hidden = document.getElementById('income-type') as HTMLInputElement | null;
            if (hidden) hidden.value = v;
          }}
          placeholder="Income type…"
        />
        <input id="income-type" name="type" type="hidden" defaultValue={isRecurring ? 'SALARY' : 'OTHER'} />
        <div className="flex gap-2">
          <label className="flex-1">
            <span className="mb-1 block text-xs text-slate-500">{isRecurring ? "Start date" : "Date of income"}</span>
            <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          {isRecurring && (
            <label className="flex-1">
              <span className="mb-1 block text-xs text-slate-500">End date (optional)</span>
              <input name="endDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          )}
        </div>
        <input name="notes" placeholder="Notes (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
