import { useEffect, useState } from 'react';
import { fetchBidPreview, applyBids } from '../lib/api';
import type { BidPreviewRow } from '../lib/api';
import { formatMoney, formatPercent } from '../lib/format';

export default function Bids() {
  const [rows, setRows] = useState<BidPreviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [days, setDays] = useState(14);
  const [result, setResult] = useState('');

  useEffect(() => {
    load();
  }, [days]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchBidPreview(days);
      setRows(data || []);
      setSelected(new Set((data || []).map(r => r.keywordId)));
    } catch (err: any) {
      setError(err.message || 'Failed to load bid preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!selected.size) return;
    setApplying(true);
    setResult('');
    try {
      await applyBids(Array.from(selected));
      setResult(`Applied ${selected.size} bid changes. Processing in background.`);
    } catch (err: any) {
      setResult('Error: ' + (err.message || 'Failed to apply'));
    } finally {
      setApplying(false);
    }
  }

  function toggleAll() {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(r => r.keywordId)));
    }
  }

  function toggleRow(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  if (error) {
    return <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">{error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bid Optimizer</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {rows.length} keywords with recommended bid changes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value={7}>7 day lookback</option>
            <option value={14}>14 day lookback</option>
            <option value={30}>30 day lookback</option>
          </select>
          <button
            onClick={handleApply}
            disabled={applying || !selected.size}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying ? 'Applying...' : `Apply ${selected.size} Changes`}
          </button>
        </div>
      </div>

      {result && (
        <div className={`px-4 py-3 rounded-lg text-sm ${result.startsWith('Error') ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {result}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-12 text-center text-slate-500">
          No bid changes recommended for the selected period.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2.5 px-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === rows.length}
                      onChange={toggleAll}
                      className="rounded border-slate-300"
                    />
                  </th>
                  <Th align="left">Keyword</Th>
                  <Th align="left">Campaign</Th>
                  <Th>Match</Th>
                  <Th>Clicks</Th>
                  <Th>Spend</Th>
                  <Th>Sales</Th>
                  <Th>ACOS</Th>
                  <Th>Target</Th>
                  <Th>Current</Th>
                  <Th>Optimal</Th>
                  <Th>Change</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.keywordId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={selected.has(r.keywordId)}
                        onChange={() => toggleRow(r.keywordId)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-900 max-w-[200px] truncate" title={r.keywordText}>
                      {r.keywordText}
                    </td>
                    <td className="py-2 px-3 text-slate-600 max-w-[180px] truncate" title={r.campaignName}>
                      {r.campaignName}
                    </td>
                    <Td><MatchBadge type={r.matchType} /></Td>
                    <Td>{r.clicks}</Td>
                    <Td>{formatMoney(r.spend)}</Td>
                    <Td>{formatMoney(r.sales)}</Td>
                    <Td className={acosColor(r.acos)}>{formatPercent(r.acos)}</Td>
                    <Td>{formatPercent(r.targetAcos)}</Td>
                    <Td>{formatMoney(r.currentBid)}</Td>
                    <Td className="font-semibold">{formatMoney(r.cappedBid)}</Td>
                    <Td>
                      <span className={`font-medium ${r.changePercent > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {r.changePercent > 0 ? '+' : ''}{r.changePercent.toFixed(1)}%
                      </span>
                    </Td>
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

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-2.5 px-3 font-semibold text-slate-600 text-${align} whitespace-nowrap`}>
      {children}
    </th>
  );
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`py-2 px-3 text-right text-slate-700 whitespace-nowrap ${className}`}>
      {children}
    </td>
  );
}

function MatchBadge({ type }: { type: string }) {
  const label = type?.replace('_', ' ') || type;
  return (
    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
      {label}
    </span>
  );
}

function acosColor(acos: number): string {
  if (acos > 30) return 'font-medium text-rose-600';
  if (acos < 20) return 'font-medium text-emerald-600';
  return 'font-medium text-amber-600';
}
