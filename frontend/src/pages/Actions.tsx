import { useEffect, useState, useCallback } from 'react';
import {
  fetchLatestSnapshot,
  fetchActions,
  fetchActionSummary,
  patchActionStatus,
  executeAction,
  executeBulkActions,
} from '../lib/api';
import type { Snapshot, Action, ActionSummary } from '../lib/api';

const API_EXECUTABLE_TYPES = ['negative_add', 'campaign_pause', 'negative_asin_add'];
import { formatMoney } from '../lib/format';

const PAGE_SIZE = 50;

export default function Actions() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [summary, setSummary] = useState<ActionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [channel, setChannel] = useState('');
  const [priority, setPriority] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');

  // Pagination
  const [page, setPage] = useState(0);

  // Load snapshot once
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const snap = await fetchLatestSnapshot();
        if (cancelled) return;
        setSnapshot(snap);
        const sum = await fetchActionSummary(snap.id);
        if (!cancelled) setSummary(sum);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load');
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Load actions when filters or snapshot change
  const loadActions = useCallback(async () => {
    if (!snapshot) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (channel) params.channel = channel;
      if (priority) params.priority = priority;
      if (type) params.type = type;
      if (status) params.status = status;
      const data = await fetchActions(snapshot.id, params);
      setActions(data);
      setPage(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load actions');
    } finally {
      setLoading(false);
    }
  }, [snapshot, channel, priority, type, status]);

  useEffect(() => {
    loadActions();
  }, [loadActions]);

  // Status update
  async function handleStatusUpdate(actionId: number, newStatus: 'approved' | 'skipped') {
    try {
      await patchActionStatus(actionId, newStatus);
      setActions((prev) =>
        prev.map((a) => (a.id === actionId ? { ...a, status: newStatus } : a))
      );
    } catch {
      // Silently fail - could add toast
    }
  }

  // Execute single action via API
  const [executing, setExecuting] = useState<Set<number>>(new Set());

  async function handleExecute(actionId: number) {
    setExecuting(prev => new Set(prev).add(actionId));
    try {
      const result = await executeAction(actionId);
      if (result.success) {
        setActions(prev => prev.map(a => a.id === actionId ? { ...a, status: 'applied' } : a));
      } else {
        alert(`Failed: ${result.message}`);
        loadActions();
      }
    } catch {
      alert('Execution failed');
    } finally {
      setExecuting(prev => { const s = new Set(prev); s.delete(actionId); return s; });
    }
  }

  // Bulk execute all approved API-executable actions
  async function handleBulkExecute() {
    const approved = actions.filter(
      a => a.status === 'approved' && API_EXECUTABLE_TYPES.includes(a.action_type)
    );
    if (!approved.length) return alert('No approved API-executable actions');
    if (!confirm(`Execute ${approved.length} actions via Amazon Ads API?`)) return;

    await executeBulkActions(approved.map(a => a.id));
    alert(`${approved.length} actions queued for execution`);
    setTimeout(loadActions, 3000);
  }

  // Bulk approve P1
  async function handleBulkApproveP1() {
    const p1Pending = actions.filter(
      (a) => a.priority.toLowerCase() === 'p1' && a.status === 'pending'
    );
    for (const action of p1Pending) {
      await handleStatusUpdate(action.id, 'approved');
    }
  }

  // Pagination
  const paged = actions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(actions.length / PAGE_SIZE);

  // Unique values for filters
  const channels = summary ? Object.keys(summary.byChannel) : [];
  const priorities = summary ? Object.keys(summary.byPriority) : [];
  const types = summary ? Object.keys(summary.byType) : [];

  if (error && !snapshot) {
    return (
      <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">{error}</div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Actions</h1>
        {summary && (
          <div className="text-sm text-slate-600">
            Total estimated savings:{' '}
            <span className="font-bold text-indigo-600">{formatMoney(summary.savings)}</span>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Channel"
          value={channel}
          onChange={setChannel}
          options={channels}
        />
        <FilterSelect
          label="Priority"
          value={priority}
          onChange={setPriority}
          options={priorities}
          formatLabel={(v) => v.toUpperCase()}
        />
        <FilterSelect
          label="Type"
          value={type}
          onChange={setType}
          options={types}
          formatLabel={formatActionType}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={['pending', 'approved', 'applied', 'skipped', 'rejected']}
          formatLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
        />
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleBulkApproveP1}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          >
            Approve All P1
          </button>
          <button
            onClick={handleBulkExecute}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
          >
            Execute Approved
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Priority</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Type</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Campaign</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Keyword/ASIN</th>
                    <th className="text-left py-3 px-4 font-semibold text-slate-600">Reason</th>
                    <th className="text-right py-3 px-4 font-semibold text-slate-600">Savings</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-600">Status</th>
                    <th className="text-center py-3 px-4 font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        No actions found
                      </td>
                    </tr>
                  ) : (
                    paged.map((action) => (
                      <tr
                        key={action.id}
                        className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <PriorityBadge priority={action.priority} />
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {formatActionType(action.action_type)}
                        </td>
                        <td className="py-3 px-4 text-slate-900 font-medium max-w-[200px] truncate">
                          {action.target_campaign || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-[180px] truncate">
                          {action.target_keyword || action.target_asin || '—'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-[220px] truncate">
                          {action.reason}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-700">
                          {formatMoney(parseFloat(action.estimated_monthly_savings) || 0)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <StatusBadge status={action.status} />
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {action.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleStatusUpdate(action.id, 'approved')}
                                  className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  title="Approve"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleStatusUpdate(action.id, 'skipped')}
                                  className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                  title="Skip"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </>
                            )}
                            {action.status === 'approved' && API_EXECUTABLE_TYPES.includes(action.action_type) && (
                              <button
                                onClick={() => handleExecute(action.id)}
                                disabled={executing.has(action.id)}
                                className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                                title="Execute via API"
                              >
                                {executing.has(action.id) ? (
                                  <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                  </svg>
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-sm text-slate-500">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, actions.length)} of{' '}
                  {actions.length}
                </p>
                <div className="flex gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Helper Components ──────────────────────────────────

function FilterSelect({
  label,
  value,
  onChange,
  options,
  formatLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  formatLabel?: (v: string) => string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
    >
      <option value="">All {label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {formatLabel ? formatLabel(opt) : opt}
        </option>
      ))}
    </select>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    p1: 'bg-rose-100 text-rose-700',
    p2: 'bg-amber-100 text-amber-700',
    p3: 'bg-slate-100 text-slate-700',
  };
  const cls = colors[priority.toLowerCase()] ?? 'bg-slate-100 text-slate-700';
  return (
    <span className={`text-xs font-bold px-2 py-1 rounded-full ${cls}`}>
      {priority.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    approved: 'bg-emerald-100 text-emerald-700',
    applied: 'bg-blue-100 text-blue-700',
    skipped: 'bg-amber-100 text-amber-700',
    rejected: 'bg-rose-100 text-rose-700',
  };
  const cls = colors[status] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatActionType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
