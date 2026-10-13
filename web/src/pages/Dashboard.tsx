import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchReportCsv, fetchSummary, fetchMembers } from '../api';
import { useAuth, fmtMoney } from '../stores/auth';
import type { AggregationType, ReportSummary, FamilyMember } from '../types';

export function monthOf(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

const AGGREGATION_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'YEARLY', label: 'Yearly' },
];

export default function Dashboard() {
  const activeFamily = useAuth((s) => s.activeFamily);
  const initial = PRESETS[0].range();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [aggregation, setAggregation] = useState<AggregationType>('DAILY');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('ALL');
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  useEffect(() => {
    if (!activeFamily) return;
    fetchMembers(activeFamily.id).then(setMembers).catch(() => setMembers([]));
  }, [activeFamily]);

  useEffect(() => {
    if (!activeFamily || !from || !to) return;
    fetchSummary(activeFamily.id, { from, to, aggregation, memberId: selectedMemberId === 'ALL' ? undefined : selectedMemberId }).then(setSummary).catch(() => setSummary(null));
  }, [activeFamily, from, to, aggregation, selectedMemberId]);

  const recent = useMemo(() => summary?.byCategory.slice(0, 8) ?? [], [summary]);
  const chartData = useMemo(() => {
    if (!summary) return [];
    if (selectedMemberId !== 'ALL' && summary.aggregatedByMember) {
      return summary.aggregatedByMember[selectedMemberId] ?? [];
    }
    return aggregation === 'DAILY' ? summary.dailyTotals : (summary.aggregatedTotals ?? []);
  }, [summary, aggregation, selectedMemberId]);

  const memberOptions = useMemo(() => [
    { value: 'ALL', label: 'All Contributors' },
    ...(members.map((m: FamilyMember) => ({ value: m.user.id, label: m.user.name })) ?? [])
  ], [members]);

  if (!activeFamily) return <p className="text-slate-500">Create or join a family first (Members page).</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex items-center gap-1">
            <span className="text-slate-500">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-slate-500">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5"
            />
          </span>
          <span className="flex items-center gap-1">
            <span className="text-slate-500">Group by</span>
            <select
              value={aggregation}
              onChange={(e) => setAggregation(e.target.value as AggregationType)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {AGGREGATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-slate-500">Contributor</span>
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              {memberOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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
          <button
            onClick={() => fetchReportCsv(activeFamily.id, { from, to }).catch(() => {})}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 font-medium text-white hover:bg-emerald-700"
          >
            ⬇ Download report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total spent</p>
          <p className="mt-1 text-2xl font-bold">{fmtMoney(summary?.totalSpent ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Recurring expenses</p>
          <p className="mt-1 text-2xl font-bold">{fmtMoney(summary?.recurringTotal ?? 0)}</p>
          <p className="mt-0.5 text-xs text-slate-400">one-time {fmtMoney(summary?.oneTimeTotal ?? 0)}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Top category</p>
          <p className="mt-1 text-2xl font-bold">{recent[0]?.name ?? '—'}</p>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Members contributing</p>
          <p className="mt-1 text-2xl font-bold">{summary?.byMember.length ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">By category</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400">No expenses this month.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={recent} dataKey="total" nameKey="name" outerRadius={90} label={(e) => e.name}>
                  {recent.map((c) => (
                    <Cell key={c.categoryId} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">{selectedMemberId === 'ALL' ? aggregation : 'Spend'} ({selectedMemberId === 'ALL' ? 'All' : memberOptions.find(o => o.value === selectedMemberId)?.label})</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-400">No data.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tickFormatter={(d: string) => {
                  if (aggregation === 'DAILY') return d.slice(-2);
                  if (aggregation === 'WEEKLY') return d.split('-W')[1] || d;
                  return d;
                }} fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                <Bar dataKey="total" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {(summary?.byRecurring.length ?? 0) > 0 && (
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Recurring breakdown</h2>
          <ul className="space-y-2">
            {summary!.byRecurring.map((r) => (
              <li key={r.id} className="flex justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
                <span>{r.name}</span>
                <span className="font-medium">{fmtMoney(r.total)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold">By member</h2>
        <ul className="space-y-2">
          {(summary?.byMember ?? []).map((m) => (
            <li key={m.userId} className="flex justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm">
              <span>{m.name}</span>
              <span className="font-medium">{fmtMoney(m.total)}</span>
            </li>
          ))}
          {!summary?.byMember.length && <li className="text-sm text-slate-400">No data.</li>}
        </ul>
      </div>
    </div>
  );
}
