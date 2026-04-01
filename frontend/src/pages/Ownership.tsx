import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import type { Period } from '../lib/api';
import { formatMoney, formatPercent } from '../lib/format';

const PAGE_SIZE = 100;

const PERIODS: { value: Period; label: string }[] = [
  { value: 'L14', label: '14D' },
  { value: 'L30', label: '30D' },
  { value: 'L60', label: '60D' },
  { value: 'L90', label: '90D' },
];

interface Hero {
  asin: string;
  sku: string;
  campaignName: string;
  category: string;
  score: number;
  spend: number;
  sales: number;
  orders: number;
  clicks: number;
  acos: number;
  cvr: number;
}

interface OwnershipResult {
  keyword: string;
  hero: Hero | null;
  supporters: Array<{ asin: string; sku: string; score: number; spend: number; sales: number }>;
  excludes: number;
  totalCompetitors: number;
  isContested: boolean;
}

interface OwnershipResponse {
  totalKeywords: number;
  ownedKeywords: number;
  contestedKeywords: number;
  totalAsins: number;
  period: string;
  data: OwnershipResult[];
  total: number;
  limit: number;
  offset: number;
}

export default function Ownership() {
  const [period, setPeriod] = useState<Period>('L30');
  const [data, setData] = useState<OwnershipResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: resp } = await api.get<OwnershipResponse>('/v2/ownership', {
        params: { period, limit: PAGE_SIZE, offset, search },
      });
      setData(resp);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [period, offset, search]);

  useEffect(() => { load(); }, [load]);

  function handleSearch() {
    setSearch(searchInput);
    setOffset(0);
  }

  function toggleExpand(keyword: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(keyword) ? next.delete(keyword) : next.add(keyword);
      return next;
    });
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const currentPage = Math.floor(offset / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Ownership Matrix</h1>
        <PeriodSelector value={period} onChange={p => { setPeriod(p); setOffset(0); }} />
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Keywords" value={data.totalKeywords.toLocaleString()} />
          <SummaryCard label="Owned" value={data.ownedKeywords.toLocaleString()} color="text-emerald-700" bg="bg-emerald-50" />
          <SummaryCard label="Contested" value={data.contestedKeywords.toLocaleString()} color="text-amber-700" bg="bg-amber-50" />
          <SummaryCard label="Active ASINs" value={data.totalAsins.toLocaleString()} />
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search keywords, ASINs, categories..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        <button onClick={handleSearch} className="px-5 py-2.5 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700">
          Search
        </button>
      </div>

      {/* Error */}
      {error && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

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
                    <th className="w-8 py-3 px-2"></th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Keyword</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Hero ASIN</th>
                    <th className="text-left py-3 px-3 font-semibold text-slate-600">Category</th>
                    <th className="text-right py-3 px-3 font-semibold text-slate-600">Score</th>
                    <th className="text-right py-3 px-3 font-semibold text-slate-600">Spend</th>
                    <th className="text-right py-3 px-3 font-semibold text-slate-600">Sales</th>
                    <th className="text-right py-3 px-3 font-semibold text-slate-600">ACOS</th>
                    <th className="text-right py-3 px-3 font-semibold text-slate-600">Supporters</th>
                    <th className="text-right py-3 px-3 font-semibold text-slate-600">Competitors</th>
                    <th className="text-center py-3 px-3 font-semibold text-slate-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.data.map(row => (
                    <OwnershipRow
                      key={row.keyword}
                      row={row}
                      isExpanded={expanded.has(row.keyword)}
                      onToggle={() => toggleExpand(row.keyword)}
                    />
                  ))}
                  {data?.data.length === 0 && (
                    <tr><td colSpan={11} className="py-12 text-center text-slate-400">No results</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
                <p className="text-sm text-slate-500">
                  {offset + 1}–{Math.min(offset + PAGE_SIZE, data?.total || 0)} of {data?.total}
                </p>
                <div className="flex gap-2">
                  <button disabled={currentPage === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    Previous
                  </button>
                  <button disabled={currentPage >= totalPages - 1} onClick={() => setOffset(offset + PAGE_SIZE)}
                    className="px-3 py-1.5 rounded-md text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
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

// ── Row component (expandable for supporters) ────────

function OwnershipRow({ row, isExpanded, onToggle }: { row: OwnershipResult; isExpanded: boolean; onToggle: () => void }) {
  const h = row.hero;
  const hasDetails = row.supporters.length > 0;

  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={hasDetails ? onToggle : undefined}>
        <td className="py-2.5 px-2 text-center text-slate-400">
          {hasDetails && (isExpanded ? '▼' : '▶')}
        </td>
        <td className="py-2.5 px-3 font-medium text-slate-900">{row.keyword}</td>
        <td className="py-2.5 px-3 text-slate-700 font-mono text-xs">{h?.asin || '—'}</td>
        <td className="py-2.5 px-3 text-slate-600">{h?.category || '—'}</td>
        <td className="py-2.5 px-3 text-right text-slate-700">{h?.score.toFixed(2) || '—'}</td>
        <td className="py-2.5 px-3 text-right text-slate-700">{h ? formatMoney(h.spend) : '—'}</td>
        <td className="py-2.5 px-3 text-right text-slate-700">{h ? formatMoney(h.sales) : '—'}</td>
        <td className={`py-2.5 px-3 text-right font-medium ${h ? acosColor(h.acos) : 'text-slate-400'}`}>
          {h ? formatPercent(h.acos) : '—'}
        </td>
        <td className="py-2.5 px-3 text-right text-slate-700">{row.supporters.length}</td>
        <td className="py-2.5 px-3 text-right text-slate-700">{row.totalCompetitors}</td>
        <td className="py-2.5 px-3 text-center">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            row.isContested ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {row.isContested ? 'Contested' : 'Owned'}
          </span>
        </td>
      </tr>
      {/* Supporter detail rows */}
      {isExpanded && row.supporters.map(s => (
        <tr key={s.asin} className="bg-slate-50/50 border-b border-slate-100">
          <td></td>
          <td className="py-2 px-3 pl-8 text-xs text-slate-500">↳ Support</td>
          <td className="py-2 px-3 text-slate-500 font-mono text-xs">{s.asin}</td>
          <td className="py-2 px-3 text-xs text-slate-400">{s.sku}</td>
          <td className="py-2 px-3 text-right text-xs text-slate-500">{s.score.toFixed(2)}</td>
          <td className="py-2 px-3 text-right text-xs text-slate-500">{formatMoney(s.spend)}</td>
          <td className="py-2 px-3 text-right text-xs text-slate-500">{formatMoney(s.sales)}</td>
          <td colSpan={4}></td>
        </tr>
      ))}
    </>
  );
}

// ── Helpers ──────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex bg-slate-100 rounded-lg p-1 gap-0.5">
      {PERIODS.map(({ value: v, label }) => (
        <button key={v} onClick={() => onChange(v)}
          className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-all ${
            value === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-slate-900', bg = 'bg-white' }: { label: string; value: string; color?: string; bg?: string }) {
  return (
    <div className={`${bg} rounded-lg border border-slate-200 shadow-sm p-5`}>
      <p className="text-xs font-medium text-slate-500 uppercase">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

function acosColor(acos: number): string {
  if (acos > 30) return 'text-rose-600';
  if (acos < 20) return 'text-emerald-600';
  return 'text-amber-600';
}
