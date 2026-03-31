import { useEffect, useState } from 'react';
import { fetchHealth, fetchCategories, fetchLatestSnapshot } from '../lib/api';
import type { CategoryPerformance } from '../lib/api';
import { formatPercent } from '../lib/format';

interface HealthStatus {
  status: string;
  database: string;
}

export default function Settings() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [categories, setCategories] = useState<CategoryPerformance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [h, snap] = await Promise.all([fetchHealth(), fetchLatestSnapshot()]);
        if (cancelled) return;
        setHealth(h);
        const cats = await fetchCategories(snap.id);
        if (!cancelled) setCategories(cats);
      } catch {
        // Silently handle
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Static thresholds (readonly for now)
  const thresholds = [
    { key: 'min_orders', label: 'Min Orders', value: '3' },
    { key: 'min_clicks', label: 'Min Clicks', value: '20' },
    { key: 'min_spend', label: 'Min Spend ($)', value: '5.00' },
    { key: 'hero_ratio', label: 'Hero Ratio', value: '0.70' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* DataBridge Connection Status */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Connection Status
        </h2>
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              health?.database === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <div>
            <p className="text-sm font-medium text-slate-900">DataBridge Database</p>
            <p className="text-xs text-slate-500 mt-0.5">
              Status: {health?.database ?? 'unknown'} | API: {health?.status ?? 'unknown'}
            </p>
          </div>
        </div>
      </div>

      {/* Target ACOS by Category */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Target ACOS by Category
        </h2>
        {categories.length === 0 ? (
          <p className="text-sm text-slate-400">No categories available</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 px-3 font-semibold text-slate-600">Category</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Current ACOS</th>
                  <th className="text-right py-2.5 px-3 font-semibold text-slate-600">Target ACOS</th>
                  <th className="text-center py-2.5 px-3 font-semibold text-slate-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => {
                  const target = 25; // Default target for now
                  const isOver = cat.acos > target;
                  return (
                    <tr key={cat.category} className="border-b border-slate-100">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{cat.category}</td>
                      <td className={`py-2.5 px-3 text-right font-medium ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatPercent(cat.acos)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        {formatPercent(target)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                            isOver
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {isOver ? 'Over' : 'On Target'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Thresholds */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Threshold Values
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {thresholds.map((t) => (
            <div key={t.key} className="bg-slate-50 rounded-lg p-4">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {t.label}
              </p>
              <p className="text-lg font-bold text-slate-900 mt-1">{t.value}</p>
              <p className="text-xs text-slate-400 mt-1">Read-only</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
