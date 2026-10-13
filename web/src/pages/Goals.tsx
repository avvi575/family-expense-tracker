import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  contributeGoal, createGoal, deleteGoal, deleteGoalContribution, fetchGoals, updateGoal,
} from '../api';
import { errMessage } from '../api/client';
import { fmtMoney, useAuth } from '../stores/auth';
import type { Goal, GoalContribution } from '../types';

function avatarColor(name: string) {
  const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function fmtDate(s: string) {
  const d = new Date(s);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Goals() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const user = useAuth((s) => s.user);
  const isAdmin = activeFamily?.role === 'ADMIN';
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  function load() {
    if (!activeFamily) return;
    fetchGoals(activeFamily.id).then(setGoals).catch((e) => setError(errMessage(e)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFamily]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  async function handleDelete(goal: Goal) {
    if (!confirm(`Delete goal "${goal.name}"? All ${goal.contributions?.length ?? 0} contribution(s) will be removed.`)) return;
    try {
      await deleteGoal(goal.id);
      flash('Goal deleted');
      load();
    } catch (e) {
      setError(errMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Savings goals</h1>
          <p className="text-sm text-slate-500">Track contributions per family member — every rupee is attributed.</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            + New goal
          </button>
        )}
      </div>

      {!activeFamily && <p className="text-slate-500">Create or join a family first.</p>}

      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {toast && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{toast}</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {goals.map((g) => (
          <GoalCard
            key={g.id}
            goal={g}
            canEdit={isAdmin}
            currentUserId={user?.id}
            isAdmin={!!isAdmin}
            onContribute={async (amount, note) => {
              await contributeGoal(g.id, amount, note);
              flash(`Added ${fmtMoney(amount)} to ${g.name}`);
              load();
            }}
            onDeleteContribution={async (cid) => {
              await deleteGoalContribution(g.id, cid);
              flash('Contribution removed');
              load();
            }}
            onEdit={async (patch) => {
              await updateGoal(g.id, patch);
              flash('Goal updated');
              setEditingId(null);
              load();
            }}
            onDelete={() => handleDelete(g)}
            editing={editingId === g.id}
            startEdit={() => setEditingId(g.id)}
            cancelEdit={() => setEditingId(null)}
          />
        ))}
        {goals.length === 0 && activeFamily && (
          <p className="text-sm text-slate-400">No goals yet — create one!</p>
        )}
      </div>

      {showForm && activeFamily && (
        <GoalForm
          familyId={activeFamily.id}
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

function GoalCard({
  goal, canEdit, currentUserId, isAdmin, editing, startEdit, cancelEdit,
  onContribute, onDeleteContribution, onEdit, onDelete,
}: {
  goal: Goal;
  canEdit: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  editing: boolean;
  startEdit: () => void;
  cancelEdit: () => void;
  onContribute: (amount: number, note?: string) => Promise<void>;
  onDeleteContribution: (id: string) => Promise<void>;
  onEdit: (patch: { name?: string; targetAmount?: number; deadline?: string | null }) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const saved = Number(goal.savedAmount);
  const target = Number(goal.targetAmount);
  const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const remaining = Math.max(0, target - saved);
  const contributions = goal.contributions ?? [];

  const totalByMember = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>();
    for (const c of contributions) {
      const cur = map.get(c.memberId) ?? { name: c.memberName, total: 0, count: 0 };
      cur.total += Number(c.amount);
      cur.count += 1;
      map.set(c.memberId, cur);
    }
    return Array.from(map.entries())
      .map(([memberId, v]) => ({ memberId, ...v }))
      .sort((a, b) => b.total - a.total);
  }, [contributions]);

  return (
    <div className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <input
            id={`edit-name-${goal.id}`}
            defaultValue={goal.name}
            className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm font-semibold"
          />
        ) : (
          <h3 className="font-semibold">{goal.name}</h3>
        )}
        {canEdit && !editing && (
          <div className="flex shrink-0 gap-2 text-xs">
            <button onClick={startEdit} className="text-indigo-500 hover:underline">Edit</button>
            <button onClick={onDelete} className="text-red-500 hover:underline">Delete</button>
          </div>
        )}
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-600' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-slate-500">
        <span className="font-medium text-slate-700">{fmtMoney(saved)}</span> of {fmtMoney(target)} ({pct}%)
        {goal.deadline ? ` · by ${goal.deadline.slice(0, 10)}` : ''}
      </p>
      {remaining > 0 && (
        <p className="text-xs text-slate-400">{fmtMoney(remaining)} to go</p>
      )}

      {editing && (
        <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-slate-500">
              Target
              <input
                id={`edit-target-${goal.id}`}
                type="number"
                min="1"
                defaultValue={target}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
            <label className="flex-1 text-xs text-slate-500">
              Deadline
              <input
                id={`edit-deadline-${goal.id}`}
                type="date"
                defaultValue={goal.deadline?.slice(0, 10) ?? ''}
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={cancelEdit} className="rounded px-3 py-1 text-xs text-slate-500 hover:bg-slate-200">Cancel</button>
            <button
              onClick={async () => {
                const nameEl = document.getElementById(`edit-name-${goal.id}`) as HTMLInputElement | null;
                const targetEl = document.getElementById(`edit-target-${goal.id}`) as HTMLInputElement | null;
                const deadlineEl = document.getElementById(`edit-deadline-${goal.id}`) as HTMLInputElement | null;
                if (!nameEl || !targetEl) return;
                await onEdit({
                  name: nameEl.value.trim(),
                  targetAmount: Number(targetEl.value) || target,
                  deadline: deadlineEl && deadlineEl.value ? deadlineEl.value : null,
                });
              }}
              className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-700"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Per-member totals */}
      {totalByMember.length > 0 && (
        <div className="space-y-1 border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-500">Contributions by member</p>
          <ul className="space-y-1">
            {totalByMember.map((m) => (
              <li key={m.memberId} className="flex items-center gap-2 text-xs">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: avatarColor(m.name) }}
                  title={m.name}
                >
                  {initials(m.name) || '?'}
                </span>
                <span className="flex-1 truncate text-slate-700">{m.name}</span>
                <span className="text-slate-500">{m.count}×</span>
                <span className="font-medium text-slate-700">{fmtMoney(m.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Add contribution form (members + admins) */}
      <form
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const amount = Number(fd.get('amount'));
          if (!Number.isFinite(amount) || amount <= 0) return;
          const note = String(fd.get('note') || '').trim() || undefined;
          e.currentTarget.reset();
          await onContribute(amount, note);
        }}
        className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center"
      >
        <input
          name="amount"
          type="number"
          min="1"
          step="0.01"
          required
          placeholder="Amount"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm sm:w-28"
        />
        <input
          name="note"
          placeholder="Note (e.g. June savings)"
          className="w-full flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
          + Contribute
        </button>
      </form>

      {/* Contributions list */}
      {contributions.length > 0 && (
        <details className="border-t border-slate-100 pt-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
            {contributions.length} contribution{contributions.length === 1 ? '' : 's'} — show audit trail
          </summary>
          <ul className="mt-2 space-y-1.5">
            {contributions.map((c: GoalContribution) => {
              const canDelete = isAdmin || c.memberId === currentUserId;
              return (
                <li key={c.id} className="flex items-start gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: avatarColor(c.memberName) }}
                    title={c.memberName}
                  >
                    {initials(c.memberName) || '?'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-700">
                      <span className="font-medium">{c.memberName}</span>
                      <span className="text-slate-400"> · {fmtDate(c.createdAt)}</span>
                    </p>
                    {c.note && <p className="truncate text-slate-500">“{c.note}”</p>}
                  </div>
                  <span className="font-semibold text-emerald-700">+{fmtMoney(c.amount)}</span>
                  {canDelete && (
                    <button
                      onClick={() => onDeleteContribution(c.id)}
                      className="shrink-0 text-slate-400 hover:text-red-500"
                      title="Remove this contribution"
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}

function GoalForm({
  familyId, onClose, onSaved,
}: {
  familyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await createGoal({
        familyId,
        name: String(fd.get('name') || '').trim(),
        targetAmount: Number(fd.get('targetAmount')),
        deadline: String(fd.get('deadline') || '') || undefined,
      });
      onSaved();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-lg">
        <h2 className="text-lg font-bold">New savings goal</h2>
        <input name="name" required placeholder="Goal name" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input name="targetAmount" type="number" min="1" required placeholder="Target amount" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        <input name="deadline" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-slate-100">
            Cancel
          </button>
          <button disabled={busy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </form>
  );
}
