import { useEffect, useState } from 'react';
import {
  fetchLatestSnapshot,
  fetchActionSummary,
  fetchCategories,
} from '../lib/api';
import type { Snapshot, ActionSummary, CategoryPerformance } from '../lib/api';
import { formatMoney, formatMoneyCompact, formatPercent, formatDate } from '../lib/format';

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [summary, setSummary] = useState<ActionSummary | null>(null);
  const [categories, setCategories] = useState<CategoryPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const snap = await fetchLatestSnapshot();
        if (cancelled) return;
        setSnapshot(snap);

        const [sum, cats] = await Promise.all([
          fetchActionSummary(snap.id),
          fetchCategories(snap.id),
        ]);
        if (cancelled) return;
        setSummary(sum);
        setCategories(cats);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Compute totals from categories
  const totalSpend = categories.reduce((s, c) => s + c.spend, 0);
  const totalSales = categories.reduce((s, c) => s + c.sales, 0);
  const totalAcos = totalSales > 0 ? (totalSpend / totalSales) * 100 : 0;

  function acosColor(acos: number): string {
    if (acos > 30) return 'text-rose-600';
    if (acos < 20) return 'text-emerald-600';
    return 'text-amber-600';
  }

  function acosBg(acos: number): string {
    if (acos > 30) return 'bg-rose-50';
    if (acos < 20) return 'bg-emerald-50';
    return 'bg-amber-50';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Spend"
          value={formatMoneyCompact(totalSpend)}
          bg="bg-slate-50"
          text="text-slate-700"
        />
        <SummaryCard
          label="Total Sales"
          value={formatMoneyCompact(totalSales)}
          bg="bg-emerald-50"
          text="text-emerald-700"
        />
        <SummaryCard
          label="ACOS"
          value={formatPercent(totalAcos)}
          bg={acosBg(totalAcos)}
          text={acosColor(totalAcos)}
        />
        <SummaryCard
          label="Monthly Savings"
          value={formatMoneyCompact(summary?.savings ?? 0)}
          bg="bg-indigo-50"
          text="text-indigo-700"
        />
      </div>

      {/* Snapshot info */}
      {snapshot && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
                Latest Snapshot
              </h2>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                Snapshot #{snapshot.id}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {formatDate(snapshot.period_start)} &mdash; {formatDate(snapshot.period_end)}
                <span className="ml-3 text-slate-400">|</span>
                <span className="ml-3">{snapshot.row_count?.toLocaleString() ?? 0} rows</span>
                <span className="ml-3 text-slate-400">|</span>
                <span className="ml-3 capitalize">{snapshot.status}</span>
              </p>
            </div>
            <button
              disabled
              className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-400 cursor-not-allowed"
            >
              Sync from DataBridge
            </button>
          </div>
        </div>
      )}

      {/* Action summary */}
      {summary && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* By Type */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Actions by Type
            </h3>
            <div className="space-y-2">
              {Object.entries(summary.byType)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{formatActionType(type)}</span>
                    <span className="text-sm font-semibold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* By Priority */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Actions by Priority
            </h3>
            <div className="space-y-2">
              {Object.entries(summary.byPriority)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([priority, count]) => (
                  <div key={priority} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{priority.toUpperCase()}</span>
                    <PriorityBadge priority={priority} count={count} />
                  </div>
                ))}
            </div>
          </div>

          {/* By Channel */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Actions by Channel
            </h3>
            <div className="space-y-2">
              {Object.entries(summary.byChannel)
                .sort(([, a], [, b]) => b - a)
                .map(([channel, count]) => (
                  <div key={channel} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{channel}</span>
                    <span className="text-sm font-semibold text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-full">
                      {count}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Category Performance */}
      {categories.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Category Performance
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Category</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Spend</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Sales</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600">ACOS</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Orders</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.category} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{cat.category}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">{formatMoney(cat.spend)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">{formatMoney(cat.sales)}</td>
                    <td className={`py-2.5 px-3 text-right font-medium ${acosColor(cat.acos)}`}>
                      {formatPercent(cat.acos)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700">{cat.orders.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helper components ──────────────────────────────────

function SummaryCard({
  label,
  value,
  bg,
  text,
}: {
  label: string;
  value: string;
  bg: string;
  text: string;
}) {
  return (
    <div className={`${bg} rounded-lg border border-slate-200 shadow-sm p-5`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${text}`}>{value}</p>
    </div>
  );
}

function PriorityBadge({ priority, count }: { priority: string; count: number }) {
  const colors: Record<string, string> = {
    p1: 'bg-rose-100 text-rose-700',
    p2: 'bg-amber-100 text-amber-700',
    p3: 'bg-slate-100 text-slate-700',
  };
  const cls = colors[priority.toLowerCase()] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {count}
    </span>
  );
}

function formatActionType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
